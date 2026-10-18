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

## What actually changed (built)
- `context-repository-supabase.ts`: `updateEntryRemote` — `update context_entries … .eq('id') .select('id')`; sends only `content` and/or `deleted_at`; a zero-row result (RLS hides rows silently) is thrown so the caller rolls back.
- `context-repository.ts`: `updateEntry` is real on real canvases; it carries edit, delete and restore (and the undo of a save, which is a delete). `deleted_at` is the **only** column a delete touches — links are never changed by a user delete, and there is no `liveTargetIds`.
- `use-context-notes.ts` (`editNote`): a failed edit rolls back and shows a notice — the database's message for `23514`, a generic one otherwise. Delete/restore already rolled back with their own notices.
- Panel and badge counts already came from "active link AND entry not deleted", so no change there.
- Not touched: move (S07) and node/edge deletion (S08).
- Checks run: `npx tsc --noEmit` and `npm run lint` — clean. Behaviour not tested (yours; `test.md` → Slice S04).
