# S05 — Notes on the canvas and on edges

**Goal:** the always-visible canvas bar saves a canvas note; focusing an edge and typing saves an edge note; both persist.
**Why a slice:** same write path as S03 with the other two target types; small but independently testable.
**Depends on:** S03, S04.

## What changes
- Canvas note: link `{ id, target_type:'canvas' }` (no `target_id`).
- Edge note: link `{ id, target_type:'edge', target_id: edgeId }`.
- Hydration/badges/panel group by `target_type`.
- The edge "?" stays the local stand-in; saving a note on an edge marks it answered locally.
- Edge targets are not validated by the DB, so a note on a just-drawn, not-yet-saved edge is accepted.

## Not in this slice
`/all`, `@nK`, move, edge delete behaviour (S08), edge labels (S10).

## Test (for you)
1. Type in the canvas bar → saved; reload → still listed under the canvas.
2. Focus an edge, add a note → badge on the edge; reload → still there; second browser too.
3. The bar's question reminder still shows for "?" text (PM-19).
4. Edit/delete/undo work on both new kinds.

## Done when
`tsc` + `lint` clean; checks pass.

## Rollback
Revert the commit.

## What actually changed (built)
- No code change was needed: `saveNote` already sends `{target_type:'canvas'}` (no `target_id`) and `{target_type:'edge', target_id}`; hydration and the store already group by `target_type`. This slice is the verification pass — see `test.md` → Slice S05.
- Checks run: none needed beyond the S03/S04 ones (no code touched). Behaviour not tested (yours).
