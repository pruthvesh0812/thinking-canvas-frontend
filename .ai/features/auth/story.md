---
feature: "auth"
type: story
created: 2026-07-05
status: partial
git_branch: "claude/database-types-frontend-ijktif"
---

## Partial Implementation Note (2026-08-09)

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
