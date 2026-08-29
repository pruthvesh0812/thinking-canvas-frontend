---
feature: "session-selector"
type: story
created: 2026-08-24
status: draft
git_branch: "[set at implementation: feature/session-selector-<timestamp>]"
---

## Update (2026-08-24) — half the original motivation is now resolved

This story was originally written to fix two problems at once: no real UI
for session history, and an ambiguous canvas-resume path that could
silently land a human in the wrong session. The backend closed the second
one directly (`thinking-canvas-be` commit `a46d851`, "Enforce single active
session per canvas in session/start") — `POST /session/start` is now
idempotent per canvas: if one session is already active, it's returned
as-is instead of a sibling being created, so there's no longer a case where
more than one active session exists to be ambiguous about. `use-canvas-
hydration.ts` was updated to call it unconditionally (fresh start or
resume) instead of pre-checking and guessing. See `API-CONTRACT.md`'s
`POST /api/session/start` section — the closed gap is no longer listed in
its Known Gaps table.

What's left, and what this story now scopes to: real session **history**
browsing — `OpenThreadsRail`'s "Past sessions" list and `HistoryBar`'s
time-travel view are still hardcoded against `mock-sessions.ts`'s 3-session
demo scenario, even on a real canvas.

## What
A page/panel that lists every session a canvas has ever had (open and
closed) and lets the human jump into a past one for read-only time-travel —
replacing `OpenThreadsRail`'s "Past sessions" list and `HistoryBar`'s
time-travel view, both still rendering `mock-sessions.ts` regardless of
which real canvas is open.

## Why
`session-lifecycle` landed Session Complete and carry-forward, and
`canvas-dashboard` landed real canvas loading, but nothing wired the "past
sessions" list or `viewSession()`/`HistoryBar` to real Supabase data — a
canvas with real session history still shows the seeded demo's fake dates,
durations, and Observer notes instead of its own.

## Context to Load
`CORE-CONCEPTS.md` + `SESSION-FLOWS.md` + `STATE-MANAGEMENT.md` (Canvas
Hydration section)

## Depends On
canvas-dashboard, session-lifecycle (both implemented).

## Blast Radius
`OpenThreadsRail.tsx`, `HistoryBar.tsx`, `session-store.ts`; new
component(s) for the selector itself.

## Files to Touch
```
CREATE:
  src/components/session/SessionSelector.tsx   (or inline into
                                        OpenThreadsRail — see Risks)
MODIFY:
  src/components/canvas/OpenThreadsRail.tsx   (real session_learnings/nodes
                                        -backed node counts + dates instead
                                        of mock-sessions.ts)
  src/components/canvas/HistoryBar.tsx        (real session lookup instead
                                        of getSession() from mock-sessions.ts)
  src/lib/mock-sessions.ts            (keep only for
                                        NEXT_PUBLIC_USE_MOCK_PERSISTENCE mode)
```

## Contract Impact
Supabase reads only — `sessions` (all rows for a canvas, `id, status,
start_time, end_time, current_phase`), joined against `nodes` for
per-session counts. No backend endpoints needed.

## Risks
- **`session_number` for a given row isn't persisted anywhere** (see
  `API-CONTRACT.md`'s `POST /api/session/start` note — the ordinal only
  ever exists in that endpoint's response, not as a `sessions` column).
  This story's history list has to derive a number for every row itself —
  its own array position in an all-sessions-for-canvas query ordered by
  `start_time` ascending, same derivation the (now-idempotent)
  `session/start` uses server-side. Don't invent a second scheme that can
  disagree with it (e.g. don't try to read it off a currently-active
  session's last-known `session/start` response and reuse that for
  unrelated closed rows).
- **`node_sequence` vs. actual node ownership** — per-session node counts
  should come from `nodes.session_id`, not `sessions.node_sequence`
  (backend-written, may not stay in sync with deletes — see
  `STATE-MANAGEMENT.md`).
- **Where it lives.** `OpenThreadsRail`'s existing "Past sessions" section
  is the natural home for a short list, but a canvas with many sessions
  may want its own page/modal rather than growing the rail indefinitely —
  decide the cutoff (e.g. rail shows N most recent + "see all") rather
  than defaulting to whichever is less code.

## Definition of Done
Opening "Past sessions" on a real canvas shows that canvas's actual session
history (dates, durations from `start_time`/`end_time`, node counts) —
never `mock-sessions.ts` content for a non-mock canvas. Clicking a past
(closed) session enters the existing read-only `HistoryBar`/time-travel
view against real data.

## Task Breakdown
NONE — implement directly from this story.
