# Voice track — session record and work plan

Branch: `voice`. Scope: `services/voice/` end to end, plus the browser-side mic
capture and audio playback that talk to it.

Read `CLAUDE.md` first — its "Voice service" section is the rule list, and every
rule there came from a bug someone already hit. This document is the context and
the order.

---

## 1. What this is and why it looks like this

The feature: a worker holds a button, asks a question out loud in Hindi, Hinglish or
another Indian language, watches their words appear **while still speaking**, and
gets a short spoken answer back in the same language, grounded in their employer's
own SOPs.

```
mic → Sarvam saaras:v3-realtime (streaming STT)
    → Bedrock Claude Haiku 4.5 (streamed)
    → Sarvam bulbul:v3 streaming TTS (/text-to-speech/ws)
    → Web Audio → speaker
```

**Why not one request that does everything.** Upload the clip, recognise, think,
synthesise, return — that is roughly seven seconds during which the screen says
"listening → thinking → speaking" and shows nothing else. The complaint that
produces is never "this is slow"; it is *"I can't tell if it heard me."* A progress
line that reads identically whether the microphone works or not is not feedback.

Nothing here is faster than the APIs it calls. What changes is that the stages
**overlap** and each reports as it lands:

| stage | what the worker sees |
| --- | --- |
| speaking | recognition runs on live audio; words appear as they are said |
| release | the transcript is already final — recognition costs ~0 extra |
| thinking | the model streams, so the answer appears word by word |
| sentence 1 | synthesised while the model is still writing sentence 2 |
| audio | playback starts on sentence one, not the last one |

**Why voice at all, beyond literacy.** On a shop floor the worker's hands are holding
tools or are dirty. Hands-free is an ergonomic requirement in this vertical, not only
an accessibility affordance. Research also puts language and access — not desire — as
the primary barriers to digital adoption for this workforce, concentrated in tier-3
and rural areas.

---

## 2. Architecture decisions

**Sarvam replaced Amazon Nova 2 Sonic.** Nova 2 Sonic bidirectional speech-to-speech
was the original locked choice and was dropped 2026-09-17: too new and too thinly
documented to risk in a four-day build when a working Sarvam reference
implementation existed. Reasoning still runs on Bedrock, so the AWS story holds.
Nova 2 Sonic's model id is recorded in HANDOFF.md only in case of a revert.

**App Runner, not Lambda.** The service holds a browser WebSocket plus two Sarvam
sockets concurrently, and a warmed channel lives up to 15 minutes across many turns.
No request-scoped runtime holds that. Chosen over ECS Fargate for lower ops overhead.

**`SARVAM_API_KEY` is server-side only, and that is structural, not hygiene.** A
browser `WebSocket` cannot set the `api-subscription-key` *header* that Sarvam's
realtime endpoint requires, so proxying through this service is forced regardless.

**Bedrock via SigV4 on the task role.** No API keys for the model. The reference
implementation called Groq/Anthropic HTTP APIs with a bearer token — do not carry
that over; it is the fastest way to lose the "Built on AWS" story.

---

## 3. What exists

`services/voice/` is scaffolded, typechecks, and its Docker image builds. Every
functional entry point throws `not implemented` — deliberately, so nothing fakes
behaviour. The files carry the operational knowledge as comments.

```
src/index.ts          Express + http.Server, attaches the WS endpoint
src/config.ts         env parsing; Sarvam + Bedrock + Cognito config
src/auth/cognito.ts   aws-jwt-verify against the Cognito JWKS
src/sarvam/stt.ts     saaras:v3-realtime client
src/sarvam/tts.ts     bulbul:v3 streaming client, speakable() guard
src/sarvam/client.ts  translate + batch TTS + LANGUAGES + GLOSSARY
src/bedrock/stream.ts InvokeModelWithResponseStream wrapper
src/voice/channel.ts  WS endpoint: upgrade guards, auth, channel lifecycle
src/voice/turn.ts     one turn: speculation, reconciliation, streamed speech
src/routes/health.ts  /healthz and /voice/config
```

**`reference/voice-tutor/` is a reference implementation from another project, not a
dependency.** Read it for orchestration shape. Never import from it, never mount it.
Its `auth.js` verifies HS256 against a shared `JWT_SECRET` and queries a SQL
`users.banned_at` — ours verifies RS256 against Cognito. Its `llm.js` is the
Groq/Anthropic path described above.

---

## 4. The traps — all of these are already-paid-for knowledge

Full list in CLAUDE.md. The ones that will cost you a day if forgotten:

1. **`bulbul:v3` kills the ENTIRE reply on a "empty" text message.** `" "`, `"\n\n"`,
   `","`, `"."`, `"("` are all rejected, and streaming models emit exactly these as
   deltas. One such message loses all of the reply's audio. Gate every `sendText` on
   `speakable()`; ride unspeakable fragments along with the adjacent word rather than
   sending or dropping them.
2. **`saaras:v3` and `saaras:v3-realtime` are different endpoints.** The batch one
   cannot start until audio stops — that is the entire problem being solved.
3. **STT partials are not monotonic.** Sarvam replays a segment from the start in
   fast bursts and re-sends the same partial during silence. A partial that is a
   character-prefix of what you hold is a replay, not news — ignore it, or the
   transcript flickers backwards and speculation restarts.
4. **Per-sentence TTS finishes out of order.** Every piece carries an index; the
   client plays strictly in index order, never on arrival.
5. **Sentence splitting must handle the Devanagari danda `।`** or Hindi never splits.
   A decimal point is not a sentence end ("2.5 bar").
6. **Do not translate the question to English before the model.** Measured at ~1.2s
   of pure waiting for zero benefit — Claude reads Devanagari and Hinglish directly.
7. **Silence is not a question.** A silent mic can "transcribe" as punctuation with a
   confidently detected language, and the model will answer it. If the final has no
   letters, send `empty`.
8. **Queue audio captured before the Sarvam socket opens.** That first half-second is
   where the question usually starts.
9. **50ms frames, not the 100ms Sarvam suggests.** That buffer is paid on the first
   word — the one being watched for.
10. **The token goes in the first frame, never the URL.** Query strings land in proxy
    logs and browser history.
11. **A WebSocket upgrade bypasses Express entirely** — no CORS, no rate limiting, no
    same-origin policy. The `Origin` check in `channel.ts` is the only thing stopping
    any site from opening a socket on a user's token.

---

## 5. Blocker to settle with the backend track

`services/voice/src/auth/cognito.ts` is pinned to `tokenUse: 'access'`, but Cognito
access tokens carry no `custom:*` attributes — so `VoiceUser.orgId` would be
`undefined` and turns would authorize with no tenant. The naive implementation
compiles and runs, which is what makes it dangerous.

Options: verify the **ID token** (carries the declared custom attributes), or take
`role` from `cognito:groups` and load `orgId` from `USER#<sub>`/`PROFILE`. Decode a
real token and confirm before building. Never resolve it by reading `orgId` from the
request. This is shared with the backend track — settle it once.

---

## 6. Work order

1. **`verifyToken`** — after the claims question above is settled.
2. **`channel.ts`**: the `upgrade` handler with Origin check, `MAX_SOCKETS_PER_USER`,
   `MAX_AUDIO_FRAMES`, then the frame protocol (`start`/`begin`/`audio`/`stop`/
   `cancel`) and the idle + lifetime timers. The constants are declared and `void`ed;
   wire them up.
3. **`sarvam/stt.ts`** — realtime socket, pending-frame queue, replay detection.
4. **`bedrock/stream.ts`** — `InvokeModelWithResponseStream`, yielding text deltas.
5. **`sarvam/tts.ts`** — streaming socket, `speakable()` gating, seq numbering.
6. **`voice/turn.ts`** — tie them together: open both vendor sockets at `begin`,
   speculative start while the button is held, reconcile against the final, stream
   deltas into TTS, script check with exactly one restart.
7. **Browser side** — `mic.js`-equivalent (AudioWorklet capture, zero-gain node,
   resampling to 16kHz) and the ordered player. Coordinate with FRONTEND.md: the
   panel UI is theirs, the audio pipeline is yours.
8. **Dockerfile → ECR → App Runner**, then end-to-end against a real handset.

Test without a microphone by synthesising speech with Sarvam TTS, resampling to
16kHz, and feeding it into your own socket in 50ms frames at wall-clock speed — the
reference implementation did exactly this and it is the only way to exercise
"while still speaking" rather than assert it.
