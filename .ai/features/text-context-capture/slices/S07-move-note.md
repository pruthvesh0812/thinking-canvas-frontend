# S07 — Move a note

**Goal:** move a note from one node to another (and undo), persisted, without duplicates.
**Why a slice:** a single distinct write — update a link in place.
**Depends on:** S03–S06.

## What changes
- Move: `update context_links set target_id = new, origin_status = 'MOVED' where id = linkId` (only the viewed link of a multi-node note, PM-9).
- Undo: update back to the previous `target_id` and `origin_status`.
- If the entry already has an active link on the destination, the DB returns `23505` → mark the moved link `state='deleted'` instead (no error shown to the user).
- Stand-in matches the same rules.

## Not in this slice
Moving between target types (node ↔ edge ↔ canvas) beyond what the UI already offers.

## Test (for you)
1. Move a note n1 → n2; reload → it is on n2 only.
2. Undo → back on n1.
3. Move a `/all` note's n1 link to n2 (which already has it) → no duplicate, no error; n1 loses the badge.
4. Second browser sees the move.

## Done when
`tsc` + `lint` clean; checks pass.

## Rollback
Revert the commit.
