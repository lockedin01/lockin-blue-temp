# Data model & access patterns

Design pass completed 2026-09-17. This is the input the DynamoDB/S3 scaffolding
was blocked on. Folds into Doc 2 (session record) later.

---

## Decision 0 — strictly B2B: every user belongs to a real organization

There is **no individual/consumer path**. A worker cannot self-register; accounts
exist only via an org admin's invite. `orgId` is therefore always present, never
nullable, and never a sentinel.

Consequences, all simplifying:

- No `if (orgId === null)` branching anywhere in application code.
- Cedar policies are written once, against a real tenant.
- Per-org KB, S3 prefix and KMS key have exactly one shape.
- Tenant isolation is total: there is no shared/global partition that any two
  users could both read.

Free vs. paid differences (certificates, seat limits, analytics depth) are
**entitlements on the org record** (`ORG#<orgId>/SUB`), not structural differences
in the data model.

---

## Single table: `AppTable`

On-demand capacity (spiky, unknown hackathon traffic; no capacity planning).

### Partition strategy — and the hot-partition trap we avoid

The obvious design is `PK = ORG#<orgId>` for everything. **That is wrong at
scale**: a single org's entire workforce and all their events would land in one
partition, capped around 3,000 RCU / 1,000 WCU, and every worker write in the org
would contend for it.

So the table splits by write volume:

- **Per-user partitions (`USER#<userId>`)** hold everything high-volume and
  worker-owned — progress, attempts, events, sessions. Writes spread naturally
  across the whole workforce.
- **Per-org partitions (`ORG#<orgId>`)** hold only low-volume configuration and
  content — departments, KB doc metadata, assessment definitions, lessons,
  invites, materialized aggregates. Bounded in size, read-heavy, rarely written.

`orgId` is carried as an attribute on every item regardless, for isolation checks
and GSI projection.

### Item map

| Entity | PK | SK |
| --- | --- | --- |
| Org metadata | `ORG#<orgId>` | `META` |
| Subscription / entitlements | `ORG#<orgId>` | `SUB` |
| Department | `ORG#<orgId>` | `DEPT#<deptId>` |
| Invite (email/SMS code) | `ORG#<orgId>` | `INVITE#<code>` |
| KB document metadata | `ORG#<orgId>` | `DOC#<docId>` |
| Lesson / content item | `ORG#<orgId>` | `LESSON#<lessonId>` |
| Assessment definition | `ORG#<orgId>` | `ASMT#<assessmentId>` |
| 3D asset metadata | `ORG#<orgId>` | `ASSET#<assetId>` |
| **Materialized dept aggregate** | `ORG#<orgId>` | `AGG#DEPT#<deptId>#<period>` |
| User profile | `USER#<userId>` | `PROFILE` |
| User settings (lang, mode, a11y) | `USER#<userId>` | `SETTINGS` |
| Learning plan | `USER#<userId>` | `PLAN#<planId>` |
| Module progress | `USER#<userId>` | `PLAN#<planId>#MOD#<seq>` |
| Assessment attempt | `USER#<userId>` | `ATTEMPT#<assessmentId>#<ts>` |
| Badge / credential | `USER#<userId>` | `BADGE#<badgeId>` |
| **Skill profile (derived)** | `USER#<userId>` | `SKILLPROFILE#CURRENT` |
| Activity / query event | `USER#<userId>` | `EVT#<ts>#<ulid>` |
| Voice session metadata | `USER#<userId>` | `SESSION#<ts>#<sessionId>` |
| **RAG answer cache** | `CACHE#<orgId>#<questionHash>` | `KB#<kbVersion>` |

The RAG cache deliberately gets **its own partition key**, not a slot under
`ORG#<orgId>`: it is written on cache misses across the whole workforce, which is
exactly the high-volume pattern the org partition must stay free of. Hashing the
question into the PK spreads it.

`EVT#` items carry a **TTL (90 days)** — profiler input, not permanent record.

---

## Indexes

### GSI1 — org directory
`GSI1PK = ORG#<orgId>`
`GSI1SK = DEPT#<deptId>#ROLE#<role>#USER#<userId>`

Serves, with one index, via `begins_with` on the sort key:
- all users in an org
- all users in a department
- all workers (role-filtered) in a department

Read traffic here is manager/admin only and paginated, so the shared org
partition is acceptable on the read side.

### GSI2 — unique-code lookup
`GSI2PK = INVITE#<code>` · `GSI2SK = ORG#<orgId>`

Required because invite redemption begins with only the code — the org is
unknown at that moment.

### GSI3 — org content by type, recency-sorted *(optional)*
`GSI3PK = ORG#<orgId>#TYPE#<DOC|LESSON|ASMT|ASSET>` · `GSI3SK = <updatedAt>#<id>`

The base table already answers "list all docs for this org" via `begins_with`.
GSI3 only adds recency ordering for manager content screens. **Cuttable.**

Email/phone → user lookup is deliberately **not** an index: Cognito is the source
of truth for identity, and `sub` is the `userId`.

---

## Access patterns

### Worker
| # | pattern | query |
| --- | --- | --- |
| W1 | my profile / settings | `PK=USER#id, SK IN (PROFILE, SETTINGS)` |
| W2 | my learning plan + modules | `PK=USER#id, SK begins_with PLAN#<planId>` |
| W3 | lesson content + 3D/schematic refs | `PK=ORG#org, SK=LESSON#<id>` |
| W4 | my attempts for an assessment | `PK=USER#id, SK begins_with ATTEMPT#<asmtId>#` |
| W5 | my progress + skill profile | `PK=USER#id, SK=SKILLPROFILE#CURRENT` |
| W6 | my badges | `PK=USER#id, SK begins_with BADGE#` |
| W7 | append activity/query event | `PutItem PK=USER#id, SK=EVT#<ts>#<ulid>` (async) |
| W8 | resume where I left off | cursor stored on `PLAN#<planId>` item |

### Manager
| # | pattern | query |
| --- | --- | --- |
| M1 | workers in my department | GSI1, `begins_with DEPT#<id>#ROLE#worker` |
| M2 | department aggregate progress | **single GetItem** on `AGG#DEPT#<id>#<period>` |
| M3 | department skill-gap rollup | same aggregate item |
| M4 | drill into one worker | `PK=USER#<id>` |
| M5 | list/manage org KB docs | `PK=ORG#org, SK begins_with DOC#` |
| M6 | list/manage lessons, assessments | `PK=ORG#org, SK begins_with LESSON#/ASMT#` |
| M7 | KB re-verify warnings / rebuild status | attributes on `DOC#` + `ORG#/META` |

### Admin
| # | pattern | query |
| --- | --- | --- |
| A1 | all users in org, by role/dept | GSI1 |
| A2 | manage departments | `PK=ORG#org, SK begins_with DEPT#` |
| A3 | manage invites | `PK=ORG#org, SK begins_with INVITE#` |
| A4 | redeem an invite by code | GSI2 |
| A5 | org settings / entitlements | `PK=ORG#org, SK IN (META, SUB)` |

### Async / system
| # | pattern | query |
| --- | --- | --- |
| S1 | recent events for profiling | `PK=USER#id, SK between EVT#<from> and EVT#<to>` |
| S2 | write derived skill profile | `PutItem SK=SKILLPROFILE#CURRENT` |
| S3 | update dept aggregate | `UpdateItem ADD` on `AGG#DEPT#…` |

---

## Decision 1 — all aggregates are materialized, never computed on read

**General rule, not a one-off optimization:** any resource the frontend requests
whose value is derived from many elements or many data sources — department
progress, skill-gap rollups, pass rates, cohort trends, org-wide counts — is
**precomputed on write and read as a single item.** No frontend call ever triggers
a fan-out across workers.

A dashboard that fans out across every worker is O(workforce) per page view and
degrades exactly as an org grows — i.e. precisely when they start paying.

Mechanism: the **skill profiler (FEATURES §12)** writes twice on every run — the
worker's own `SKILLPROFILE#CURRENT`, and an atomic counter update to
`AGG#DEPT#<deptId>#<period>`. Any future aggregate follows the same pattern:
written by the async path, read as one GetItem.

The manager dashboard is therefore **one GetItem**, at any workforce size.

---

## Write path: stream-driven, never on the request path

```
voice turn / app activity
  → async PutItem  EVT#<ts>            (fire-and-forget, off the voice critical path)
  → DynamoDB Stream
  → EventBridge/SQS (batched, debounced)
  → skill profiler sub-agent (Sonnet 5)
  → SKILLPROFILE#CURRENT  +  AGG#DEPT#… counters
```

Nothing in this chain can block a live voice turn — which is the whole reason the
agents are kept on separate flows (FEATURES §13).

---

## S3 layout

```
<org-docs-bucket>/org=<orgId>/docs/<docId>/<filename>      SSE-KMS, per-org CMK
<assets-bucket>/models/<assetId>/model.glb                 Draco-compressed
<assets-bucket>/models/<assetId>/lod1.glb
<assets-bucket>/models/<assetId>/poster.webp               2D fallback still
<assets-bucket>/schematics/<id>.svg                        low-bandwidth path
```

- Per-org KB data source points at that org's `org=<orgId>/docs/` prefix only —
  this is the mechanism enforcing "one isolated KB per organization".
- Asset filenames are **content-hashed and immutable** → cache forever.
- **Raw voice audio is not persisted by default.** Transcripts only, and only as
  TTL'd `EVT#` items. Privacy and cost both argue for this.

---

## Caching strategy

| layer | what | mechanism |
| --- | --- | --- |
| CDN + service worker | 3D models, schematics, posters | content-hashed, immutable, cache forever |
| CDN + service worker | lesson/plan content | version-stamped, invalidate on version bump |
| DynamoDB | **RAG answer cache** — key `(orgId, normalizedQuestionHash, kbVersion)`, TTL'd | workers in one trade repeat the same questions; direct Bedrock cost saving |
| DynamoDB | dept aggregates | materialized (Decision 1) |
| Client | identity | short-lived access token in memory; refresh via Amplify |

The RAG answer cache is invalidated implicitly by `kbVersion` — a manager
rebuilding the KB bumps the version, and every cached answer for that org ages
out without an explicit purge.

---

## Decision 2 — CRUD goes through Next.js server routes

Plain reads/writes (profile, settings, plans, lessons, attempts, admin/manager
CRUD) are served by **Next.js server-side routes** calling the AWS SDK directly —
not API Gateway + Lambda. Chosen to simplify development: one deployable for the
web tier, no separate API stack, no CORS surface, types shared between client and
server.

The other two paths are unchanged and remain separate:
- **Voice** → App Runner WebSocket service (persistent connection)
- **Agents** → AgentCore Gateway (Cedar-enforced)

So: three backend surfaces, each with a clear remit, and no fourth ad-hoc one.

## Decision 3 — Amplify default token storage

Cognito tokens are handled by **Amplify's built-in session management** rather
than a custom httpOnly-cookie BFF. Chosen to simplify architecture: refresh
rotation and expiry are handled by the library.

The voice WebSocket keeps the pattern already proven in the ported module — the
access token is sent in the **first frame**, never in the connection URL (query
strings leak into proxy logs and browser history). On expiry mid-session the
socket ends the session rather than only the turn.

---

## Still open (not blocking scaffolding)

Nothing. All data-model and routing decisions are settled; scaffolding can
proceed.
