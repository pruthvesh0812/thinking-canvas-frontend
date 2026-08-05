---
feature: "session-lifecycle"
type: story
created: 2026-07-05
status: implemented
git_branch: "claude/story-7-modal-carry-forward-jca7ls"
---

## What
The session arc: north star capture on canvas creation, phase toggle, the
three-screen Session Complete modal, unresolved-thread extraction, and
carry-forward into the next session.

## Why
Session Complete is the human-controlled gate for all end-of-session AI
activity — the Observer only ever speaks here. Without it the product has a
beginning but no end, and nothing learns across sessions.

## Context to Load
`CORE-CONCEPTS.md` + `SESSION-FLOWS.md`

## Depends On
ghost-interaction (screen 1 accepts observations onto the canvas using the
same materialization path)

## Blast Radius
`/canvas/new` page, session components (new), session store, api.ts.

## Files to Touch
```
CREATE:
  src/components/session/PhaseToggle.tsx
  src/components/session/SessionCompleteModal.tsx   (3-screen shell + state machine)
  src/components/session/ObserverSuggestions.tsx    (screen 1 — session_learnings cards)
  src/components/session/UnresolvedThreads.tsx      (screen 2 — frontend-computed)
MODIFY:
  src/app/canvas/new/page.tsx      (north star capture → canvases insert → session/start)
  src/stores/session-store.ts      (phase, modal state)
  src/lib/api.ts                   (sessionComplete wrapper)
```

## Contract Impact
- Supabase: `canvases` insert (original_intent, INSERT-once); `sessions.current_phase`
  write (toggle); reads + writes `session_learnings` (screen 2 choices, carry-forward
  load on next start).
- Backend: `POST /api/session/complete` (async — screen 1 shows an "Observer is
  reading your canvas" state and polls `session_learnings`).
- ⚠ `carry_forward_ids` ordering asymmetry — see SESSION-FLOWS.md → the modal
  note. v1: complete with `[]`, write screen-2 choices from the frontend.

## Risks
- Phase toggle → converging makes the Stress-Tester eligible; verify a
  challenge ghost actually arrives (this exercises a backend path nothing
  else does).
- Unresolved extraction is frontend-computed (question edges unanswered, empty
  nodes, unfollowed contradictions) — define "unanswered" precisely: no
  outgoing follow-up node from the question edge's target.

## Definition of Done
New canvas via north star prompt (intent visible, not editable). Toggle to
converging → stress-test ghost appears. Session Complete → observer
observations listed → unresolved threads listed with carry choices → session
closed; reopening the canvas starts a new session with carried items rendered
as visually distinct pre-loaded nodes.

## Task Breakdown
NONE — implement directly from this story.

## Implementation Notes (2026-08-05)
Built on the contract layer before stories 3-6 landed, so two things differ
from the file list above:
- `session-store.ts` is **created** here, not modified, and it owns the whole
  session arc (canvas meta, session id, phase, modal, carried items). The
  screen-2 graph read is a one-shot Supabase query, not canvas-store state —
  swap it for canvas-store once canvas-core lands.
- Carried threads render through `src/components/session/CarriedForwardNode.tsx`,
  a React Flow node type registered in `canvas-shell.tsx`. When `Canvas.tsx`
  arrives, move the registration there.
- `api.ts` needed no change — the `sessionComplete` wrapper already existed.

v1 decisions on the flagged asymmetries:
- `carry_forward_ids: []` on complete; screen-2 picks are written as
  `session_learnings` rows from the browser. That write is **not** in
  API-CONTRACT.md's frontend-write list, so RLS may refuse it — the failure is
  surfaced on screen 3 rather than swallowed.
- Carry-forward loads the **most recent non-active session only** (the badge is
  "carried from last session"); `session_learnings` has no resolved column to
  walk further back safely. Rows already materialized onto the canvas are
  filtered out by id match.
- "Resolve now" is intentionally in-memory (a next-few-minutes intent), while
  "Carry forward" is durable.
