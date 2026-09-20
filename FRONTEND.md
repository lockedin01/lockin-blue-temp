# Frontend track — session record and work plan

Branch: `frontend`. Scope: `web/` — UI, UX, pages, i18n, PWA, accessibility mode,
and the 3D viewer. Not the `app/api/` route handlers (BACKEND.md) and not the audio
pipeline internals (VOICE.md).

Read `CLAUDE.md` first — its "Frontend" section is the rule list, and several rules
exist because the scaffold already hit the failure. This document is the context.

---

## 1. Who this is for, and why that changes the design

Non-agricultural blue-collar workers in India — industrial electricians, hydraulics
and mechanical maintenance technicians, machine operators. This is not a stylistic
preference; it is a set of hard constraints backed by research:

- **Language and access, not desire, are the adoption barriers.** Growth is
  concentrated in tier-3 cities and rural areas. Voice interfaces remove literacy as
  a gate. So multilingual **navigation** matters, not just multilingual tutoring.
- **This demographic's smartphone use centres on communication and entertainment,
  with low engagement on institution-style digital services.** So the worker-facing
  app must read like a consumer app, not an enterprise portal. Dashboard density
  belongs to manager and admin only.
- **Low-end Android on unreliable network.** The PWA is the delivery mechanism, not
  an enhancement. 3D is the most expensive thing on the page and needs a 2D path.
- **Hands are holding tools.** Voice is ergonomic, not decorative. Tap targets are
  large; one primary action per screen.

The product is **strictly B2B** — a worker arrives only via an employer's invite.
There is no sign-up screen, and building one would fail at runtime anyway because
Cognito self sign-up is disabled at the pool level.

---

## 2. What exists

Scaffolded, lints, builds — 24 routes.

```
src/app/(auth)/login              src/app/(manager)/dashboard
src/app/(auth)/invite/[code]      src/app/(manager)/workers
src/app/(worker)/onboarding       src/app/(manager)/content
src/app/(worker)/plan             src/app/(manager)/knowledge-base
src/app/(worker)/lesson/[id]      src/app/(admin)/users
src/app/(worker)/assessment/[id]  src/app/(admin)/departments
src/app/(worker)/progress         src/app/(admin)/invites
src/app/offline                   src/app/(admin)/settings

src/app/manifest.ts               PWA manifest
public/sw.js                      service worker, split cache policy
src/i18n/                         config, provider, messages/{en,hi,mr}.json
src/components/providers/         accessibility-provider, service-worker
src/components/viewer/            machine-viewer (model-viewer + 2D fallback)
src/lib/                          types, keys, ddb, amplify, utils
```

Every page is a placeholder returning a single line. `src/app/page.tsx` is still the
create-next-app template and needs replacing with a role-aware redirect.

Stack: Next.js 16.3.5 (App Router, Turbopack), Tailwind v4, shadcn/ui,
Framer Motion, Zod, `@google/model-viewer`, `aws-amplify`.

---

## 3. Decisions already made

**`<model-viewer>`, not three.js/react-three-fiber.** Far smaller payload, native
GLB + Draco + KTX2, declarative hotspots, free AR on Android. three.js is reserved
for true simulation behaviour, which is explicitly PITCH (not built). The 3D viewer
earns its cost only in this vertical — that is why the vertical was narrowed.

**The 2D fallback is a feature, not a degradation.** On accessibility mode or a
`saveData`/2g connection, the viewer renders a pre-rendered poster plus a tappable
hotspot list wired to the *same* `onPartSelected` callback. Tap-a-part-and-ask must
work identically on both paths.

**Amplify default token storage.** Chosen to simplify — refresh rotation and expiry
are handled by the library rather than a custom httpOnly-cookie BFF.

**Route groups `(worker)`/`(manager)`/`(admin)` are organisation, not access
control.** They add no URL segment, so `/plan`, `/dashboard` and `/users` share one
flat namespace that any signed-in user can type. Group layouts that check role and
redirect are UX gating; the enforcement boundary is the route handler.

---

## 4. The demo moment you are building toward

**Tap a part in the 3D model, ask about it out loud, get an answer about that
specific component from your employer's own SOPs, in your own language.**

No competitor does this — the incumbent (LunchBox Sessions) is English-only,
desktop-first and mouse-driven, with generic publisher-authored content. This is the
single clearest differentiator and it is the last thing to be cut.

The full spine: org admin invite → worker onboarding → generated learning plan →
lesson with a 3D model → tap-a-part-and-ask → assessment → progress.

---

## 5. Traps specific to this codebase

Full list in CLAUDE.md. The expensive ones:

1. **This is Next 16, not the Next.js in your training data.** `params`,
   `searchParams`, `cookies()`, `headers()` are **async-only** — the synchronous
   fallback was removed, not deprecated. Read
   `web/node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`
   before non-trivial work. `web/AGENTS.md` says this too; it is auto-written by
   `next dev`, so leave it alone.
2. **Type props with the typegen globals** — `LayoutProps<'/'>`,
   `PageProps<'/lesson/[lessonId]'>`. Route groups are not in the route literal. The
   scaffold is currently inconsistent (layout uses the helper, two pages hand-write
   `params: Promise<…>`); converge on the helper.
3. **No `setState` inside an effect.** This already failed lint during scaffolding.
   For persisted client state use the module-store + `useSyncExternalStore` pattern
   in `accessibility-provider.tsx`, which also gives a correct SSR snapshot. The
   i18n provider still uses plain `useState` and needs this treatment when locale
   persistence lands.
4. **React 19 custom-element typing** goes in the `react` module namespace, not the
   old global one — see `src/types/model-viewer.d.ts`. This cost a build failure.
5. **`resolve()` returns the dotted path on a miss**, so a partial translation ships
   the key as visible UI text. Add every key to all three message files together.
6. **The root layout hardcodes `lang="en"`** while shipping hi and mr. Drive it from
   the locale.
7. **Never query-string-bust asset URLs** — `sw.js` caches them cache-first with no
   expiry. Bump `VERSION` in `sw.js` instead. Never add `/api/` to the SW cache;
   stale progress is worse than an error.
8. **`src/lib/ddb.ts` is server-only.** Do not import it into a client component.
9. **Do not scaffold Amplify Data/GraphQL.** It ships in `node_modules` and is one
   command away — it would be a fourth backend surface.

---

## 6. Work order

1. **Replace `src/app/page.tsx`** with the role-aware redirect (worker → `/plan`,
   manager → `/dashboard`, admin → `/users`).
2. **Pick the server-session mechanism** — `@aws-amplify/adapter-nextjs` with
   `runWithAmplifyServerContext`, or read the Amplify cookie and verify with
   `aws-jwt-verify`. Neither package is installed; this is an explicit decision.
   Then add per-group `layout.tsx` role gating.
3. **Design pass before component work.** Worker screens: one action, large targets,
   icon-forward, minimal text. Manager/admin: dense is fine.
4. **Accessibility mode as CSS** driven by the `data-a11y="on"` attribute the
   provider already sets on `documentElement`. `globals.css` has no such rules yet.
   Do not branch JSX per component.
5. **The worker spine first**: onboarding → plan → lesson (with viewer) →
   assessment → progress. Nothing else until that is walkable.
6. **Voice panel UI**, coordinating with VOICE.md — the panel, the hold-to-ask
   button and the transcript display are yours; the mic capture and ordered playback
   are theirs. Agree the interface early.
7. **i18n sweep** — every user-visible string through `t()`, all three files in step.
8. **Manager, then admin screens.** These are first in the cut order, so build them
   last and be ready to reduce the dashboard to a static stub.
9. **PWA verification on a real low-end handset**, not just a desktop viewport.

## 7. Coordination

- **Response shapes are the types in `web/src/lib/types.ts`.** Build against those
  rather than guessing, and ask BACKEND.md to publish each handler as it lands.
- The six `/api/*` handlers currently return `501`. Expect to develop against
  fixtures for a while — keep the fixture shape identical to the types.
- 3D assets: one or two pre-converted GLB models, Draco-compressed, with a poster
  for the 2D path. Author them fresh — `reference/LunchboxSessions-Data/` is
  off-limits as a content source (see CLAUDE.md).
