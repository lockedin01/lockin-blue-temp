#!/usr/bin/env bash
#
# Run a full reconstruction from a folder of photographs.
#
#   scripts/reconstruct.sh <photo-dir> [project name]
#
# Creates a project, uploads every image in the folder, runs the reconstruct and
# author stages, and prints where the output landed.
#
# Failure here is informative, not fatal: a capture that does not register enough
# images stops at the coverage gate and prints what to re-shoot, which is the
# whole point of that gate. Photograph a full circle, roughly one frame every 10
# degrees, keeping the machine in frame throughout -- 15 degree steps measurably
# do not reconstruct.

set -euo pipefail

API="${MACHINE_TWIN_API:-http://127.0.0.1:8000}"
DIR="${1:-}"
NAME="${2:-Reconstruction $(date +%H:%M:%S)}"

if [[ -z "$DIR" || ! -d "$DIR" ]]; then
  echo "usage: scripts/reconstruct.sh <photo-dir> [project name]" >&2
  exit 64
fi

if ! curl -sf --max-time 5 "$API/health" >/dev/null; then
  echo "The engine is not responding at $API" >&2
  echo "Start it with:  make dev" >&2
  exit 69
fi

shopt -s nullglob nocaseglob
photos=("$DIR"/*.jpg "$DIR"/*.jpeg "$DIR"/*.png "$DIR"/*.heic)
shopt -u nocaseglob
if (( ${#photos[@]} == 0 )); then
  echo "No images found in $DIR" >&2
  exit 66
fi

echo "engine   $API"
echo "photos   ${#photos[@]} in $DIR"

# The capability report decides whether a mesh can be produced at all, so it is
# worth asking before spending a minute on feature matching.
mesh=$(curl -s "$API/capabilities" | python3 -c 'import json,sys;print(json.load(sys.stdin)["mesh_provider"] or "none")')
echo "mesh     $mesh"
if [[ "$mesh" == "none" ]]; then
  echo "No mesh backend available on this host. Run: make verify" >&2
  exit 69
fi

project=$(curl -s -X POST "$API/projects" -H 'content-type: application/json' \
  -d "$(python3 -c 'import json,sys;print(json.dumps({"name":sys.argv[1]}))' "$NAME")" \
  | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])')
echo "project  $project"

args=()
for f in "${photos[@]}"; do args+=(-F "files=@$f"); done
uploaded=$(curl -s -X POST "$API/projects/$project/assets" "${args[@]}" \
  | python3 -c 'import json,sys;print(len(json.load(sys.stdin)))')
echo "upload   $uploaded stored"
echo

# Each stage prints its own structured error. §28: a failed stage names a cause
# and a remediation, and the chain stops rather than fabricating an output.
run_stage() {
  local stage="$1"
  echo "--- $stage ---"
  local body code
  body=$(curl -s -w '\n%{http_code}' --max-time 3600 -X POST "$API/projects/$project/stages/$stage")
  code=$(tail -n1 <<<"$body")
  body=$(sed '$d' <<<"$body")

  if [[ "$code" != "200" ]]; then
    python3 - "$body" <<'PY'
import json, sys
try:
    d = json.loads(sys.argv[1]).get("detail", {})
except Exception:
    print(sys.argv[1][:400]); raise SystemExit(1)
message = d.get("message", "")
remediation = d.get("remediation", "")
print(f"  FAILED  {d.get('code','')}")
print(f"  {message}")
# The gates that reject an input outright use the recommendation as the message,
# so printing both would just say the same thing twice.
if remediation and remediation != message:
    print(f"\n  What to do: {remediation}")
PY
    exit 1
  fi

  python3 - "$body" <<'PY'
import json, sys
d = json.loads(sys.argv[1])
print(f"  state     {d['state']}  ({d.get('duration_s','-')}s)")
if d.get("coverage"):
    c = d["coverage"]
    print(f"  coverage  {c['status']}  {c['registered']}/{c['total']} registered")
    if c["status"] != "good":
        print(f"  note      {c['recommendation']}")
for a in d.get("lods", []):
    print(f"  lod {a['lod']}     {a['vertex_count']:>6} verts  {a['meta'].get('size_bytes',0):>9,} bytes")
for c in d.get("components", []):
    print(f"  part      {c['stable_id']}  {c['label']}  ({c['validation_status']})")
PY
  echo
}

run_stage reconstruct
run_stage author

echo "Output"
echo "  model   $API/projects/$project/model?lod=0"
echo "  small   $API/projects/$project/model?lod=2"
echo "  poster  $API/projects/$project/poster"
echo "  parts   $API/projects/$project/components"
echo "  jobs    $API/projects/$project/jobs"
