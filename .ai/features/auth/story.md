---
feature: "auth"
type: story
created: 2026-07-05
status: done
git_branch: "feature/auth-implementation-2026-09-18T1219"
---

## Closed (2026-09-18)

Both blockers this story was waiting on (canvas-dashboard's real Supabase
query, session-lifecycle's real `sessionNumber`) had already landed by the
time this was picked back up — confirmed against the actual code, not
assumed. Delivered:

- `src/proxy.ts` (Next 16 renamed `middleware.ts` → `proxy.ts`; same
  convention) — the session-2+ gate on `/canvas/*`, backed by
  `src/lib/supabase-middleware.ts`'s `@supabase/ssr` server client.
- `src/app/login/page.tsx` — Google OAuth + email/password, branching on
  whether the current session is anonymous (convert in place via
  `linkIdentity`/`updateUser`) or not (ordinary `signInWithOAuth`/
  `signInWithPassword`/`signUp`).
- `src/app/auth/callback/route.ts` — the PKCE code-exchange landing point
  both OAuth paths redirect through.
- `src/components/auth/SignupPrompt.tsx`, wired into
  `SessionCompleteModal.tsx`'s screen 3, gated on
  `session-store.pastSessions.length === 0` (this canvas's first-ever
  session close) and `is_anonymous`.
- `src/components/auth/AnonymousAuthGate.tsx`, mounted in the root layout —
  `useAnonymousAuth` was dead code (unused anywhere) before this; moving it
  app-wide was safe because `lib/supabase.ts`'s lazy Proxy client (added
  after this story's 2026-08-09 note) already made importing it build-safe
  without env vars.
- `src/lib/auth.ts` gained `continueWithGoogle` / `signUpWithEmail` /
  `signInWithEmail`.

No backend changes needed — confirmed against `thinking-canvas-be`'s RLS
migration (`20260609000003_rls_and_indexes.sql`): every policy keys off
`auth.uid()` with no anonymous/permanent distinction, so identity-linking
conversion (same uid) needs no RLS change. **Not code, but still required
before this works in any real environment:** the Supabase project needs the
Google OAuth provider configured (Client ID/secret, authorized redirect URI
`<origin>/auth/callback`) in the Supabase dashboard — that's project
configuration, not something either repo's code can do.

## Addendum (2026-09-19) — account page, verification, sign-out

- `src/app/account/page.tsx` — guest / verification-pending / verified
  states, resend confirmation (`auth.resend`), set-or-change password, and
  sign out. Reached from the dashboard's avatar (now a real link with the
  user's initial). Sign-out is offered to permanent accounts only: a guest
  can't sign back in, so logging one out would orphan their canvases.
  It signs out with `scope: 'local'` (this browser only) and hard-navigates
  to `/login?signedOut=1` so every in-memory Zustand store is discarded.
- **Correction to the Closed note above:** email conversion is NOT a single
  `updateUser({ email, password })`. Per Supabase's docs a password can't be
  set on an unverified anonymous user, so it's two steps: `updateUser({ email })`
  (confirmation link; `emailRedirectTo` = the bare `/auth/callback`), then
  `updateUser({ password })` from `/account` after verifying. `/login`'s
  create mode is email-only accordingly.
- `emailRedirectTo` now follows the same exact-match rule as the OAuth
  `redirectTo` (see ARCHITECTURE.md) — the confirmation link would otherwise
  have hit the same `site_url` fallback.
- `/login` shows a resend option on `email_not_confirmed` (only reachable once
  the project enables email confirmations — off locally, on in prod) and a
  pointer to `/account` for a guest with a link already pending.
- Local dev **auto-confirms**: `enable_confirmations = false` sets
  `GOTRUE_MAILER_AUTOCONFIRM=true`, which makes Supabase apply an email change
  IMMEDIATELY — no email is sent and the guest is permanent on the spot (their
  row shows `is_anonymous = f`, `email_confirmed_at` set). `signUpWithEmail`
  reads `data.user.new_email` from the response to tell "link sent" from
  "applied now"; the latter routes to `/account` to set a password. To
  exercise the real link flow locally, set `enable_confirmations = true` in
  the backend's `supabase/config.toml` and restart Supabase — mail then lands
  in the local inbox (port 54324; local Supabase never sends real email).
  `auth.rate_limit.email_sent = 2`/hour throttles repeated resends.
- Both `/login` and `/account` await `ensureAnonSession()` before reading the
  user: the root-layout gate creates the guest session concurrently, and a bare
  `getUser()` can lose that race (stale "Create your account" heading right
  after sign-out; a dead-end error on a first-ever `/account` visit).

## Partial Implementation Note (2026-08-09) — historical, see Closed above

Only the anonymous sign-in slice has landed — `src/hooks/use-anonymous-auth.ts`,
called from `CanvasShell` (`src/app/canvas/[canvasId]/canvas-shell.tsx`), not
the root layout. This was pulled forward out of build order to unblock RLS
errors on node writes (canvas-core's Supabase insert needs a real
`auth.uid()`). Scoped to the canvas surface rather than app-wide: mounting it
in `layout.tsx` put `src/lib/supabase.ts` (which throws at module load
without env vars) on the static-prerender path of every route, including
ones that don't write to Supabase (`/`, `/login`, `/settings`) — that broke
`npm run build` in any environment without Supabase env vars set at build
time. Move it up to the root layout once the signup-prompt/middleware work
below actually needs auth state app-wide.

**Still blocked on this story's own "Depends On: canvas-dashboard" (#8) and,
transitively, session-lifecycle (#7):**
- `src/middleware.ts` — the "session 2+" gate needs real session/dashboard
  data; today's `sessionNumber` is a hardcoded mock (`CURRENT_SESSION_NUMBER`
  in `mock-sessions.ts`), so gating on it would be gating on fake data.
- `SignupPrompt.tsx` — fires after the first real Session Complete, which
  doesn't exist yet (session-lifecycle, #7).
- `/login` page — still the static stub; no Google OAuth / email-password
  wiring yet, since anonymous→permanent conversion has nothing to gate into.
- `src/lib/supabase.ts` `@supabase/ssr` browser/server split — not needed
  yet; nothing server-side reads auth state (no middleware, no Server
  Component queries gated on the user).

Do not build the above against mock data when picking this back up — wait
for #7/#8, per IMPLEMENTATION-ORDER.md's own rule against fudging gaps.

## What
Anonymous-first auth: silent anonymous sign-in on first visit, account
creation prompt after the first Session Complete, anonymous→permanent
conversion (same uid), and the middleware gate for session 2+.

## Why
Zero-friction first session is a product decision — the user must feel the
value before being asked for an email. RLS also silently returns empty result
sets without a valid auth session, so this story unblocks real multi-user data.

## Context to Load
`ARCHITECTURE.md` + `SESSION-FLOWS.md`

## Depends On
canvas-dashboard

## Blast Radius
Supabase client (SSR variant), middleware (new), login page, Session Complete
screen 3, dashboard.

## Files to Touch
```
CREATE:
  src/middleware.ts               (session 2+ gate on /canvas/*)
  src/components/auth/SignupPrompt.tsx  (post-first-Session-Complete)
MODIFY:
  src/lib/supabase.ts             (@supabase/ssr browser/server split)
  src/app/login/page.tsx          (Google OAuth + email/password)
  src/components/session/SessionCompleteModal.tsx (screen 3 → SignupPrompt)
```

## Contract Impact
- Supabase Auth only: `signInAnonymously()`, `linkIdentity` (Google) /
  `updateUser` (email+password) for conversion — same uid, so all RLS rows
  carry over with **no data migration**.
- No backend endpoints. RLS policies live in the backend repo's migrations.

## Risks
- Anonymous session loss (cleared storage) orphans the canvas — surface the
  signup prompt copy honestly ("create an account to keep this").
- Middleware must not gate `/` or `/login`; only `/canvas/*` and only when the
  user already has ≥1 closed session and no permanent account.

## Definition of Done
First visit: canvas works with zero prompts. After first Session Complete:
signup prompt; converting via Google or email keeps every existing canvas.
Second canvas/session without an account → redirected to /login. RLS verified:
user B cannot read user A's canvas by URL.

## Task Breakdown
NONE — implement directly from this story.
