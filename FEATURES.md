# Features — AI Vocational Skilling SaaS

Finalized feature set as of 2026-09-17. Split into **BUILD** (what ships for the
hackathon demo, 2026-09-20) and **PITCH** (designed-for, presented as roadmap,
explicitly labelled as not-built on stage).

## Product in one line

Multi-tenant, voice-first, multilingual vocational upskilling SaaS for India's
non-agricultural blue-collar workforce. **Strictly B2B**: organizations subscribe
and onboard their workers, and there is no consumer/self-serve path — a worker
reaches the platform only through an employer. Learning plans are AI-curated per
profession and grounded in the organization's own private SOPs.

Free and paid tiers differentiate features, but **both are org-level tiers**; an
unaffiliated individual cannot use the product at all.

## Vertical focus (locked 2026-09-17)

The platform is profession-agnostic by design, but the **hackathon demo goes deep
on one vertical: the engineering industry — mechanical and electrical industrial
maintenance** (industrial electricians, hydraulics/mechanical maintenance
technicians, machine operators). Breadth across other blue-collar professions is
pitched, not demoed.

Rationale: it is the vertical where interactive 3D and schematic-based training
earns its cost, where org-specific SOPs matter most, and where a proven market
already exists (see competitive positioning below).

### Reference point — LunchBox Sessions (lunchboxsessions.com)

Industrial hydraulics/electrical troubleshooting training. 7 topics, 86 sessions,
977 materials, $29/month. Their real differentiator is **interactivity, not
video** — "live schematics" where the learner grabs controls, powers solenoids,
causes a pressure spike and observes the result, plus 3D videos, simulations,
workbooks, puzzles and quizzes.

**What we take:** interactive-over-passive as the content philosophy; the
clean, bite-sized session layout; troubleshooting as the organising skill.

**How we differ — and why it matters to this workforce:**

| | LunchBox Sessions | This platform |
| --- | --- | --- |
| Language | English only | Voice-first, Indian languages |
| Device | Desktop-first | Mobile PWA, low-end devices, low bandwidth |
| Content | Generic, publisher-authored | Grounded in the **organization's own SOPs** |
| Model | $29/mo individual subscription | B2B SaaS, sold to the employer |
| Interaction | Mouse/keyboard | Hands-free voice, for a worker holding tools |

We have acquired license for lunchbox code and content usage for the purpose of the hackathon.

## Roles

| role | scope |
| --- | --- |
| **Worker** | own learning plan, learning material, assessments, progress, badges/certificates |
| **Manager** (teacher) | learning plans, assessments, content + knowledge base management, aggregate team progress |
| **Admin** | org root: billing, all user management, division/department access provisioning |

Authorization is enforced by **Cedar policies on the AgentCore Gateway** — the
three roles are the policy subjects, not an app-level `if (role === …)` check.

---

# BUILD — hackathon scope

## 1. Identity, tenancy and provisioning

- Cognito-backed auth, three roles, Cedar-enforced.
- **One account path: org-provisioned.** A worker exists only as a member of an
  organization, inheriting profession, department, language defaults and assigned
  learning plan from it. There is no self-registration — no account can be created
  without an invite from an org admin.
- **Provisioning mechanism** (deliberately simple — this workforce largely does
  not have domain email):
  - **Email + SMS link/code — mandatory primary path.**
  - **Admin bulk-add — secondary option.**
  - Admin controls which **division/department** a set of workers is scoped to.
- Per-org data isolation is a hard boundary (see §9).

## 2. Worker onboarding journey

Collected at first run, drives everything downstream:
- **Preferred language** — from India's scheduled national languages.
- **Preferred learning mode** — speech-first or text-first.
- **Profession** (e.g. electrician, plumber, welder) + **skill level / what
  they're being trained for**.
- **Accessibility mode** toggle (see §10).

Org-provisioned workers skip whatever the org already set.

## 3. AI-curated learning plans

- The model **generates a structured learning plan/curriculum** from the declared
  profession + skill level, which then becomes the content the RAG layer serves
  from. (Chosen over retrieval-time personalization — more demoable, more legible.)
- **Managers can modify, extend and correct the plan and its source material.**
  This is required, not optional: most organizations run on internal SOPs and
  standards that are not public and that no model could generate on its own.
- **Default plan** generated when an org/worker supplies only a profession and no
  documents.

## 4. Per-organization knowledge base

- **One isolated KB per organization** — deliberately not a single shared KB
  across tenants. Two orgs with overlapping documentation must never see each
  other's content or receive each other's answers.
- Managers/admins upload their own documentation and SOPs as the KB source.
- **Warnings/alerts prompting managers to re-verify uploaded material** —
  incorrect source documentation in a safety-adjacent domain is a real failure
  mode, not a cosmetic one.
- **Rebuild-knowledge-base action** available to managers after content changes.

## 5. Voice-first tutoring loop

Reimplemented in our own backend service, using `voice-tutor/` as a **reference
implementation only** — not mounted or ported as a module (see HANDOFF.md
architecture pivot):

`mic → Sarvam Saaras v3-realtime (streaming STT) → Bedrock (Claude Haiku 4.5,
streamed) → Sarvam Bulbul v3 (streaming TTS) → speaker`

- Push-to-talk, answers in the language the worker actually spoke, technical terms
  preserved in English (code-switching, not calque translation).
- Grounded in the worker's org KB + assigned learning plan.
- Text-mode equivalent for workers who chose text-first.

## 6. Interactive 3D machine models

The visual medium of the platform. We cannot produce a video library in four days
— and interactive 3D is a stronger product than passive video anyway, which is
the lesson LunchBox's simulations teach.

- **Mobile-first 3D viewer in the PWA**, rendering machinery and machine parts
  (pumps, valves, motor starters, actuators) with exploded views and part
  isolation.
- **Library: Google `<model-viewer>`**, not full three.js/react-three-fiber —
  far smaller footprint, native GLB + Draco mesh compression + KTX2 texture
  compression, declarative hotspot annotations, free AR on Android. three.js is
  reserved for if/when true simulation behaviour is needed (see PITCH).
- **Performance budget is a hard constraint, not an aspiration.** Draco + KTX2
  compression, LOD, lazy-load per lesson, no model fetched until the lesson
  opens.
- **Automatic 2D fallback** on weak device or weak network: pre-rendered
  exploded-view stills and schematics instead of live 3D. **Accessibility mode
  defaults to the 2D path.**
- **Demo asset scope:** 1–2 pre-converted machine models. Ingesting an
  organization's own CAD is a pipeline problem, not a feature — see PITCH.

### 6a. Tap a part, ask about it — 3D × voice

The synthesis feature, and the demo moment. The worker **taps a component in the
3D model and asks a question out loud** — "why is this leaking", "what does this
valve do" — and the tutor answers about *that specific component*, grounded in
*that organization's* SOPs, in the worker's own language.

No existing player in this space does this: the incumbent is English-only,
desktop-first, mouse-driven and generic. This is the single clearest
differentiator to demo on stage.

## 7. Vertical learning formats (engineering maintenance)

- **Hands-free, voice-guided procedure walkthroughs** — lockout/tagout,
  maintenance and inspection SOPs, delivered step-by-step by voice with hazard
  callouts. Voice here is not only an accessibility affordance: on a shop floor
  the worker's hands are holding tools or dirty, so hands-free is an ergonomic
  requirement. Steps advance on voice command.
- **Fault-symptom diagnostic trainer** — the worker describes a symptom aloud
  ("motor hums but won't start", "cylinder drifts under load") and the tutor
  walks a structured diagnostic path grounded in the org's equipment and SOPs.
  This is troubleshooting-as-the-core-skill, the same organising principle as the
  reference product, but voice-first and org-specific. Implemented as a mode of
  the existing tutor loop, not a separate system.
- **Safety-first framing throughout** — hazard and risk callouts attached to
  procedures, matching safety/compliance being a top-cited skill gap for this
  workforce.

## 8. Assessments, progress and credentials

- **Text and voice based assessments** — image/vision-based assessment is
  deferred (see PITCH).
- **Vertical-native assessment formats**, which reuse assets the platform already
  has rather than adding new systems, and which beat generic multiple-choice:
  - **Identify the part** — tap the correct component in the 3D model or schematic
  - **Sequence the procedure** — put LOTO/maintenance steps in the correct order
  - **Diagnose by voice** — talk through the fault-finding path aloud, scored on
    reasoning rather than on a single final answer
- Scored and explained by Claude Sonnet 5.
- Progress tracked in DynamoDB (async writes, off the voice-loop critical path).
- **Badges** for all workers, on every org tier including the free tier.
- **First-90-days fast-track path** — a short, front-loaded onboarding learning
  path distinct from the main curriculum. Justified by data: roughly half of
  contract workers who quit do so within their first three months.

## 9. Security and data isolation

- **Encryption in transit and at rest**, with **per-organization isolation** so no
  organization can reach another's data.
- Per-org KMS key; per-org IAM/Cedar scoping so one tenant's compute path can
  never touch another tenant's key, bucket, KB or table partition.
- Access to org content is audit-logged.
- Every DynamoDB item, S3 object and KB entry carries an `orgId` in its key
  design. Because the product is strictly B2B, `orgId` is always present and never
  nullable — there is no sentinel case to handle.

> Note: true zero-knowledge encryption is incompatible with an AI that reads and
> answers from the documents — the model must see plaintext to build the KB and
> answer. The claim we make is isolation + encryption + auditability, not "we
> cannot see it."

## 10. Client experience, device and bandwidth reality

- **PWA** — installable, offline-capable shell, works on low-end devices.
- Built for **low network coverage**: minimal payloads, no heavy client-side
  processing, animation kept off the critical path.
- **Accessibility mode** — icon-forward, reduced text, larger type, for low
  textual/digital literacy.
- **Worker UI reads as a consumer app, not an institutional portal.** Research
  basis: this demographic's smartphone use centers on communication and
  entertainment, with low engagement on institution-style digital services.
  Dashboard/enterprise density is reserved for manager and admin roles.
- **Multilingual navigation**, not just multilingual tutoring.

## 11. Manager aggregate view

- Team/department level progress, assessment pass rates, skill gaps.
- Framed as a **retention instrument**, not just reporting — 78% of blue-collar
  turnover is unrelated to wages; growth opportunity and environment are the
  drivers. This is the org-side reason to buy.

## 12. Passive skill profiling (async sub-agent)

Assessment scores alone are a thin signal. The platform already sees far more:
every question a worker asks the tutor, what they re-ask, where they stall, which
lessons they repeat, which assessments they retry.

- A **dedicated async sub-agent** consumes the worker's **tutor queries (voice and
  text) plus in-app activity events** and derives a **strengths/weaknesses skill
  profile**.
- Surfaced to the **worker** in their progress report, and rolled up to the
  **manager** as department-level skill gaps.
- **Strictly asynchronous** — triggered off DynamoDB Streams, never on the request
  path, never inside the voice loop.
- Raw query/activity events carry a **TTL** (they are profiler input, not a
  permanent record); the derived skill profile is the durable artifact. This is
  both a cost and a privacy decision.

## 13. Agent architecture — one flow per agent, no shared pipelines

Four agents, deliberately isolated. Each has its own Strands definition, its own
IAM role, its own Cedar policy, and its own invocation path. Workflows are never
merged — a shared pipeline would risk cross-tenant data mismatch and would put
batch work on a latency-critical path.

| agent | model | trigger | path |
| --- | --- | --- | --- |
| **Voice tutor orchestrator** | Haiku 4.5 | live, per turn | synchronous, latency-critical |
| **Learning plan generator** | Sonnet 4.6 | onboarding, or manager content change | on-demand, async to the user |
| **Assessment scorer** | Sonnet 4.6 | assessment submission | async to the request |
| **Skill profiler** (§12) | Sonnet 4.6 | DynamoDB Stream, debounced/batched | fully background |

Model ids are **inference profiles**, not bare foundation-model ids, and live in
`infra/lib/config.ts`. Verified by invocation 2026-09-17:
`jp.anthropic.claude-haiku-4-5-20251001-v1:0` and `jp.anthropic.claude-sonnet-4-6`.
**Claude Sonnet 5 is not entitled on this account**, hence Sonnet 4.6 for the three
asynchronous agents. `jp.` profiles keep inference in-region rather than routing
globally, which matters most for the one synchronous agent.

KB ingestion/sync is a **pipeline, not an agent** (Bedrock KB sync over the org's
S3 prefix), with an optional quality-flag pass that raises the re-verification
warnings in §4.

Only the voice tutor orchestrator is on a synchronous path. Everything else is
queue- or stream-driven, so no batch workload can ever bottleneck a live voice
turn.

---

# PITCH — designed-for, not built by 2026-09-20

State plainly on stage that these are architected-for and not live.

1. **Live interactive schematics / true simulation.** Manipulable hydraulic and
   electrical circuits with real state — power a solenoid, watch pressure and
   flow respond, induce a fault and trace it. This is the reference product's
   deepest moat and represents years of simulation engineering; we ship
   interactive 3D models and annotated schematics, not a physics simulation.
   Named openly as the next major build.
2. **Organization CAD ingestion pipeline.** STEP/SolidWorks → decimated,
   Draco-compressed GLB, so an org's own machinery renders in-app. The demo uses
   pre-converted models; automated ingestion is an asset-engineering pipeline in
   its own right.
3. **AR mode** — `<model-viewer>` gives Android Scene Viewer AR nearly free;
   placing a virtual machine part on the actual shop floor is a strong extension
   but is not required for the demo.
4. **Expansion beyond the engineering vertical** — the platform is
   profession-agnostic by architecture (per-org KB, generated learning plans);
   the demo proves one vertical deeply. Other blue-collar professions are a
   content-and-assets exercise, not a rebuild.
5. **IVR / phone-call tier (Amazon Connect).** Voice interaction over a plain
   phone call — no app install, no data plan beyond a normal call, no literacy in
   any written language. The single highest-reach item on the roadmap for workers
   with feature phones or no data.
6. **Official certificates** for workers under a subscribed organization (badges
   ship; formal certification does not).
7. **Billing and subscription management** — Stripe or AWS Marketplace SaaS
   metering; admin billing console.
8. **Full coverage of all 22 scheduled Indian languages** (a working subset ships).
9. **Vision-based assessment** — Amazon Rekognition PPE/hazard detection on
   submitted images, scored by Sonnet 5. Was originally in scope; deferred in
   favour of text/voice assessment because it does not generalize across
   professions (meaningful for construction/electrical, not for tailoring or food
   service).
10. **Content moderation / review workflow** for admin-uploaded documentation
    beyond the warning prompts that ship.
11. **Soft-skills and digital-literacy modules** — named as top skill gaps
    alongside safety/compliance and technical upskilling.
12. **Full offline-first sync**, beyond the PWA shell.
13. **Advanced workforce analytics** — skill-gap heatmaps, cohort trends.
14. **Domain-based / SSO provisioning** for large enterprises, layered above the
    SMS/email + bulk-add mechanism that ships.
15. **AgentCore Memory and Evaluations**, and multi-agent breadth beyond the four
    agents built (§13).

## Market context for the pitch

- 78% of blue-collar turnover is not wage-driven; growth and environment drive it.
- ~50% of contract workers who leave, leave within 3 months.
- Language and access — not desire — are the primary barriers to digital adoption,
  concentrated in tier-3 and rural areas; voice interfaces remove literacy as a
  gate.
- India's 2025 Labour Codes push formal employer investment in workforce
  development — regulatory tailwind for org adoption.
- Top-cited skill gaps: digital literacy, safety/compliance, soft skills,
  technical upskilling.

Sources are recorded in Doc 2 (session record, written after scaffolding).

---

# Cut order under time pressure

If the build column cannot be completed, cut in this order:

1. Manager aggregate dashboard → reduce to a static/stub view
2. Admin flows (billing, department management) → model in schema + Cedar, demo as
   UI mockups; keep **invite → worker onboarding** live, since it is the only way
   into the product
3. First-90-days fast-track → fold into the general learning plan
4. Badges → display-only, no award logic
5. Fault-symptom diagnostic trainer → fold into the general tutor loop rather than
   a distinct guided mode
6. 3D model library → reduce to a **single** machine model; keep tap-a-part-and-ask
   working on it, since that is the demo moment
7. Vertical assessment formats → keep "diagnose by voice" (cheapest, reuses the
   tutor), drop "identify the part" and "sequence the procedure"
8. Multilingual UI → ship 2–3 languages live, list the rest as supported-by-design

The **worker end-to-end journey** — invited by an org admin → onboard → generated
learning plan → open a lesson with a 3D machine model → **tap a part and ask about
it by voice**, answered from the org KB in the worker's own language → assessment
→ progress — is the demo spine and is cut last.
