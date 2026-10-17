# S04 — Edit, delete and undo a note

**Goal:** edit a note's text, delete it, and undo — all persisted.
**Why a slice:** completes the single-note life cycle on a node; builds only on S03.
**Depends on:** S03.

## What changes
- Edit: `update context_entries set content` (the DB enforces the length limit; `23514` handled as in S03).
- Delete / undo: **only** `deleted_at` (`now()` / `null`). **Never touch the links.** No `liveTargetIds`.
- `repository.deleteEntry` / `restoreEntry` in the stand-in match (deleted_at only).
- Undo of a *save* is the same delete.
- Add `.select()` to writes where we must know a row really changed (RLS can silently no-op).
- Panel/badge counts come from the same join as hydration: active link **and** entry not deleted.

## Not in this slice
Move, other target types, node deletion.

## Test (for you)
1. Edit a note → reload → new text.
2. Delete → badge drops, panel loses it; reload → still gone.
3. Undo within the window → note and badge return; reload → still there.
4. Undo a fresh save → note gone everywhere.
5. Edit past the limit → message, text unchanged.

## Done when
`tsc` + `lint` clean; checks pass.

## Rollback
Revert the commit.
