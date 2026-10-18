# S02 — Node numbers come from the database

**Goal:** `n1, n2…` on nodes are assigned by the database, so two browsers show the same numbers and a number is never reused.
**Why a slice:** end to end on its own — create a node, see its number, reload, see the same number. Needs no notes.
**Depends on:** S01; your local database with the three backend migrations applied.

## What changes
- `use-canvas-persistence.ts`: node `upsert`/`insert` now `.select('id, seq')`; write the returned `seq` into the store. Never send `seq`. Duplicated nodes get their own new number.
- `use-canvas-hydration.ts`: add `seq` to the nodes select; put it in the store.
- `use-context-notes.ts` (`useContextLifecycle`): stop assigning numbers for real canvases; keep the browser assigner for mock mode (BK-3).
- AI nodes (accepted ghosts) show a number (decided: yes, same `nK` style as human nodes).

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

## What actually changed (built)
- `canvas-store.ts`: `CanvasNodeData.seq?` + `setNodeSeq(id, seq)`.
- `use-canvas-persistence.ts`: the human-node upsert and the accepted-ghost insert now `.select('id, seq')` and store the returned number. `seq` is never sent. Duplicates start without a number (the clone doesn't copy it) and get theirs on their first save.
- `use-canvas-hydration.ts`: `seq` added to the nodes select and onto node data.
- `use-context-notes.ts` (`useContextLifecycle`): on real canvases `seqByNode` is only *merged* from `node.data.seq` (never pruned, so a deleted node keeps its label); the localStorage map and the browser-side assigner now run in mock mode only; the cross-tab `storage` handler no longer overwrites numbers on real canvases.
- Behaviour to know: on a real canvas a node shows no `nK` until its text is first saved, because the number only exists once the database row does.
- Checks run: `npx tsc --noEmit` and `npm run lint` — clean. Behaviour not tested (yours; `test.md` → Slice S02).
