---
feature: "session-selector"
type: story
created: 2026-08-24
status: partially-implemented
git_branch: "claude/new-canvas-north-star-bug-taof6j"
---

## Update (2026-08-24, second pass) — SessionLanding shipped; OpenThreadsRail remains

Most of this story landed as `SessionLanding` (`src/components/session/
SessionLanding.tsx`) — real session history browsing on reopening a canvas,
via `src/lib/session-history.ts`'s `fetchSessionHistory` (real `sessions`
rows: id, status, start_time, end_time, node counts from `nodes.session_id`,
1-indexed ordinal matching `POST /api/session/start`'s own derivation).
`HistoryBar.tsx` reads real `session-store.pastSessions` in non-mock mode
instead of `mock-sessions.ts`. Session Complete's "Done" (screen 3) also
routes through this same screen now (`use-session-lifecycle.ts`'s
`startNewSession` → `returnToSessionLanding`) rather than opening the next
session directly — see `SESSION-FLOWS.md`.

Earlier update (same day, first pass): the ambiguous-resume half of this
story's original motivation resolved separately — `thinking-canvas-be`
commit `a46d851` made `POST /session/start` idempotent per canvas (returns
the existing active session instead of creating a sibling), closing
`API-CONTRACT.md`'s Known Gap #7. `use-canvas-hydration.ts` now defers that
call entirely (rather than calling it eagerly) whenever there's closed
history and nothing active — see `SessionLanding`'s doc comment.

**What's left:** `OpenThreadsRail`'s own "Past sessions" section (the
in-canvas rail, a *different* entry point into `viewSession()` than
SessionLanding) is still hardcoded against `mock-sessions.ts`'s 3-session
demo scenario. The real data it needs (`session-store.pastSessions`) now
exists — wiring it up is a small follow-up, not a rewrite.

## What
Wire `OpenThreadsRail`'s "Past sessions" list to `session-store.pastSessions`
(real data, same as `SessionLanding`/`HistoryBar` already use) instead of
`mock-sessions.ts`, so a real canvas's in-canvas history rail matches its
real session history rather than the seeded demo's fake dates and counts.

## Why
`SessionLanding` and `HistoryBar` both read real session history now;
`OpenThreadsRail` is the one remaining surface still showing fabricated
data for a real canvas — worth closing rather than leaving two "past
sessions" UIs disagreeing with each other on the same live canvas.

## Context to Load
`SESSION-FLOWS.md` + `STATE-MANAGEMENT.md`

## Depends On
None further — `session-store.pastSessions` and `session-history.ts`
already exist.

## Blast Radius
`OpenThreadsRail.tsx` only.

## Files to Touch
```
MODIFY:
  src/components/canvas/OpenThreadsRail.tsx   (real session-store.pastSessions
                                        node counts + dates instead of
                                        PAST_SESSIONS/mock-sessions.ts, in
                                        non-mock mode — mirror HistoryBar.tsx's
                                        USE_MOCK_PERSISTENCE branch)
```

## Contract Impact
None — `session-store.pastSessions` is already populated by hydration.

## Risks
- `OpenThreadsRail`'s `nodeCountFor` currently counts `canvas-store` nodes
  by `data.sessionNumber` (per-node, live-canvas-scoped) rather than
  `PastSessionSummary.nodeCount` (pre-aggregated at hydration time) — decide
  which source of truth to keep; they should already agree since hydration
  now tags real nodes' `sessionNumber` correctly (`use-canvas-hydration.ts`),
  but computing it twice two different ways invites future drift.
- Mock mode's own exercise of the rail (`PAST_SESSIONS`) must keep working
  unchanged — same `USE_MOCK_PERSISTENCE` branch `HistoryBar.tsx` already
  uses as the template.

## Definition of Done
Opening the Threads rail's "Past sessions" section on a real canvas shows
that canvas's actual session history — never `mock-sessions.ts` content for
a non-mock canvas. Clicking a past session there enters the same real
`HistoryBar`/time-travel view `SessionLanding`'s equivalent action already
does.

## Task Breakdown
NONE — implement directly from this story.
