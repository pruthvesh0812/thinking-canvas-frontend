# S06 — `/all`, `@nK` and `#` targets

**Goal:** one note aimed at many nodes — `/all`, `@n3`, `#text` — stored as **one entry with N links**, undone in one step.
**Why a slice:** the multi-link case of the same RPC; testable alone once single notes work.
**Depends on:** S03–S05.

## What changes
- `create_context_entry` with many links (one per node, one uuid each) in a single call (atomic).
- `/all` = every node except set-aside AI nodes (PM-18).
- Undo = the entry's `deleted_at` (S04), so one undo removes it everywhere.
- Panel shows "on N nodes"; delete removes it everywhere (PM-9).
- Shortcut parsing no longer changes what is stored (all `OWNED`).

## Not in this slice
Moving one link of a multi-node note (S07), shortcuts aimed at edges (out of scope, PM-16).

## Test (for you)
1. `/all some text` → every node gets the badge; DB has one entry, N links.
2. One undo → gone from all nodes; reload → still gone.
3. `@n2 text` and `#` picker target the right nodes.
4. Delete one node (S08 not needed): the note stays on the others.
5. A retry after a failed `/all` does not duplicate.

## Done when
`tsc` + `lint` clean; checks pass.

## Rollback
Revert the commit.

## What actually changed (built)
- No code change was needed: `/all` and `@nK`/`#` already call `saveNote` with the right links (one RPC call, N links, same entry id on retry), Undo is `deleted_at` (S04), and `@nK` resolves against the database numbers (S02). Verification pass — see `test.md` → Slice S06.
- Checks run: none needed beyond the S03/S04 ones (no code touched). Behaviour not tested (yours).
