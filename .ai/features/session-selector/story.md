---
feature: "session-selector"
type: story
created: 2026-08-24
status: draft
git_branch: "[set at implementation: feature/session-selector-<timestamp>]"
---

## What
A page/panel that lists every session a canvas has ever had (open and
closed) and lets the human pick one — replacing two things that are
currently faked or fragile: `OpenThreadsRail`'s "Past sessions" list and
`HistoryBar`'s time-travel view (both hardcoded against `mock-sessions.ts`
today, real canvases included), and the ambiguous "just guess the most
recent active session" resume path in `use-canvas-hydration.ts`.

## Why
Two separate problems converge on the same missing UI:

1. **Real session history has no real UI.** `session-lifecycle` landed
   Session Complete and carry-forward, and `canvas-dashboard` landed real
   canvas loading, but nothing wired the "past sessions" list or
   `viewSession()`/`HistoryBar` time-travel to real Supabase data —
   they still render `mock-sessions.ts`'s 3-session demo scenario
   regardless of which real canvas is open.
2. **Resuming a canvas can silently pick the wrong session.** Known Gap #7
   (`API-CONTRACT.md`) — the backend doesn't reject a second concurrent
   active session for a canvas. `use-canvas-hydration.ts`'s active-session
   query always takes "whichever active session started most recently,"
   with no way to know if that's the one *this browser* was last working
   in. If two sessions are ever concurrently active (two tabs, two
   devices, a stray retry), a reload can jump the human into a different
   session than the one they left — not just show a wrong "Session N"
   label, but write new nodes against the wrong `session_id`.

A session selector fixes both: real history browsing for (1), and an
explicit human choice instead of a silent guess for (2).

## Context to Load
`CORE-CONCEPTS.md` + `SESSION-FLOWS.md` + `STATE-MANAGEMENT.md` (Canvas
Hydration section)

## Depends On
canvas-dashboard, session-lifecycle (both implemented). Ideally sequenced
after a backend fix to Known Gap #7 (see below) — the selector's
ambiguous-resume path is much simpler to build once `POST /session/start`
can't produce two concurrently active sessions for the same canvas, but
the plain "browse history" half of this story doesn't need that fix.

## Blast Radius
`use-canvas-hydration.ts`, `session-store.ts`, `OpenThreadsRail.tsx`,
`HistoryBar.tsx`; new route/component for the selector itself.

## Files to Touch
```
CREATE:
  src/app/canvas/[canvasId]/sessions/page.tsx   (or a modal/panel — see Risks)
  src/components/session/SessionSelector.tsx
MODIFY:
  src/hooks/use-canvas-hydration.ts   (route to the selector on an
                                        ambiguous/mismatched resume instead
                                        of silently picking one)
  src/components/canvas/OpenThreadsRail.tsx   (real session_learnings-backed
                                        node counts + dates instead of
                                        mock-sessions.ts)
  src/components/canvas/HistoryBar.tsx        (real session lookup instead
                                        of getSession() from mock-sessions.ts)
  src/lib/mock-sessions.ts            (keep only for
                                        NEXT_PUBLIC_USE_MOCK_PERSISTENCE mode)
```

## Contract Impact
Supabase reads only — `sessions` (all rows for a canvas, `id, status,
start_time, end_time, current_phase`), joined against `nodes`/`edges` for
per-session counts. No new backend endpoints required for the "browse
history" half.

The "don't silently resume the wrong session" half depends on closing
**Known Gap #7** backend-side: recommend `POST /session/start` return the
existing active session (id + a computed ordinal) instead of creating a
second one when the canvas already has one active, per the remedy
`API-CONTRACT.md` already names for this gap. Track as a separate
backend prompt/PR — this story's frontend work degrades gracefully
without it (falls back to "most recent active, with a visible chance to
switch" rather than "provably only one active session exists").

## Risks
- **Route vs. modal.** A full page (`/canvas/[canvasId]/sessions`) is
  simpler to build and matches `OpenThreadsRail`'s existing "past
  sessions" entry point conceptually, but breaks the single-page canvas
  feel the rest of the app has (no other canvas interaction navigates
  away from `/canvas/[canvasId]`). A modal/panel keeps that feel but
  needs its own layer above `SessionCompleteModal`/`GroupDeleteConfirm`
  z-indexing. Pick one deliberately, don't default to whichever is less
  code.
- **Two concurrently active sessions, no backend fix yet.** If Known Gap
  #7 isn't closed first, the selector needs to handle *closing* one of
  two active sessions itself (or refuse to, and just let the human pick
  which to continue) — decide this explicitly rather than leaving both
  "active" forever.
- **`sessionNumber` for closed sessions isn't persisted anywhere either**
  (see `API-CONTRACT.md`'s `POST /api/session/start` note — the ordinal
  only exists in that endpoint's response, not as a `sessions` column).
  This story's history list has to derive numbers for every row the same
  way hydration does today (position by `start_time` ascending) — don't
  invent a second derivation that can disagree with hydration's.
- **`node_sequence` vs. actual node ownership** — per-session node counts
  should come from `nodes.session_id`, not `sessions.node_sequence`
  (backend-written, may not stay in sync with deletes — see
  `STATE-MANAGEMENT.md`).

## Definition of Done
- Opening "Past sessions" on a real canvas shows that canvas's actual
  session history (dates, durations from `start_time`/`end_time`, node
  counts) — never `mock-sessions.ts` content for a non-mock canvas.
- Clicking a past (closed) session enters the existing read-only
  `HistoryBar`/time-travel view against real data.
- If canvas hydration ever finds more than one active session (or a
  locally-remembered session id that doesn't match the one it resolved),
  the human is shown a choice instead of the app silently picking one.

## Task Breakdown
NONE — implement directly from this story.
