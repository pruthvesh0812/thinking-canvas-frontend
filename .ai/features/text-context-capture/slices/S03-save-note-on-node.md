# S03 — Save a note on a node, for real

**Goal:** type a note under a focused node, press save, and it is stored in Supabase; reload or another browser shows the same note, badge and panel entry.
**Why a slice:** the first full round trip (composer → store → `create_context_entry` → DB → hydration → badge/panel). It is also the BK-6 smoke test.
**Depends on:** S01, S02; local database.

## What changes
- `context-repository.ts`: an interface with two implementations — Supabase (default) and `localStorage` (mock mode, if BK-3 keeps it).
- Supabase `createEntry`: `supabase.rpc('create_context_entry', { p_entry: {id, canvas_id, session_id, source:'typed', content}, p_links: [{id, target_type:'node', target_id}] })`. Client-generated uuids for entry and link. `author_id`, timestamps not sent. No `canvas-event` notify.
- Hydration: two flat queries (non-deleted entries; active links for the canvas), keep links whose entry is in the set; fill `context-store`. Page with `.range()` past 1000 rows.
- `saveNote` always `OWNED`; drop `viaShortcut`.
- Errors: `23514` (over limit / blank) → keep draft, show the message; any failure → keep draft, Retry reuses the **same** ids and **same** text. `42501` logged via `logger`.
- Content stored exactly as typed.

## Not in this slice
Edit, delete, undo, move, canvas/edge targets, `/all`.

## Test (for you)
1. Focus a node, type a note, save → badge shows 1; panel lists it.
2. Reload → still there. Open a second browser → same note and count.
3. Go offline, save → draft kept, error + Retry; back online, Retry → exactly one note.
4. Paste more than the limit → first part saved, rest stays as the next draft (PM-6).
5. Try a blank note → rejected, draft kept.
6. Mock mode: still works offline.

## Done when
`tsc` + `lint` clean; checks 1–5 pass against your database. If the RPC call shape misbehaves, we stop and report to the backend (BK-6).

## Rollback
Revert; stand-in storage is untouched.

## What actually changed (built)
- New `src/lib/context-repository-supabase.ts`: `createEntryRemote` (the `create_context_entry` RPC; no `author_id`/timestamps/notify) and `fetchContextRemote` (two flat paged queries; keeps only links whose entry is live).
- `context-repository.ts`: the `localStorage` object is now `localContextRepository`; `contextRepository` is that in mock mode, and on real canvases the same object with `insertEntry` pointed at Supabase. Not-yet-built writes (edit/delete/restore, move, link retirement on node delete, removal reasons) are explicit "not persisted yet" no-ops that name their slice.
- `use-context-notes.ts`: on real canvases the lifecycle loads notes from Supabase (merging anything saved mid-load) instead of `localStorage`; the cross-tab `storage` sync is mock-only. `saveNote` re-uses the same entry/link ids when the same text and targets are retried; a failure keeps the draft and shows a notice — the database's own message for `23514`, a generic one otherwise; `42501` is logged as an error.
- Hydration lives in the context lifecycle (the existing load seam) rather than `use-canvas-hydration.ts` — same effect, less coupling.
- Client still trims the text before saving (existing PM-6 behaviour); the database stores exactly what is sent.
- Checks run: `npx tsc --noEmit` and `npm run lint` — clean. Behaviour **not** tested, and not verified against a real Supabase (BK-6): this is the first real `create_context_entry` round trip.
