# Handoff — AI Vocational Skilling Platform (First Commit Hackathon)

Planning/continuity doc, not project code. Written 2026-09-16 so the next chat session can kick off scaffolding without re-deriving context.

## Event

- First Commit Hackathon, Bharat Builds Tour, organized by WeMakeDevs x AWS.
- Runs 2026-09-17 through 2026-09-20. Dev window officially opens 2026-09-17 00:00 IST.
- Judging: Idea & Impact, Built on AWS, Execution.
- Budget: $150 AWS credit ($50 event + $100 personal). Sarvam AI: exclusive access, 1.5L INR/month, all models — not a budget constraint.

## Idea (one-liner)

AI-assisted, multilingual, audio-first vocational upskilling platform for India's blue-collar/NEET workforce — voice-first UI instead of text forms, multimodal assessment (voice + vision) instead of text-based testing.

## Problem statement (for the pitch)

- ~7.67 crore skilled since 2014-15; ₹34,000 crore skilling budget for 2025-26 — yet only 8.25% of graduates work in roles matching their qualification (NITI Aayog).
- Educated unemployment: 13% overall, 20.4% for female graduates.
- ~8.7 crore Indians aged 15-29 are NEET (Not in Education, Employment, or Training).
- Existing digital platforms (e.g. Skill India Digital Hub) assume textual/digital literacy the target demographic often lacks.

## Architecture decisions (locked as of 2026-09-16)

**Single region: `ap-northeast-1` (Tokyo) for everything** — Cognito, DynamoDB, S3, Amplify backend, Bedrock, AgentCore, Rekognition. Deliberately not splitting with `ap-south-1`: no service needs to be there, and splitting would add cross-region complexity (second `cdk bootstrap`, cross-region auth/state) for zero benefit at hackathon scale. India↔Tokyo baseline latency (~60-90ms) is imperceptible in a turn-based voice UX.

**Voice:** Amazon Nova 2 Sonic (bidirectional speech-to-speech streaming). Original Nova Sonic (gen 1) hit EOL 2026-09-14 — use Nova 2 Sonic only. ~$0.015/min blended. Model ID confirmed via `aws bedrock list-foundation-models --region ap-northeast-1` on 2026-09-17: **`amazon.nova-2-sonic-v1:0`**.

**Reasoning models (Bedrock, tiered by latency need):**
- **Claude Sonnet 5** ($2/$10 per M input/output tokens) — default for curriculum/RAG agent (vocational manual retrieval) and assessment scoring/feedback generation. Not in the real-time voice loop, so latency is less critical than quality.
- **Claude Haiku 4.5** ($1/$5 per M tokens) — narrowly for the real-time conversational orchestrator/tool-router that sits inside the live Nova Sonic voice loop, where per-request latency matters most.
- **Skip Claude Opus** (4.8 is current ceiling, no Opus 5 on Bedrock) — 5x Sonnet 5 cost, noticeably slower, not worth it for this workload in this timeframe.

**Orchestration:** AWS Strands Agents SDK (TypeScript) — reached GA in Q2 2026.

**AgentCore in Tokyo:** Gateway, Identity, Memory, Policy, and Evaluations all confirmed supported (verified directly in console/CLI 2026-09-16). Cedar-policy-based authorization on the Gateway is implementable, not just a pitch-deck aspiration.

**Speech/translation (Sarvam AI):** Saaras v3 (STT, code-mixed/verbatim mode for confidence analysis), Bulbul v3 (TTS, 11 languages), Mayura v1 (domain-specific translation), Sarvam-105B (optional secondary reasoning/RAG) — use freely, exclusive 1.5L/month credit.

**Vision:** Amazon Rekognition for PPE/hazard detection on submitted images.

**IaC:** AWS CDK (TypeScript), single bootstrap in `ap-northeast-1`.

**Frontend:** Next.js + TypeScript + Tailwind CSS + shadcn/ui + Framer Motion, Zod for validation, hosted on AWS Amplify Hosting (CI/CD from GitHub).

**Auth:** Amazon Cognito issuing JWTs consumed by AgentCore Gateway.

**State:** DynamoDB for session/progress tracking (async writes, off the critical voice-loop path).

## Scope strategy for the 4-day build

The full architecture is the pitch/vision. The actual build is one narrow end-to-end slice done well, demoed live:

1. Voice loop: mic → Nova 2 Sonic → Strands orchestrator (Haiku 4.5) → tool calls → Sarvam Saaras/Bulbul where code-mixed language handling is needed → response.
2. One multimodal assessment feature: Rekognition PPE/hazard check on a submitted image, scored + explained via Sonnet 5.
3. Curriculum RAG: a small Bedrock Knowledge Base over a handful of vocational manual docs, queried by Sonnet 5.

Cut or defer under time pressure, in this order: elaborate Cedar policy rules beyond basic Gateway JWT auth → multi-agent breadth beyond 2-3 agents → DynamoDB progress analytics beyond raw session logging. Be explicit in the demo/pitch about what's live vs. designed-for.

## Environment status (as of 2026-09-16, ~22:00 IST)

- AWS account created (root), IAM user created and AWS CLI configured with IAM user credentials (not root). `~/.aws/config` confirms `region = ap-northeast-1`, `output = json`.
- AWS Budget alerts set at 50% / 80% / 95% of $150.
- `cdk` CLI installed via npm, on PATH, confirmed working.
- **Unverified:** user ran `cdk bootstrap` in `ap-northeast-1` from the workspace root. Could not be independently confirmed in the assistant's tool shell this session — the `aws` CLI binary was not reachable from either PowerShell or Git Bash in that session (not on PATH, not at the standard install path), despite `~/.aws/config` existing correctly. Likely a PATH-propagation quirk specific to that shell, not necessarily a real problem — verify first thing next session.
- Amplify CLI: installed.
- Docker Desktop + WSL2: installed.
- Node.js, Git, GitHub account, `gh` CLI: installed/available.
- GitHub repo: **not created yet** — intentionally deferred. Given the hackathon's name ("First Commit"), avoid scaffolding actual project code before the official 2026-09-17 00:00 IST start; only environment/tooling setup happened before then.
- Sarvam AI: exclusive access confirmed, 1.5L INR/month, all models.

## Skeleton scaffolded 2026-09-17 (local only, not committed)

Event opened, local `git init` done at repo root (no remote yet — user creates the GitHub repo and makes the first commit themselves).

- `infra/` — CDK TypeScript app via `cdk init app --language typescript`. Blank stack in `infra/lib`, entry point `infra/bin`. Nothing deployed yet.
- `web/` — Next.js app via `create-next-app` (TypeScript, Tailwind v4, ESLint, App Router, `src/` dir, `@/*` import alias). Added `framer-motion` and `zod`. shadcn/ui initialized (`components.json`, `src/components/ui/button.tsx`, `src/lib/utils.ts`, base-nova preset).
- Root `.gitignore` added for repo-root-level files (`.env`, `.DS_Store`, editor dirs) — `infra/` and `web/` each keep their own tool-generated `.gitignore`.
- Nothing staged or committed — left for the user to review and commit as the actual first commit.

## Open items to verify at the start of next session

1. ~~Confirm `aws` CLI is reachable from a fresh terminal~~ — **Resolved 2026-09-17.** CLI is installed at `%LOCALAPPDATA%\Programs\Amazon\AWSCLIV2\aws.exe` and is on the persisted User PATH; it just wasn't picked up by shells spawned earlier in that session. A fresh terminal should have `aws` on PATH normally.
2. ~~Confirm the `CDKToolkit` stack exists and is `CREATE_COMPLETE`~~ — **Resolved 2026-09-17.** Verified `CREATE_COMPLETE` in `ap-northeast-1`.
3. **BLOCKED 2026-09-17:** Bedrock `InvokeModel` (tested against `anthropic.claude-sonnet-5` and `anthropic.claude-haiku-4-5-20251001-v1:0` in `ap-northeast-1`) returns `AccessDeniedException: Your account is currently being verified. Verification normally takes less than 2 hours... If still receiving this after more than 2 hours, write to aws-verification@amazon.com.` This is a **new-account identity/payment verification hold**, not a per-model access-request issue — `list-foundation-models` works fine and shows all target models in the catalog (Nova 2 Sonic, Nova 2 Lite/Pro/Lite/Micro/Canvas/Reel, Claude Sonnet 5, Claude Haiku 4.5, and others), so the models themselves are enabled; the account-level hold is what's blocking actual invocation. **Re-test `InvokeModel` first thing next session** — if still blocked after 2+ hours from account creation, email aws-verification@amazon.com.
4. Create the GitHub repo (event has started as of 2026-09-17) and make the actual first commit — **intentionally left to the user**, not automated by the assistant this session.

## Next steps (kickoff order for next session)

1. Create GitHub repo, `git init` locally, first commit = CDK + Next.js scaffold skeleton.
2. Scaffold CDK app (TypeScript) in `ap-northeast-1`: Cognito User Pool, DynamoDB table(s), S3 bucket, base IAM roles.
3. Scaffold Next.js app (Amplify-ready), wire up Cognito auth.
4. Stand up Bedrock AgentCore Gateway + Identity, wire Cognito JWT validation.
5. Build the Strands orchestrator agent (TypeScript) using Claude Haiku 4.5, deploy to AgentCore Runtime.
6. Wire the Nova 2 Sonic bidirectional voice stream from client → orchestrator.
7. Add Sarvam Saaras/Bulbul calls for code-mixed language handling where Nova Sonic's native coverage falls short.
8. Add the Rekognition PPE-detection tool + Sonnet 5 scoring for the multimodal assessment slice.
9. Add a minimal Bedrock Knowledge Base + S3 doc set for the curriculum RAG agent (Sonnet 5).
10. Wire DynamoDB session/progress writes (async, non-blocking on the voice loop).
11. Deploy frontend via Amplify Hosting, connect to GitHub for CI/CD.
12. Prep the pitch: be explicit about what's live vs. designed-for-but-not-built.
