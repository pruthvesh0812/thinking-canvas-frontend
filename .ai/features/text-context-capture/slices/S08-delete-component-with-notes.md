# S08 — Deleting a node/edge that has notes, and "Why remove this?"

**Goal:** deleting a node or edge retires its notes correctly, undo works, and the removal reason is stored.
**Why a slice:** the one place the database acts on its own (a trigger marks links `deleted`). Testable only with real notes, so it comes after S03–S07.
**Depends on:** S03–S07.

## What changes
- Keep deferring the real node/edge DELETE past the undo window. The DB then marks that component's links `deleted`; **the client does not flip link state**, it updates its store from the result.
- Undo inside the window never reaches the DB.
- Drafts on a deleted component move to the canvas bar (PM-10), unchanged.
- "Why remove this?" → `insert into component_removals` (`component_type`, `component_id`, `component_label` like `n4 · Pricing`, `reason`, `session_id`, `canvas_id`); one row per id for group deletes.
- Hydration shows no note through a link in `state='deleted'`.

## Not in this slice
Restoring a note whose node is gone (it simply stays hidden), `deleted_at` on nodes (backend decided hard delete).

## Test (for you)
1. Node with a note: delete, undo inside the window → note intact.
2. Delete and wait → reload: node and its note are gone from the node; the same note on other nodes (`/all`) remains.
3. Delete a note, delete its node, undo the note delete → note returns only where its node still exists.
4. Answer "Why remove this?" → a row appears in `component_removals` (you check in Supabase).
5. Group delete of 3 nodes → 3 rows.

## Done when
`tsc` + `lint` clean; checks pass.

## Rollback
Revert the commit.

## What actually changed (built)
- `context-repository-supabase.ts`: `insertComponentRemovalRemote` (insert only; label capped at 500, reason at 1000; `created_by`/`created_at` defaulted by the DB).
- `context-repository.ts`: `insertComponentRemoval` is real; `setLinksStateForTargets` is an intentional no-op on real canvases (the DB trigger retires links on the real DELETE).
- `use-context-notes.ts`: `onComponentsDeleteCommitted` now records which links it retired in the store; `onComponentsRestored` reactivates exactly those. So a delete that **fails** (node comes back) gets its notes back too.
- `use-canvas-persistence.ts`: every failed-delete path that restores a node/edge now calls `onComponentsRestored` (single node, group, edge, edge-delete-after-node-failure); "drop both relate legs" now retires its edges' notes in the store and restores them if its delete fails.
- Still true: the client never flips link state in the database for a node/edge delete; unsynced (never saved) nodes have no row to delete, so any link to them stays `active` in the DB but unreachable.
- Checks run: `npx tsc --noEmit` and `npm run lint` — clean. Behaviour not tested (yours; `test.md` → Slice S08).
