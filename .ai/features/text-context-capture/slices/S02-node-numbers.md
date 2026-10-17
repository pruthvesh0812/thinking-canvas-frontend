# S02 — Node numbers come from the database

**Goal:** `n1, n2…` on nodes are assigned by the database, so two browsers show the same numbers and a number is never reused.
**Why a slice:** end to end on its own — create a node, see its number, reload, see the same number. Needs no notes.
**Depends on:** S01, BK-1, BK-4a.

## What changes
- `use-canvas-persistence.ts`: node `upsert`/`insert` now `.select('id, seq')`; write the returned `seq` into the store. Never send `seq`. Duplicated nodes get their own new number.
- `use-canvas-hydration.ts`: add `seq` to the nodes select; put it in the store.
- `use-context-notes.ts` (`useContextLifecycle`): stop assigning numbers for real canvases; keep the browser assigner for mock mode (BK-3).
- AI nodes (accepted ghosts) show a number per BK-4a.

## Not in this slice
Anything about notes.

## Test (for you)
1. New canvas: add 3 nodes → `n1, n2, n3`; reload → unchanged.
2. Open the same canvas in a second browser → same numbers.
3. Delete `n3`, add a node → it is `n4`, not `n3`.
4. Edit a node's text → its number does not change.
5. Duplicate a node → it gets a new number.
6. Mock mode still numbers nodes locally.

## Done when
`tsc` + `lint` clean; the four checks above pass on your database.

## Rollback
Revert; numbers go back to browser-assigned.
