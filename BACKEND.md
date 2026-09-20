# Backend track — session record and work plan

Owner: Rishab. Branch: `backend`.

Scope: everything that is not the browser UI (FRONTEND.md) and not the Sarvam
voice pipeline (VOICE.md). Infrastructure, auth, data, Bedrock/agents, the CRUD
route handlers, and deployment.

Read `CLAUDE.md` first — it holds the enforceable rules and the traps. This
document is the *why* and the *order*; CLAUDE.md is the *what not to do*.
`FEATURES.md` and `DATA-MODEL.md` are authoritative on scope and schema.

---

## 1. Where the project stands

**Event.** First Commit Hackathon (WeMakeDevs x AWS), 2026-09-17 to 2026-09-20.
Judged on Idea & Impact, Built on AWS, Execution. Budget $150 AWS credit; Sarvam
access is effectively unmetered (1.5L INR/month).

**Scaffolding is complete and verified.** `cdk synth` produces six stacks, infra
tests pass, the voice service typechecks and its Docker image builds, and the web
app lints and builds with 24 routes. Nothing that follows requires re-running
`cdk init`, `create-next-app`, or `shadcn init`.

**The foundation is deployed** (2026-09-18, work order item 1). `security` →
`data` → `auth` are live in ap-northeast-1. `ai`, `compute` and `web` are not.

| Resource | Physical id |
| --- | --- |
| KMS key | `alias/skillbridge-data` → `key/73e81375-e118-4c58-b860-1568beeb5c07` |
| Table | `skillbridge-data-AppTable815C50BC-1DQOV4FJ7QUT6` |
| Stream | `…/stream/2026-09-18T12:03:56.420` |
| User pool / web client | `ap-northeast-1_mVCiV8Voi` / `7un8m28bpsocodffvliup91blb` |
| Org docs bucket | `skillbridge-data-orgdocsbucketad14293f-5g6mhx7jpilb` |
| Assets bucket | `skillbridge-data-assetsbucket5cb76180-5rfzmqd2v3gh` |

These are in `web/.env.local` (gitignored). All of it is disposable by design —
`cdk destroy` and redeploy rather than nursing a broken stack.

**Repo layout**

```
infra/              CDK app — six stacks
services/voice/     Voice service (TypeScript, Express + ws) — VOICE.md owns this
web/                Next.js 16 app — FRONTEND.md owns the UI; this doc owns app/api
reference/          Third-party material, gitignored, never imported
```

### Environment facts established by testing, not assumption

| Fact | How it was established |
| --- | --- |
| Account verification hold is cleared | `InvokeModel` no longer returns the verification error |
| Bare model ids **fail** in ap-northeast-1 | `ValidationException: on-demand throughput isn't supported` |
| Haiku 4.5 works via `jp.anthropic.claude-haiku-4-5-20251001-v1:0` | Live invoke returned output; re-verified 2026-09-18 after the model-access fix below |
| **Sonnet 5 is not entitled on this account** | `AccessDeniedException: not available for this account` |
| Sonnet 4.6 works via `jp.anthropic.claude-sonnet-4-6` | Live invoke returned output |
| CDK is bootstrapped in ap-northeast-1 | `CDKToolkit` stack is `CREATE_COMPLETE` |

`jp.` profiles keep inference inside the Japan region instead of routing globally,
which matters for the one synchronous path.

### Credentials

- Profile `skillbridge` → `arn:aws:iam::975585942816:user/rishab-cli`, obtained by
  browser `aws login`. Scoped via the `dev` group: CDK deploy, CloudFormation,
  Bedrock. **Not** billing or account closure.
- The `default` profile still holds **static root access keys**. `cdk deploy` uses
  `default` unless told otherwise. Point CDK at `--profile skillbridge`, and delete
  the root keys when convenient.
- AWS Agent Toolkit is installed; the `aws-mcp` MCP server is configured in
  `~/.claude.json` with `AWS_MCP_PROXY_PROFILES=skillbridge`.

---

## 2. Architecture decisions and why they are what they are

These were argued through and settled. Reopen only with a reason.

**Single region `ap-northeast-1`.** No service needs `ap-south-1`; splitting adds a
second bootstrap and cross-region auth/state for no benefit at this scale.
India↔Tokyo latency (~60-90ms) is imperceptible in a turn-based voice UX.

**Sarvam replaced Nova 2 Sonic for voice.** Nova 2 Sonic bidirectional streaming was
the original plan and was dropped as too new and undocumented to risk in a four-day
build, against a Sarvam pipeline that already had a working reference
implementation. Reasoning still runs on Bedrock, so the "Built on AWS" story holds.

**Strictly B2B.** No consumer path. This removed a whole branch from the data model:
`orgId` is always present, Cedar policies are written once, per-org KB/S3/KMS have
exactly one shape.

**Three backend surfaces, no fourth.** CRUD → Next.js server routes (chosen to
simplify: one deployable for the web tier, no separate API stack, no CORS surface,
shared types). Voice → App Runner WebSocket (needs a persistent process). Agents →
AgentCore Gateway (Cedar-enforced).

**Partitioning splits by write volume, not tenant.** `USER#<userId>` takes
high-volume worker-owned items; `ORG#<orgId>` takes only bounded config and content.
Putting everything under the org would cap a whole workforce on one partition
(~3,000 RCU / 1,000 WCU).

**All aggregates are materialized.** Any value derived from many items is written by
the async path and read with one GetItem. A dashboard that fans out is O(workforce)
per page view, degrading exactly when an org grows enough to pay.

**Four agents, isolated.** Own Strands definition, IAM role, Cedar policy and
invocation path each. Only the voice orchestrator is synchronous.

---

## 3. What exists in `infra/`

| Stack | Holds | Still to author |
| --- | --- | --- |
| `security` | `alias/skillbridge-data` KMS key | per-org CMKs (created by the app, not CDK) |
| `data` | `AppTable` (PK/SK, GSI1, GSI2, Streams, TTL), org-docs + assets buckets | — |
| `auth` | User pool (self sign-up off), three groups, seven custom attrs, `WebClient` with attribute allowlists | Post-confirmation/onboarding triggers if needed |
| `ai` | Four agent roles, stream → fanout → SQS → profiler chain | **KB + vector store, AgentCore Gateway + Identity, Cedar policy store, Strands definitions** |
| `compute` | ECR repo, App Runner task role | **App Runner service itself** (needs an image first) |
| `web` | Amplify `CfnApp`, `WEB_COMPUTE` | **SSR compute role**, GitHub repo/branch connection |

Two placeholder Lambdas in `ai-stack.ts` throw `not implemented` and exist to prove
the wiring synthesizes. Replace their code, keep the chain shape.

### Defects already found and fixed during scaffolding

Recorded so they are not reintroduced:

1. **IAM would have passed `synth` and failed at runtime.** Inference profiles need
   invoke permission on the profile ARN *and* the underlying foundation-model ARNs
   in every routed region. `UNDERLYING_MODELS` in `config.ts` exists for this.
2. **Cognito privilege escalation.** `addClient` with no attribute allowlist grants
   write on every mutable attribute — a worker could have set
   `custom:role=admin`. Now `WriteAttributes: ["name"]`, verified in the template.
3. **`keys.planModule` did not zero-pad `seq`.** `MOD#10` sorted before `MOD#2`.

### Known issues — current state

- **Cognito access tokens carry no `custom:*` claims.** **Resolved and verified
  against a live token, 2026-09-18.** A real user was provisioned through the
  `provisionCognitoUser` sequence, signed in via SRP, and both tokens decoded:

  | claim | ID token | access token |
  | --- | --- | --- |
  | `custom:orgId` | present | **absent** |
  | `custom:role` | present | **absent** |
  | `custom:deptId` | present | **absent** |
  | `cognito:groups` | present | present |

  So the scaffold's `tokenUse: 'access'` would have authorized every voice turn
  with `orgId === undefined`, exactly as predicted. Both `web/src/lib/auth.ts` and
  `services/voice/src/auth/cognito.ts` verify the **ID token**, fall back to
  `cognito:groups` for `role`, and load `orgId` from `USER#<sub>`/`PROFILE` when a
  claim is absent. `sub` matched the `AdminCreateUser` sub verbatim.

  Also confirmed: SRP sign-in needs **no IAM permission and no app-client change**
  — `InitiateAuth` is a public API. Only user *provisioning* is IAM-gated. Do not
  add `ALLOW_USER_PASSWORD_AUTH` to get CLI convenience; use a Node script with
  `aws-amplify/auth`, which is already a dependency.
- **`Invite.redeemedAt`** — fixed. The attribute is omitted at issue time and the
  redemption guard is `attribute_not_exists(redeemedAt) AND expiresAt > :now`.
- **`WebStack` takes `tableName: string`**, so there is no construct to `grant*` on
  and no Amplify SSR compute role exists. Still open, and now blocking more than
  the table: invite redemption calls `AdminCreateUser`, `AdminAddUserToGroup`,
  `AdminSetUserPassword` and `AdminDeleteUser`, so that role needs those four
  scoped to the pool ARN as well as `grantReadWriteData` on the table.
- **GSI3 is described in DATA-MODEL.md but not created** in `data-stack.ts`.
  Querying it throws. Either add it or treat the doc line as cut.
- **RESOLVED: Bedrock model access.** Both tiers invoke again, re-verified
  2026-09-18 (`haiku=ok`, `sonnet=ok`). Kept because the failure was a two-layer
  trap that will recur on any new account or model:

  1. `ResourceNotFoundException: Model use case details have not been submitted
     for this account.` — the Anthropic use case form.
  2. Underneath it, and only visible once the first cleared:
     `AccessDeniedException: ... not authorized to perform the required AWS
     Marketplace actions (aws-marketplace:ViewSubscriptions,
     aws-marketplace:Subscribe)`.

  The second was a consequence of detaching `AmazonBedrockFullAccess`, whose
  `Sid: MarketplaceOperationsFromBedrockFor3pModels` granted those on `"*"`. On
  first invoke Bedrock completes the model's Marketplace subscription and checks
  the *caller* for them.

  **The fix was the console, not IAM**, and that was the important part: the
  subscription is account-level, so once completed every principal is fine.
  Adding `aws-marketplace:Subscribe` to `skillbridge-dev-ai` would have left a
  standing spend-enabling grant on a developer identity *and* would not have
  helped `voiceServiceRole`, the four agent roles or the Amplify SSR role, none
  of which will ever hold marketplace permissions.

  Our `skillbridge-dev-ai` grant was correct throughout: `bedrock:InvokeModel` on
  both `jp.` profile ARNs and both underlying foundation models in
  `ap-northeast-1` **and** `ap-northeast-3`, the profile's routing set.
- **App Runner: probe passed, proceed — but the real gate is `CreateService`.**
  AWS stopped accepting new App Runner customers on 2026-04-30 and this account had
  never created a service, so item 7 was at risk. Probed 2026-09-18:
  `apprunner list-services` returns `{"ServiceSummaryList": []}` with exit 0, and
  `list-operations` on a bogus ARN returns a normal `ResourceNotFoundException`
  rather than an eligibility error — the API is answering for this account. That is
  good evidence but not proof: an eligibility gate could still apply only on create.
  Treat the first `CreateService` as the real test. If it is refused, switch
  `compute-stack.ts` to **Amazon ECS Express Mode**, AWS's named migration target —
  one API call takes a container image plus two IAM roles and provisions an ECS
  service on Fargate behind an ALB, so it still holds the persistent WebSocket
  process that VOICE.md's "App Runner, not Lambda" reasoning requires. The IAM
  contingency is to drop the three App Runner statements from
  `skillbridge-dev-deploy` and add, on `arn:aws:ecs:ap-northeast-1:975585942816:*`:
  `ecs:CreateExpressGatewayService`, `UpdateExpressGatewayService`,
  `DescribeExpressGatewayService`, `DeleteExpressGatewayService`,
  `DescribeClusters`, `DescribeServices`, `ListServiceDeployments`,
  `DescribeServiceDeployments`, `TagResource`, `UntagResource` — plus
  `iam:PassRole` conditioned on `iam:PassedToService = ecs-tasks.amazonaws.com`.
  There is no `ecs:ListExpressGatewayServices`; enumerate with `DescribeServices`.
- **`rishab-cli` cannot reach Cognito, DynamoDB or IAM.** The `dev` group covers
  CDK/CloudFormation and Bedrock only, so `cdk deploy` works (it assumes the
  bootstrap roles) while `AdminCreateUser`, `PutItem` and even `DescribeTable`
  return AccessDenied. This blocks minting a test token, seeding fixture data, and
  any end-to-end run of the invite flow. Needs a scoped policy on the `dev` group:
  `cognito-idp:AdminCreateUser|AdminAddUserToGroup|AdminSetUserPassword|AdminDeleteUser|AdminGetUser|AdminDeleteUser`
  on `userpool/ap-northeast-1_mVCiV8Voi`, plus DynamoDB read/write on the table and
  its indexes.

---

## 4. Work order

Follow this; it is dependency-correct.

1. ~~**Deploy the CDK foundation** in order: `security` → `data` → `auth`.~~ Done
   2026-09-18; ids in §1. Security first because `bin/infra.ts` passes
   `security.dataKey` into `DataStack`. Deploy with `--profile skillbridge`.
2. ~~**Auth for real**: invite issuance and redemption.~~ Done and **verified live
   end to end** 2026-09-18 (commit `9ee2c12`): admin issues → worker redeems →
   Cognito user created with tenant copied from the stored invite → PROFILE and
   SETTINGS written in one transaction → worker signs in and reads their own
   profile. Replaying a redeemed code returns 400; a bad password or non-E.164
   phone is rejected *before* the invite is marked redeemed, so a typo no longer
   burns the worker's only way into the product.
3. ~~**`requireSession(role?)` in `web/src/lib/`.**~~ Done. Returns
   `{ userId, orgId, role, deptId }` — `deptId` was added because the aggregates
   route needs the caller's own department to enforce the manager boundary.
   Verified: all six routes 401 without a token, and role gating returns 403 for a
   worker hitting `/api/invites` (admin) and `/api/aggregates` (manager).
4. ~~**The six CRUD handlers.**~~ Done, each on the access pattern named in its
   comment; `aggregates` is a single GetItem with no fan-out. Reviewed against the
   trap list and 14 findings fixed — see §3.
5. **Bedrock/AgentCore** — **needs a decision before it is built.** See §7.
6. ~~**Profiler pipeline**: replace the two placeholder Lambdas.~~ Done.
   `infra/lambda/` holds both handlers, bundled with `NodejsFunction`;
   `keys.ts` is vendored byte-for-byte with a test that fails on drift.
   - The fanout filters **in code**, not with an event-source-mapping filter. An
     ESM filter would stop non-`EVT#` writes invoking it at all, but the AWS docs
     contradict each other on what a DynamoDB filter may match (the Lambda guide
     says "only support filtering on the `dynamodb` key"; the DynamoDB TTL guide
     demonstrates filtering on `userIdentity`, outside it) and a filter matching
     nothing fails **silently** — the profiler would never run. Verify against a
     live ESM before moving it.
   - TTL expiry arrives as a `REMOVE` carrying
     `userIdentity.principalId = dynamodb.amazonaws.com`. `EVT#` items are
     append-only, so filtering to `INSERT` excludes both that and any later edit.
   - **The aggregate takes two UpdateItems, and must.** DynamoDB rejects
     `ADD skillGaps.#k` when the parent map does not exist, and rejects
     initialising the parent and adding to a nested path in one expression
     ("Two document paths overlap"). Probed live. So: one idempotent
     `SET … skillGaps = if_not_exists(skillGaps, :empty)`, then the atomic `ADD`s.
   - Distinct `workerCount` uses `ADD seenWorkers` on a string set with
     `ReturnValues: ALL_OLD` — incrementing unconditionally would count a worker
     once per profiling run.
   - Both event sources set `reportBatchItemFailures`, so one poison record does
     not replay a whole batch into an async-tier model.
   - The SDK is **bundled**, not taken from the runtime: the Node.js runtime docs
     promise only "a specific minor version" and never say whether
     `@aws-sdk/lib-dynamodb` is included. Bundles are 1.0 MB and 1.4 MB, and cold
     start does not matter on a background path.
7. **App Runner service** in `compute-stack.ts` — **held**, see §7. The image is
   the voice track's deliverable (VOICE.md work order item 8), and `services/voice`
   still has 8 `not implemented` sites.
8. **Amplify** — **half done.** The SSR compute role is built and tested:
   `WebStackProps` now takes `data.table` and `auth.userPool` as constructs, and
   `grantReadWriteData` consequently also grants `kms:Decrypt`/`Encrypt`/
   `GenerateDataKey*` on the CMK automatically — verified in the synthesized
   template. That is precisely why the rule says to pass the construct: a
   `tableName: string` could not have done it. Trust policy is
   `amplify.amazonaws.com`, verbatim from AWS, no condition block. The repository
   connection and the deploy are **held**, see §7.

---

## 5. Operational notes

Small things that cost time if rediscovered.

- **`aws` is not on PATH in the agent's shell.** It is a user-level install and the
  persisted User PATH does contain it, but shells spawned by the tooling do not pick
  it up. Call it by full path:
  `/c/Users/nagwa/AppData/Local/Programs/Amazon/AWSCLIV2/aws.exe` (Git Bash) or
  `$env:LOCALAPPDATA\Programs\Amazon\AWSCLIV2\aws.exe` (PowerShell). A fresh
  interactive terminal has it normally.
- **Always pass `--profile skillbridge`.** The `default` profile is static root
  access keys; `cdk deploy` will silently use it otherwise.
  `npx cdk deploy skillbridge-security --profile skillbridge`
- **`next dev` inherits those root keys too**, and that is worse than it sounds:
  nothing sets `AWS_PROFILE`, so the SDK falls through to `default` and every
  route runs as `arn:aws:iam::975585942816:root`. Local calls then succeed under
  permissions the deployed app will never hold, so a missing grant only surfaces
  after deploy. `web/.env.local` now pins `AWS_PROFILE=skillbridge` — keep it
  there, and delete the root access keys when convenient.
- **Developer IAM is applied and verified; the source documents are no longer in
  the repo.** Five customer managed policies — `skillbridge-dev-{identity,data,ai,
  ops,deploy}` — are attached to the `skillbridge-dev` group (not `dev`, whose
  managed-policy quota of 10 was nearly full), with `rishab-cli` a member.
  `AmazonBedrockFullAccess` was detached from `dev`: it was `bedrock:*` on `"*"`,
  which CLAUDE.md forbids and which silently overrode the scoped Bedrock policy.
  Verified 2026-09-18 at 32/32, including four guardrails that must fail (no IAM
  write, no self-escalation, the Cognito schema `Deny`, no billing).
  **AWS is now the only copy.** `rishab-cli` has no IAM write, so re-applying needs
  an identity that does — and root no longer has access keys, so that means the
  root console. Read the live policy back with
  `aws iam get-policy-version --policy-arn arn:aws:iam::975585942816:policy/<name> --version-id <v>`
  before assuming anything about its contents.
- **Root access keys are deleted.** `~/.aws/credentials` is gone and `[default]` in
  `~/.aws/config` carries the same `login_session` as `skillbridge`, so every path
  — unqualified, `--profile default`, `--profile skillbridge` — resolves to
  `rishab-cli`. No AWS\_\* variables in the shell or in the Windows persisted User
  or Machine environment. Root console login is unaffected (keys are CLI/API only).
- **Stack names**: `skillbridge-{security,data,auth,ai,compute,web}`. Deploy
  individually rather than `--all` until the ai/compute/web stacks are finished.
- **Verify commands** used throughout scaffolding:
  `cd infra && npm run build && npx cdk synth --quiet && npm test`,
  `cd services/voice && npm run typecheck`,
  `cd web && npm run lint && npm run build`.
- **Bedrock smoke test** (confirms entitlement and the inference-profile rule):
  `aws bedrock-runtime invoke-model --region ap-northeast-1 --model-id jp.anthropic.claude-haiku-4-5-20251001-v1:0 --body '{"anthropic_version":"bedrock-2023-05-31","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}' --cli-binary-format raw-in-base64-out out.json --profile skillbridge`
- **Nothing is deployed yet.** No stack has ever been pushed to CloudFormation
  beyond `CDKToolkit`. Expect first-deploy surprises and keep `cdk destroy` viable —
  all data is disposable by design.
- **AWS Agent Toolkit is installed**: 23 skills in `~/.claude/skills`, and the
  `aws-mcp` MCP server in `~/.claude.json` bound to `AWS_MCP_PROXY_PROFILES=skillbridge`.
  Prefer the MCP server over raw CLI for AWS work; load the relevant AWS skill first.

## 6. Coordination with the other two tracks

- **VOICE.md** consumes `requireSession`-equivalent token verification and the
  `EVT#`/`SESSION#` write path. The token-claims decision (item 2 above) is a shared
  blocker — settle it once, tell both tracks.
- **FRONTEND.md** consumes the six CRUD routes. Publish the response shapes (they
  are the types in `web/src/lib/types.ts`) as soon as each handler lands, so the UI
  is not written against guesses. Two shapes changed on 2026-09-18 and the UI must
  follow:
  - `AssessmentAttempt` gained `status: 'pending' | 'scored'` and a `response`
    field, and `score`/`feedback` are now `number | null` / `string | null`. A
    submission returns `pending` with no score — scoring is async (FEATURES §13),
    so the attempt screen has to render a pending state and re-fetch rather than
    read a score straight out of the POST response.
  - `GET /api/plan` returns `{ plan, plans }`. `plan` is the fast-track plan when
    one exists, otherwise the general plan; `plans` carries all of them with their
    modules correctly grouped. `?planId=` selects one.
- **VOICE.md** — `services/voice/src/auth/cognito.ts` was edited on the `backend`
  branch (ID-token verification, deterministic role resolution, no `'worker'`
  default). The `voice` branch is still at the scaffold commit, so there is no
  conflict yet, but rebase before touching that file.
- `web/src/lib/keys.ts` is the single source of truth for key construction. The
  voice service and the Lambdas have no copy — vendor it verbatim rather than
  re-typing strings.

---

## 7. Held decisions and how they were resolved

**D1, D2, D3 — RESOLVED together, by not needing any of them.** The web tier now
deploys through the Amplify **deployment specification** rather than a connected
repository: `infra/scripts/deploy-web.mjs` builds `web/` with
`output: 'standalone'`, assembles `.amplify-hosting/{compute/default,static,deploy-manifest.json}`,
and ships it with CreateDeployment / StartDeployment. `rishab-cli` already holds
every action that needs. This removes three problems at once instead of working
around each:

- **No GitHub token.** Nothing secret goes into CDK, Secrets Manager, an env var
  or the console, and no GitHub App installation is required.
- **No build spec, so no monorepo problem.** AWS's
  `AMPLIFY_MONOREPO_APP_ROOT`-in-the-console requirement only applies when Amplify
  runs the build. It does not.
- **No dependence on Amplify supporting Next.js 16.** AWS documents Next 15; this
  app is 16.3.5. Under the spec Amplify only runs a Node HTTP server on port 3000
  and never parses the build output, so the version question does not arise.

Verified locally, not assumed: `output: 'standalone'` builds cleanly under Next
16.3.5 **with Turbopack**; `.next/standalone/server.js` listens on
`PORT || 3000` exactly as the spec requires; the assembled bundle is 5.7 MB
zipped and 26 MB uncompressed against a 220 MB limit; and the bundled server
boots and serves `/login` 200, `/` 200 and `/api/me` 401 with the correct auth
error — so `requireSession` works inside the bundle.

A git connection can still be added later for auto-deploy: `AWS::Amplify::App`
has no create-only properties, so `Repository` and a token attach to the same app
by a plain update.

**D4 — App Runner (item 7). Still held.** Adding the service to
`compute-stack.ts` referencing an image tag that does not exist makes
`skillbridge-compute` undeployable. The voice implementation has now landed, so
the image is buildable; what remains is whether to gate the service behind a CDK
context value so the stack still deploys without it. The account can call App
Runner (probed), but `CreateService` is still the real eligibility test.

**D5 — AgentCore Gateway and Cedar (item 5). Still open, and the question is
narrower than it looks.** See §8.

**One trap to record even if D5 goes the other way:** the CDK `Gateway` L2 creates
a **second Cognito user pool** if `authorizerConfiguration` is omitted —
`createDefaultCognitoAuthorizerConfig()` calls `new cognito.UserPool(...)` with
its own domain and client. In a project whose entire tenancy model hangs off one
pool, a silently created second pool is a serious footgun. Always pass an
authorizer explicitly; `GatewayAuthorizer.usingCustomJwt({ discoveryUrl, allowedClients })`
takes plain strings and avoids an auth-to-ai stack dependency.

**Research gap, stated rather than papered over.** Two of the six research lanes
(the KB vector store, and the profiler Lambdas) failed to return structured output.
The profiler's findings were recovered from its live probes and the implementation
is built on those. **The per-org Knowledge Base and vector store were not
recovered** — that half of item 5 is still unresearched. Do not assume S3 Vectors
is the answer just because it is cheapest; the cost, the region and the exact
`CreateDataSource` prefix-scoping property all still need checking.

---

## 8. Item 5, split into the three things it actually is

Item 5 reads as one task but is three, with very different status. The voice
merge settled the largest one.

**5a. Knowledge Base — the CONSUMER side is DONE**, and done correctly, by the
voice track. `services/voice/src/voice/grounding.ts` retrieves from a per-org KB
with `RetrieveCommand`, resolves `kbId` from `ORG#<orgId>` / `META` using the
orgId from the **verified token only**, memoises per channel, bounds retrieval at
1500 ms so a slow KB costs specificity rather than silence, and degrades to an
ungrounded answer when an org has no KB. That is exactly the isolation rule.

**5b. Knowledge Base — the PRODUCER side is the real remaining work.** Nothing
creates a per-org KB, its vector store or its `org=<orgId>/docs/` data source, and
nothing writes `kbId` onto `ORG#<orgId>` / `META`. Until it does, every org falls
into grounding.ts's null branch and the tutor answers ungrounded — the demo still
runs, but the differentiator ("grounded in *that organization's* SOPs") is not
live. This belongs to org provisioning, which CLAUDE.md says is application code,
not CDK. It is also the lane whose research failed, so the vector store choice,
its idle cost against the $150 budget and the exact data-source prefix property
are all still unverified. **Do not pick a vector store without checking its idle
cost** — OpenSearch Serverless alone would exceed the whole budget.

**5c. AgentCore Gateway + Cedar — available, and arguably not ours to build.**
Everything works: all seven `AWS::BedrockAgentCore::*` types are `FULLY_MUTABLE`
in ap-northeast-1 and `aws-cdk-lib` 2.269.0 ships L2s. The problem is purpose. A
Gateway fronts **tools** for an external caller. Our voice turn calls Bedrock
in-process from App Runner by explicit design, and the other three agents are
triggered by our own backend, so nothing on the demo spine would pass through it
— which leaves Cedar with nothing to authorize. Building it would mean routing
agents through a hop the spine does not use, purely to make the architecture
diagram literal. FEATURES.md's "roles are the Cedar policy subjects" remains true
as a design statement. Treat 5c as PITCH unless a reason appears to route a real
agent through a Gateway.

**The second-user-pool trap, if 5c is ever built.** The CDK `Gateway` L2 silently
creates a whole second Cognito user pool when `authorizerConfiguration` is
omitted: `createDefaultCognitoAuthorizerConfig()` calls `new cognito.UserPool(...)`
and adds its own domain and client. In a product whose entire tenancy model hangs
off one pool, that is a serious footgun. Always pass an authorizer explicitly —
`GatewayAuthorizer.usingCustomJwt({ discoveryUrl, allowedClients })` takes plain
strings and avoids an auth-to-ai stack dependency.

**5d. The three non-voice Strands agents** (learning plan generator, assessment
scorer, skill profiler) remain. The profiler's Lambda is built (item 6) and calls
Bedrock directly rather than through Strands. The scorer has a defined contract
already: `POST /api/assessments` writes a `pending` attempt with no score, and
something must pick it up — the trigger mechanism is still the open choice
CLAUDE.md leaves to us.

---

## 9. Branch survey, 2026-09-19 — and a blocking content problem

### `frontend` — do NOT merge as-is

Two commits of genuinely good UI work (worker home/learn/profile, drilldown
dashboard, bottom nav, lesson and assessment views, i18n message expansion,
`LOCALES` correctly still `en`/`hi`/`mr`). Almost all of it is mergeable.

**But four files under `web/src/data/` are derived from
`reference/LunchboxSessions-Data/`, and they say so in their own headers:**

- `materials-catalog.json` (14,361 lines) — `"topics_count": 8`,
  `"sessions_count": 86`, `"total_materials": 976`. FEATURES.md describes
  LunchBox Sessions as "7 topics, 86 sessions, 977 materials". Session names,
  slugs and ids match `reference/LunchboxSessions-Data/content.csv`.
- `curriculum.ts` (901 lines) — header: *"Sourced directly from Lunchbox Sessions
  industrial dataset."*
- `questions.ts` (233 lines) — header: *"Sourced directly from Lunchbox Sessions
  Quiz & Technical Diagnostics Dataset."*
- `simulations-catalog.ts` (118 lines) — header: *"Extracted from
  Desktop/blue-collar/simulations_modular"*.

CLAUDE.md prohibits exactly this: "Do not copy, paraphrase, embed, seed a
Knowledge Base from, train on, or 'regenerate into React/SVG/Three.js' any of
it." The content is © CD Industrial Group Inc. and belongs to a live $29/month
product. The risk is not abstract — it would ship in a judged competition
against a recognizable original, and FEATURES.md's own competitive-positioning
section names that product on the same page.

`curriculum.ts` also carries a `SimulationConfig` with `defaultPressurePsi` and
`reliefSettingPsi`, which is the start of live physics simulation — PITCH item 1,
and the reference product's deepest moat.

**Required before merge:** replace those four files with content authored fresh
for our own vertical. Everything else on the branch can come across.

### `frontend` — one real fork to reconcile

`web/src/lib/auth.ts` exists on **both** branches, and both are correct
server-side implementations of the two mechanisms CLAUDE.md offers:

| | backend (`9ee2c12`) | frontend (`8a0b24a`) |
| --- | --- | --- |
| mechanism | Amplify cookie + `aws-jwt-verify` | `@aws-amplify/adapter-nextjs` + `runWithAmplifyServerContext` |
| returns | `SessionUser` (adds `deptId`) | `Session` |
| proven | yes — live token, live AWS, full invite flow E2E | not yet exercised against live AWS |

CLAUDE.md says pick ONE and use it everywhere. Recommend keeping backend's: all
six CRUD routes already call it and it is verified end to end. The frontend
pages that import `requireSession` need the `Session` -> `SessionUser` rename,
which is mechanical.

### `machine-twin` — do not merge into `backend`

A self-contained Python project (`machine-twin/`, ~8,400 lines): COLMAP
photogrammetry, Blender authoring, an Object Capture Swift helper, its own
`pyproject.toml` and `uv.lock`. It branched from `632bc8d`, before the
application scaffold, and touches nothing in `web/`, `infra/` or `services/`.

It is best read as an **asset-authoring tool**, not a product feature, and on
that reading it is legitimate — CLAUDE.md requires 3D assets be "authored fresh",
and photogrammetry is a way to author them. As a *product* feature it would be
PITCH item 2 (CAD/asset ingestion pipeline).

Keep it on its own branch. Merging it into `backend` would add Python, uv, COLMAP
and Blender to a TypeScript deployable for no runtime benefit. Consume its
**output** — one or two GLB files in the assets bucket — which is exactly the cap
CLAUDE.md sets.

---

## 10. Item 5b — DONE and verified end to end (2026-09-19)

The org-provisioning path exists and the demo org is live. `grounding.ts` has had
a working `kbId` to read since this landed.

| Resource | Value |
| --- | --- |
| Org | `ORG#demo-industrial` — "Demo Industrial Works" |
| Knowledge Base | `5UYTEWBJ7K` |
| Data source | `EFWNVWUMIM`, scoped to `org=demo-industrial/docs/` |
| Vector store | S3 Vectors index `org-demo-industrial` in bucket `skillbridge-vectors` |
| Embedder | `cohere.embed-multilingual-v3`, 1024-dim |
| Per-org CMK | `alias/skillbridge-org-demo-industrial` |
| Shared KB role | `skillbridge-ai.KnowledgeBaseRoleArn` |
| Ingestion | 40 documents scanned, **40 indexed, 0 failed** |

Scripts: `infra/scripts/provision-org.mjs` and `infra/scripts/seed-content.mjs`,
both idempotent and committed so a teardown is reproducible.

**Retrieval, measured on both embedders.** The multilingual model was enabled on
2026-09-19 and the KB recreated (the embedding model is immutable on an existing
KB; the 1024-dim index is shared by both, so only the KB changed).

| query | titan-embed-text-v2 | cohere-embed-multilingual-v3 |
| --- | --- | --- |
| "what does a directional control valve do" | 0.899 | 0.869 |
| "why is my hydraulic cylinder drifting under load" | 0.756 | **0.791** |
| "हाइड्रोलिक सिलेंडर लोड के नीचे खिसक रहा है क्यों" | 0.649 | **0.775** |
| "हायड्रॉलिक सिलिंडर भाराखाली सरकत आहे" (Marathi) | not tested | **0.757** |

The number that matters is the Hindi one. On Titan it retrieved adjacent
content; on Cohere it returns the **same passage the English query does**, which
is the product thesis working — a worker asks in their own language and gets
their employer's English SOP. English DCV dips slightly and is still the correct
top hit, which is a trade worth making.

### Four traps paid for here, so nobody pays twice

1. **`AMAZON_BEDROCK_TEXT`, not `AMAZON_BEDROCK_TEXT_CHUNK`.** Bedrock stores
   each chunk's text as vector metadata, and S3 Vectors caps *filterable*
   metadata at 2048 bytes. If the reserved key is not listed in the index's
   `nonFilterableMetadataKeys`, ingestion reports **COMPLETE** while failing
   every document over that size — 39 of 40, silently. Most examples online say
   `_TEXT_CHUNK`; the live key is `AMAZON_BEDROCK_TEXT`. All three reserved names
   are now listed, because listing one that does not exist is free.
2. **Cohere embedders are behind an AWS Marketplace subscription.** The failure
   is the same two-layer trap as the Anthropic models: it surfaces as
   `aws-marketplace:ViewSubscriptions/Subscribe` denied against the *KB role*.
   Amazon's own `titan-embed-text-v2` is first-party and needs none, so it is the
   default. **Enabling Cohere in the Bedrock console is a worthwhile upgrade** —
   `cohere.embed-multilingual-v3` also outputs 1024 dimensions so the index is
   unchanged, but the KB must be recreated, as the embedding model is immutable.
   Both are already granted to the KB role, so no stack redeploy is needed.
3. **Two S3 Vectors API shapes that reject rather than ignore.** `create-index`
   takes either `indexArn` *or* `vectorBucketArn` + `indexName`, never both
   ("Vector index name should not be present with namespace arn"). And
   `embeddingModelConfiguration` may only be sent for models with configurable
   dimensions — Cohere rejects it outright, Titan accepts it.
4. **`iam:CreateRole` is deliberately absent from the provisioning identity.**
   That is why one KB role is shared and lives in CDK rather than one role per
   org. Isolation is unaffected: it rests on each data source's
   `inclusionPrefixes`, not on the reader's identity.
