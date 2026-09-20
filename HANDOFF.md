# HANDOFF — SkillBridge

**As of 2026-09-19.** Supersedes every earlier version. Read `CLAUDE.md` first
(enforceable rules and traps), then this, then `FEATURES.md` for scope and cut
order and `DATA-MODEL.md` for the schema.

Demo **2026-09-20**. Budget USD 150 credit, single region `ap-northeast-1`,
account `975585942816`, profile `skillbridge`.

---

## 0. Next session — the work queue

**§1 is done. Everything is deployed and the app is live at
`https://master.d20i2hklonrt3y.amplifyapp.com`.** See "Deployment, as built"
below for what actually happened, which differs from §1's runbook in two
important ways.

1. **`ALLOWED_ORIGINS` on the voice service is still `http://localhost:3000`.**
   The upgrade handler checks `Origin` before reading a frame, so **every
   browser socket from the Amplify domain is refused with 403 today**. Redeploy
   compute with the domain before anything voice-related is demoed:
   `npx cdk deploy skillbridge-compute -c voiceImageTag=9da1be7
   -c allowedOrigins=https://master.d20i2hklonrt3y.amplifyapp.com,http://localhost:3000`
   That redeploy is also what finally verifies the Sarvam secret injection —
   `/voice/config` reporting `configured: true` proves nothing, it is only
   `Boolean(apiKey)` and would be true for a whole JSON document too. Verify
   with a deployed smoke run:
   `npx tsx services/voice/scripts/voice-smoke.ts --lang hi-IN
   --url wss://psg46fm6mi.ap-northeast-1.awsapprunner.com/voice/stream
   --origin https://master.d20i2hklonrt3y.amplifyapp.com`
2. **Latency on the voice turn.** A local smoke run answered correctly but first
   audio came out **12.1 s** after the question started, ~5.9 s after button
   release. That is a long silence in the demo's key moment. Measure it deployed
   before deciding whether to chase it.
3. **Optimize the three.js viewer** → §2. Keep the feature, make it mobile-safe.
   Not a removal.
4. **Rehearse the demo script and close its gaps** → §3. Two of its seven beats
   are not buildable as written today.
5. **machine-twin** → §5. Unchanged, deferred to a later session by decision.

---

## 0a. Deployment, as built — and the two things §1 got wrong

Both stacks are deployed. `skillbridge-voice` is `RUNNING` on App Runner at
`psg46fm6mi.ap-northeast-1.awsapprunner.com`; the web tier is an Amplify
`WEB_COMPUTE` app, `d20i2hklonrt3y`, branch `master`.

**App Runner eligibility is proven, not assumed.** `CreateService` succeeded on
this account. The ECS Express Mode contingency in BACKEND.md §3 is not needed.

**The voice loop works end to end.** A mic-less smoke run put a Hindi question
in and got a Hindi answer back with English technical terms preserved
(`internal leak`, `piston seal`, `directional control valve`), `grounded: true`
from the org KB, and 74 audio frames from `bulbul:v3:stream`. The image builds,
boots, serves `/healthz`, and its upgrade handler 403s both a foreign `Origin`
and a missing one in production.

**§1's runbook step 5 is wrong and the mistake is expensive.** It says to deploy
web and then run `deploy-web.mjs`. That path cannot work:

> **Amplify Hosting does not support manual deploys for server-side rendered
> apps.** `CreateDeployment` uploads the bundle, deploys only
> `.amplify-hosting/static`, ignores the compute primitive entirely, and
> **still reports SUCCEED**. Every route then falls through to the static
> primitive: `/` returns 404 from S3, everything else 301s to a trailing slash,
> and the Amplify console shows a healthy deployment throughout.

Three real deployments confirmed it, the last with the branch framework forced
to `Next.js - SSR`. `deploy-web.mjs` now refuses to run for exactly this reason
— running it against the working app would replace it with a broken one and
print a green log. `--bundle-only` still works.

The web tier therefore builds **from the connected repository**. The costs the
old design avoided are now paid: a GitHub PAT in Secrets Manager (`github-amplify`,
JSON key `GithubAmplifyToken`, reaching the template only as a `{{resolve:}}`
dynamic reference), an inline `buildSpec` with `appRoot: web`, and
`AMPLIFY_MONOREPO_APP_ROOT`. `WEB_BRANCH` moved from `main` to `master` because
it is a real git ref now.

**Next.js 16.3.5 works on Amplify Hosting compute.** AWS documents support as
"12 through 15" — that is stale. Verified on the deployed app: `/` server-side
307s to `/welcome`, `/login` is 200, and `/api/me` returns a real
`401 {"error":"Missing authentication token"}` from the SSR compute. App
environment variables do reach the build: the Cognito pool id is inlined in the
client bundle, contradicting §1's "expected failure mode" about `APP_TABLE_NAME`.

**Three ordering traps, in the order they will bite again:**

- **A manually deployed branch blocks connecting a repository.** Amplify refuses
  with "Cannot connect your app to repository while manually deployed branch
  still exists", and CloudFormation cannot resolve it alone: `BranchName` is
  create-only, so CFN creates the new branch before deleting the old one, and
  the App update runs first. Delete the branch out of band, then deploy.
- **`enableAutoBuild` triggers on push, not on branch creation.** A freshly
  connected branch has `activeJobId: null` and zero jobs, and the domain serves
  Amplify's placeholder page — which looks like a broken deploy. Kick the first
  build with `aws amplify start-job --job-type RELEASE`.
- **`Compress-Archive` writes Windows path separators into zip entry names.**
  The ZIP spec requires `/`. Only relevant to `--bundle-only` now, but
  `deploy-web.mjs` asserts POSIX entries rather than trusting it.

**Done this session — vendor branding fully removed, client and server:**

- `b283eff` — all client-side references gone. `web/src` and `web/public` are
  clean.
- `d4a909d` — `seed-content.mjs` no longer appends the attribution footer to
  document bodies, the `DOC#` `source` attribute is now `reference-corpus`, and
  a `scrub()` step neutralises inline brand mentions in the source prose
  (substitution, not deletion — removing the words leaves sentences
  ungrammatical, and broken prose embeds worse than clean prose).
- **The KB was rebuilt from scratch:** S3 prefix emptied → ingestion run that
  deleted all 40 vectors → `DOC#` items removed → re-seeded. Now **60 documents
  indexed, 0 failed**. Re-running after adding `scrub()` re-indexed exactly
  **1** document, which is the confirmation it touched only what it should.
- Verified: all 60 S3 objects free of vendor references, all 60 `DOC#` items
  carry `source=reference-corpus`, and retrieval in **English and Hindi**
  returns relevant chunks with **zero** vendor mentions. The Hindi probe used
  was the demo script's own line, *"पंप चालू करने से पहले क्या चेक करूं?"*

Attribution now lives solely in `README.md` (owner-handled). The only remaining
occurrence anywhere is the on-disk path `reference/LunchboxSessions-Data/` —
the actual gitignored directory name, referenced by nothing that ships. Rename
the directory if you want that gone too.

---

## 1. Deployment — compute and web

Nothing is deployed yet. The account holds four stacks; `skillbridge-compute`
and `skillbridge-web` have **never** been created.

| Stack | Status |
| --- | --- |
| `skillbridge-security` / `data` / `auth` | CREATE_COMPLETE |
| `skillbridge-ai` | UPDATE_COMPLETE |
| `skillbridge-compute` | **not deployed** |
| `skillbridge-web` | **not deployed** |

Everything verified so far ran on `next build` + `next start` at
`127.0.0.1:3100` against the **live** Cognito pool, DynamoDB table and Bedrock
KB. The backend is real; only hosting is local.

### Runbook, in order

**1. Confirm the secret and its ARN.** Never print the value; reference it by
ARN. `SARVAM_API_KEY` is the only vendor key in the system and must reach the
service only as an App Runner secret reference — never in `apprunner.yaml`, the
Dockerfile, CDK source, a committed `.env`, or any `NEXT_PUBLIC_*` var.

**2. Build and push the voice image to ECR.** `compute-stack.ts` already defines
the repo; no image has ever been pushed. Tag deliberately — the tag is a CDK
context value, not `latest`.

```
aws ecr get-login-password --region ap-northeast-1 | docker login --username AWS --password-stdin <acct>.dkr.ecr.ap-northeast-1.amazonaws.com
docker build -t skillbridge-voice:<tag> services/voice
docker tag  skillbridge-voice:<tag> <repo-uri>:<tag>
docker push <repo-uri>:<tag>
```

**3. Deploy compute.** The App Runner service is gated on an image existing:

```
cd infra && npx cdk deploy skillbridge-compute -c voiceImageTag=<tag>
```

When adding the service, set `VOICE_MODEL_ID` from `MODELS.voiceOrchestrator`.
`services/voice/src/config.ts` silently falls back to a hardcoded profile id
while compute-stack pins IAM to whatever `MODELS` says — the drift surfaces as
an AccessDenied that reads like a permissions problem, not a config one.

> **App Runner eligibility is still unproven.** AWS closed it to new customers
> on 2026-04-30 and this account has never created a service. List and describe
> calls answer normally; **`CreateService` is the real test.** If it is refused,
> switch to ECS Express Mode — the IAM contingency is written out in
> BACKEND.md §3. Find this out *early*, not at hour 20.

**4. Smoke-test the voice service on its own**, before any web work. It is the
only separately deployable backend, so it gets tested independently:

```
npx tsx services/voice/scripts/voice-smoke.ts --lang hi-IN --url wss://<apprunner-host>/voice/stream
```

That script is the mic-less harness VOICE.md prescribes — it synthesises the
question with Sarvam TTS, resamples to 16 kHz and feeds it in 50 ms frames at
wall-clock speed, which is the only way to exercise "audio still arriving while
the model is answering" rather than assert it. **This will be the first time the
voice loop has ever run deployed.** Budget real time for it.

Also confirm `config.allowedOrigins` includes the Amplify domain — the upgrade
handler checks `Origin` before reading a frame, so a missing entry rejects every
browser socket while `curl` still works.

**5. Deploy web**, passing the App Runner URL so the browser can find the socket:

```
npx cdk deploy skillbridge-web -c voiceServiceUrl=https://<id>.ap-northeast-1.awsapprunner.com
node infra/scripts/deploy-web.mjs
```

`NEXT_PUBLIC_VOICE_URL` is declared in `web-stack.ts` and is empty until this is
passed. **Never set it in the Amplify console** — `CfnApp` replaces the whole
environment-variable list on update, so a console value is wiped by the next
`cdk deploy` with no diff to show for it.

`deploy-web.mjs` has never been run. Its bundle assembly *was* validated (5.7 MB,
server boots, `/api/me` → 401) but the upload path was not. `--bundle-only`
validates without touching AWS.

**6. Seed and verify on the deployed URL.** Re-run
`node infra/scripts/seed-demo.mjs --email <user>` against the deployed
environment, then walk §3's script end to end on a real phone.

### Expected failure modes, in likelihood order

- **`CreateService` refused** → ECS Express Mode (BACKEND.md §3).
- **`APP_TABLE_NAME` resolves to `''` on first deploy.** Amplify env vars are
  not visible to Next server components by default; declaring them in
  `web-stack.ts` is necessary but may not be sufficient.
- **Amplify SSR compute role missing or ungranted** → every server route fails
  with AccessDenied. The reflex fix is a hand-attached console policy; do not —
  fix it in `web-stack.ts` so it survives.
- **Origin rejection on the websocket** (see step 4).
- **Voice image missing a runtime dep** — the image has never been built.

---

## 2. three.js — optimize, do not remove

**Decision: the exploded-pump viewer stays.** It is real, working functionality.
If it cannot be made lag-free on a mid-range phone, replace the *implementation*
(vanilla WebGL, a pre-baked GLB through `machine-viewer.tsx`, or a sprite/video
fallback) — never the feature.

This supersedes the earlier CLAUDE.md-driven note that three.js should be
deleted outright.

### What is actually there

`web/src/components/viewer/exploded-pump-3d.tsx`, 992 lines, reached from
`interactive-simulation.tsx` when `config.type === 'exploded-pump-3d'` (one
lesson in `curriculum.ts`). The whole pump is **built procedurally at runtime** —
there is no GLB.

Measured:

| Signal | Value | Why it matters on mobile |
| --- | --- | --- |
| `new THREE.Mesh` calls | **54** | 54 draw calls, no instancing, no merging |
| Geometries at 36–40 radial segments | **10+** | Far more tessellation than a phone needs |
| Lights | **5** (ambient + 4 directional) | Per-light cost across every material |
| `shadowMap.enabled` | **true**, `PCFSoftShadowMap` | Softest and most expensive shadow type |
| `antialias` | **true** | MSAA on a high-DPI phone is a real cost |
| `setPixelRatio` | `min(dpr, 2)` | 2× on a 3× phone is still 4× the fragments of 1× |
| Animation loop | unconditional `requestAnimationFrame` | Runs while offscreen and in a hidden tab |
| Cleanup | `cancelAnimationFrame` + `renderer.dispose()` only | **Geometries, materials and the CanvasTexture are never disposed** |
| Import | **static** in `interactive-simulation.tsx` | three.js ships to *every* user |

> **DONE, 2026-09-20.** All six items are implemented and verified on the
> deployed app: lazy-loaded behind `next/dynamic` (`ef2aebe`); loop paused
> offscreen and in hidden tabs, geometries/materials/textures disposed and the
> context released with `forceContextLoss()`, and mobile drops antialiasing,
> caps pixel ratio at 1.5 and turns shadows off (`807153c`); 35 segment counts
> reduced and the static housing baked from 15 meshes to 3 draw calls
> (`97dae6b`). Explode, spin, part selection and every callout verified
> unchanged against a before/after render. Nothing further is mergeable —
> every other group moves independently.

### Optimization order — cheapest and highest-value first

1. **Lazy-load it.** The single biggest win and it costs nothing visually.
   three.js is roughly 600 KB minified and currently lands in the main bundle
   for every worker, including the 2D/accessibility path and everyone who never
   opens that one lesson. Move it behind a dynamic `import()` exactly as
   `machine-viewer.tsx` already does for `@google/model-viewer` — that pattern
   is established and CLAUDE.md-sanctioned.
2. **Pause when not visible.** `IntersectionObserver` to stop the loop offscreen,
   `visibilitychange` to stop it in a background tab. A phone currently renders
   54 draw calls while the user reads the SOP checklist below it, which is pure
   battery.
3. **Dispose properly on unmount.** Walk the scene and dispose every geometry,
   material and texture. Today each mount/unmount leaks all 54 geometries plus
   materials plus the generated `CanvasTexture`; navigating between lessons a
   few times is enough to matter.
4. **Cut the fragment cost.** `setPixelRatio(min(dpr, 1.5))` on mobile,
   `antialias: false` below some width, and **shadows off on mobile** —
   `PCFSoftShadowMap` with a directional light is the most expensive thing in
   the scene and contributes least on a 6-inch screen.
5. **Cut the vertex/draw cost.** Drop radial segments from 36–40 to 16–24 (on a
   pump body at phone size this is invisible), and merge the static
   non-exploding meshes into a single buffer geometry. 54 → roughly 15 draw
   calls is achievable without changing the look.
6. **Then measure.** Chrome DevTools remote-debugging a real mid-range Android,
   not a desktop throttle profile. Target a steady 30 fps while exploding.

### Decide only after step 6

If it still cannot hold 30 fps: pre-bake the pump to a Draco-compressed GLB and
render it through `machine-viewer.tsx`, which already gives Draco, KTX2, LOD and
the `prefer2D` poster path for free — and which is the component CLAUDE.md says
all 3D must go through. The exploded animation becomes a morph or a simple
per-part transform. Same feature, a fraction of the runtime cost.

`machine-viewer.tsx` is currently used by **no page**, so this route also
reconnects the component the architecture was designed around.

---

## 3. The demo script, and whether the app can do it

The rule is right: **the live demo never touches anything outside the script.**
Here is the script scored against the code as it stands.

| # | Beat | State | Verdict |
| --- | --- | --- | --- |
| 1 | Admin uploads 3 real SOP PDFs | **No upload route, no UI.** KB ingestion is script-only (`seed-content.mjs`) | **Not buildable as written** |
| 2 | Invites a worker; **SMS arrives on a phone on stage** | Invite is created and stored; **nothing is sent.** No SNS, no publish, no Cognito message | **Not buildable as written** |
| 3 | Worker logs in on a phone, sees their plan | Works — verified live | Needs a deployed URL (§1) |
| 4 | Asks in Hindi; tutor answers in Hindi, English technical terms, cites the SOP | Answer path implemented; **citation badge now rendered** (`3bc0fb4`) | **Ready** |
| 5 | Asks something the SOPs do not cover; tutor refuses safely | **Genuinely implemented** — see below | Needs §1 only |
| 6 | Worker takes a test, gets a score and feedback | Works — verified live, async scorer returns a real score | Ready |
| 7 | Manager dashboard updates: questions asked, skill gaps, who passed | Profiler chain **observed end to end**; skill gaps and pass rates real. No questions-asked counter exists | **Ready minus the "questions asked" line** |

### Beat 5 is your strongest moment and it is real

`services/voice/src/voice/coach.ts:36` instructs the tutor: *never invent a
torque value, pressure, setting, part number or procedure step; if the
procedures do not cover the question, say so plainly and tell them to check with
their supervisor.* When no sources are retrieved, the prompt additionally forces
the model to state that the guidance is general and defer to site procedure.
Technical terms are pinned to English in Latin letters by an explicit glossary
rule — exactly the behaviour the script claims. **This beat needs no new code.**

### The two beats that need work, with options

**Beat 1 — SOP upload.** Two honest paths:

- *Build it (≈ half a day):* a `POST /api/documents` route that puts the PDF at
  `org=<token-derived orgId>/docs/<docId>/<filename>` with
  `ServerSideEncryption: 'aws:kms'` **and** `SSEKMSKeyId: <org CMK>` — both, or
  the object silently lands under the shared key — writes a `DOC#` item, and
  starts a Bedrock ingestion job. Plus a small admin upload screen. The KB and
  its data source already exist and are ACTIVE, so this is the last mile, not a
  new subsystem.
- *Re-script it (free):* the admin **shows** the org's SOP library already
  ingested (60 documents, verified), and the upload is narrated rather than
  performed. Weaker, but honest and zero-risk.

**Beat 2 — SMS on stage.** Nothing sends a message today. Options:

- *Build it:* SNS publish (or AWS End User Messaging) on invite issue. **In
  India this is the risk-heaviest item in the whole demo** — transactional SMS
  needs DLT/sender-ID registration, and unregistered traffic is dropped rather
  than delayed. Do not discover this on stage.
- *Re-script it (recommended):* the admin issues the invite, the code and link
  appear on screen, and the worker opens that link on the phone. Same story, no
  carrier in the loop. If you want the phone moment, WhatsApp or a QR code of
  the invite link is far more reliable than SMS.

**Beat 4 — citation.** The turn already returns `grounded: boolean`, but
`AskPanel` does not render it. Showing a "From your company's SOP" badge when
`grounded` is true is a small change with a large demo payoff. A real document
name would need the retrieval result to carry it through.

**Beat 7 — OBSERVED END TO END on 2026-09-19.** The chain ran on its own from
the deployed voice smoke runs:

- `USER#<worker>` / `EVT#2026-09-19T13:11:58.388Z#…`, written off the turn path,
  `ttl` present as epoch seconds ~90 days out.
- `SKILLPROFILE#CURRENT`, `updatedAt` 13:12:58 — sixty seconds later, which is
  the fanout's 1-minute batching window — `eventsConsidered: 1`, and
  `weaknesses: ["hydraulic cylinder load-holding"]`, derived by the async model
  from the Hindi cylinder-drift question the smoke test asked.
- Four `SESSION#` items, one per channel, including the browser ones.

So voice turn → `EVT#` → stream → `EventStreamFanout` → `SkillProfilerQueue` →
`SkillProfilerWorker` → `SKILLPROFILE#CURRENT` all works.

**What does NOT exist is a questions-asked count.** `AGG#DEPT#dept-maint#2026-09`
carries `workerCount`, `assessmentsPassed`, `assessmentsFailed` and `skillGaps`
and nothing else, and the profiler writes the per-worker skill profile rather
than incrementing a query counter on the department rollup. The manager
dashboard makes no such claim — verified, there is no "questions asked" tile —
so nothing false is on screen. **Narrate skill gaps and pass rates; do not claim
"which questions workers asked".** Adding it would mean a counter on the
profiler's write path, not the read path.

The original note follows, kept because it names the pieces:

This needs the profiler chain to
have actually run: voice turn → `EVT#` item → stream → `EventStreamFanout` →
`SkillProfilerQueue` → `SkillProfilerWorker` → `AGG#DEPT#`. Every piece is
deployed and wired; **none of it has been observed end to end**, because it
needs live voice traffic, which needs §1. Run several voice turns during
rehearsal and confirm the aggregate moves. If it does not, the dashboard still
shows seeded skill gaps and pass rates — narrate those and drop the
"questions asked" claim rather than showing a stale number.

### Rehearsal checklist

- Run it **on the deployed URL, on the actual phone, on the actual network** —
  conference wifi included. Local-only verification has not exercised Amplify
  SSR, App Runner cold start, or a real mic.
- Have **two** signed-in browsers ready (worker, manager) so the dashboard beat
  does not require a live sign-in.
- Seed before every run: `node infra/scripts/seed-demo.mjs --email <user>`.
- Know the fallback for each beat before you need it.

> **Watch the JWKS trap during rehearsal.** If the demo machine changes network
> between runs, the cached Cognito verifier used to fail *every* sign-in with
> "Invalid or expired authentication token" on perfectly valid tokens. That is
> now handled — retrieval failures are told apart from token failures and the
> verifiers are dropped — but if you see a 503 from auth, that is what it is.

---

## 4. Current state

`master` is at **`b283eff`**, pushed, and contains all of `backend`, `voice` and
`frontend`. `origin/machine-twin` is the only unmerged branch (7 ahead, 1 behind).

### Verified in a browser against live AWS

Walked as all three roles on a production build — not asserted:

- Admin issues an invite → code lands in DynamoDB → the link opens activation.
- Worker signs in → `/` routes to `/plan` → real name, profession, skill level,
  **3/6** module progress from `/api/me` and `/api/plan`.
- Lesson screen renders the twin; tapping a component feeds the ask panel.
- Manager sees **14 workers, 78% pass rate** and four skill gaps from a single
  GetItem on the materialized aggregate — no fan-out.
- Every protected route redirects signed-out users to `/login`; a worker is
  refused `/api/aggregates`; all handlers reject unauthenticated requests.
- KB: **60/60 documents indexed** after the rebuild, retrieval verified in
  English and Hindi (Marathi verified before the rebuild).
- Assessment: attempt submitted `pending` with no client score → async scorer
  returns a real reasoning-based score.

Suites: web `tsc` clean, lint 0 errors (2 pre-existing warnings in the studio
page), build clean; infra 19/19 + `cdk synth`; voice 19/19.

### Degraded by design

Voice panel reports the tutor unreachable (correct until §1). Skill profile,
badges and opportunities are display-only fixtures with no route. Manager
per-worker roster and admin directory render as visibly cut. `lesson.assetId` is
null everywhere — no GLB exists (§5).

### Demo prerequisite

`node infra/scripts/seed-demo.mjs --email <user>` after creating any user
outside invite redemption. A Cognito account is not a SkillBridge worker: with
no `USER#<sub>` / `PROFILE` item, `/api/me` returns `{profile: null}` and every
screen greeting the worker by name renders blank.

---

## 5. machine-twin — deferred, unchanged

`origin/machine-twin` is **7 ahead, 1 behind**. Six of its commits are already
in master. What master lacks is one module:

```
machine_twin/pipeline/semantic/service.py    237 lines
machine_twin/pipeline/semantic/taxonomy.py   234 lines
machine_twin/tests/test_semantic.py          203 lines
machine_twin/api/app.py                       +42
machine_twin/schema/models.py                 +18
```

`pipeline/semantic/` is **M6: component classification and 3D hotspots** —
unlabelled geometry to named industrial parts with categories, confidence scores
and 3D anchor coordinates (`calculate_3d_hotspot`, `match_taxonomy`), plus a
taxonomy for hydraulic pumps, centrifugal pumps, induction motors and valve
blocks. That is what `MachineAsset.hotspots[]` needs. **Worth merging for this
module alone.**

**Blocker:** the pipeline has never produced a single artifact.
`storage/data/objects/` is empty; neither COLMAP nor Blender is installed; the
`geometry`/`vision` extras (torch, open3d, pycolmap — multi-gigabyte) are not
installed. Photographs → `.glb` is **unproven, not merely unrun**.
`fixtures/render_synthetic_machine.py` is the fastest route to a real input set
without a camera.

**Live-on-AWS option (researched, not recommended for this demo):** COLMAP
SfM+MVS is minutes-to-hours and wants a GPU; App Runner has no GPU option, so it
means ECS on EC2 G5/G6, AWS Batch with a GPU compute environment, or SageMaker
Processing — a new compute surface, plus S3→EventBridge/SQS→Batch orchestration,
plus moving SQLite job state to DynamoDB or Aurora Serverless. A g5.xlarge is
roughly USD 1/hour against a USD 150 credit.

**Browser/mobile latency is the easy half and is not the risk.** Content-hashed
GLB on S3 behind CloudFront, Draco geometry + KTX2/Basis textures (both native
to `@google/model-viewer`), LOD0/LOD1 — the pipeline already emits three LOD
levels. A well-compressed pump lands in low single-digit MB, fine on mid-range
Android over 4G, and `prefer2D` already covers `saveData`/2g and accessibility
mode. **Reconstruction is the latency problem; viewing is not.**

**Recommended:** merge for the semantic module, produce one or two GLBs offline,
upload to the assets bucket as
`models/<assetId>/{model.glb,lod1.glb,poster.webp}`, write
`ORG#<orgId>`/`ASSET#<assetId>` with `glbUrl`/`posterUrl`/`hotspots[]`, set
`lesson.assetId`, and fold it into `seed-demo.mjs`. Cap at one or two models.
Never append a cache-buster — `public/sw.js` caches those extensions cache-first
with no expiry.

---

## 6. AWS services and technologies

**Deployed:** DynamoDB (single table, GSI1 + GSI2, Streams, TTL, PITR) ·
Cognito (pool `ap-northeast-1_mVCiV8Voi`, 3 role groups, 7 custom attributes,
self-signup off) · S3 (org-docs with `org=<orgId>/docs/` prefix isolation,
assets) · **S3 Vectors** (`skillbridge-vectors`) · KMS (shared
`alias/skillbridge-data` + per-org CMK) · Bedrock (Claude Haiku 4.5 voice,
Claude Sonnet 4.6 ×3 async, Cohere `embed-multilingual-v3` 1024-dim, all via
`jp.` inference profiles) · Bedrock Knowledge Bases (`5UYTEWBJ7K`, data source
`EFWNVWUMIM`, 60 documents) · Lambda ×4 · SQS ×3 + DLQ · IAM (4 per-agent roles,
`voiceOrchestratorRole` read-only) · CloudFormation/CDK.

**Ready to deploy:** ECR (no image pushed) · App Runner (eligibility unproven) ·
Amplify Hosting (`WEB_COMPUTE`) · **Secrets Manager — `SARVAM_API_KEY` now
created.**

**Non-AWS:** Sarvam AI (`saaras:v3-realtime` STT, `bulbul:v3` TTS) — the only
vendor key in the system.

**Deliberately unused:** AgentCore Gateway/Identity/Cedar (cut — nothing on the
spine passes through a Gateway; say it on stage as architected-for), AgentCore
Memory and Evaluations, Rekognition, Amazon Connect, Stripe/Marketplace, any
second region.

**App stack:** Next.js 16.3.5 (App Router, React 19), TypeScript, Tailwind v4,
three.js, `@google/model-viewer`, `aws-jwt-verify`, `aws-amplify`, Zod, Node 22,
Python 3.12 + FastAPI + COLMAP + Blender (machine-twin, local only).

---

## 7. Operational facts that cost time to rediscover

- **`aws` is not on PATH** for spawned shells:
  `/c/Users/nagwa/AppData/Local/Programs/Amazon/AWSCLIV2/aws.exe`.
- **Root access keys are deleted.** Everything resolves to `rishab-cli`, which
  has no IAM write and no billing. If a session expires:
  `aws login --profile skillbridge`.
- **Bedrock model access is account-level, not IAM.** Anthropic and Cohere both
  needed console enabling; the failure reads like an IAM bug but is a
  *Marketplace* denial. Both enabled.
- **Committed, idempotent scripts:** `infra/scripts/provision-org.mjs`,
  `seed-content.mjs`, `seed-demo.mjs`, `deploy-web.mjs` (`--bundle-only`),
  `web/scripts/dev-token.mjs`, `services/voice/scripts/voice-smoke.ts`.
- **Demo credentials** (`dev-token.mjs`): `demo-worker@skillbridge.test` /
  `Demoworkerpass1`; same pattern for `manager` and `admin`.
- **Verify with:** `cd infra && npm run build && npx cdk synth --quiet && npm test`
  · `cd web && npm run lint && npm run build` ·
  `cd services/voice && npm run typecheck && npm test`.

---

## 8. Traps already paid for — the ones that fail silently

- **`AMAZON_BEDROCK_TEXT`, not `AMAZON_BEDROCK_TEXT_CHUNK`.** Wrong reserved key
  in `nonFilterableMetadataKeys` → ingestion reports **COMPLETE** while failing
  every document over 2048 bytes. Most online examples give the wrong name.
- **JWKS caching.** `CognitoJwtVerifier` fetches keys once and holds them; a
  failed fetch made every later verification report "Invalid or expired
  authentication token" on valid tokens until restart. Now handled in `auth.ts`
  — retrieval failures are distinguished, verifiers dropped, caller gets a 503.
- **`requireSession()` throws, so it fails static prerendering.** Pages use
  `gatePage()` (redirects); route handlers use `requireSession`.
- **The dept aggregate needs two `UpdateItem`s.** DynamoDB rejects `ADD` on a
  nested map path whose parent does not exist, and rejects initialising the
  parent and adding to it in one expression.
- **TTL expiries appear in the stream** as `REMOVE` from
  `dynamodb.amazonaws.com`; the fanout filters to `INSERT` for that reason.
- **Cognito access tokens carry no `custom:*`.** Verify the **ID token**.
- **`keys.ts` is vendored into three places** and has drifted twice.
  `infra/test/vendored-keys.test.ts` fails on byte drift — trust it.
- **Amplify env vars are not visible to Next server components by default.**
  Declaring them in `web-stack.ts` is necessary but may not be sufficient.
- **`bulbul:v3` kills the entire reply** on a chunk it considers empty (`" "`,
  `"\n\n"`, `","`), and streamed model deltas emit exactly those. Gate every
  `sendText` on `speakable()`.
