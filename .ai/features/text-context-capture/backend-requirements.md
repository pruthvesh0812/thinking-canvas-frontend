---
feature: "text-context-capture"
type: backend-requirements
created: 2026-10-16
source: "Text-Only Context Capture — Requirements (Oct 16, 2026, @Pruthvesh) — §8 Responsibilities + §8 Shared contract"
status: requested — nothing below exists in thinking-canvas-api yet
---

# Text-Only Context Capture — what the frontend needs from the backend

> **Concrete schema + ER diagram: [`schema.md`](./schema.md)** — that file is the
> source of truth for tables/columns; this one lists the asks by priority.

The frontend v1 is built against a **local stand-in repository**
(`src/lib/context-repository.ts`, browser `localStorage`, per canvas) that
implements exactly the shapes below. When the backend ships these, the stand-in
is swapped for a Supabase/API implementation of the same interface and the
provisional types in `src/lib/context-contract.ts` are replaced by the mirrored
`types/index.ts` (sync-contract-types.md). Nothing in the UI should need to change.

Items are ordered by how much they block v1.

---

## B1. Context entries table (P0)

One record shape for **typed, spoken and (later) attached** context. A note is
a context entry with `source = 'typed'`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | **client-generated** (same ID strategy as nodes/edges — no read-back) |
| `canvas_id` | uuid → canvases | RLS: owner of the canvas |
| `session_id` | uuid → sessions | session it was written in |
| `content` | text | ≤ max length setting (B7). Plain text only in v1 (no rich text). Never rewritten by the system. |
| `source` | `'typed' \| 'spoken' \| 'attachment'` | shown in UI, used by agents |
| `author_id` | uuid → auth.users | v1 = canvas owner; field exists for future sharing |
| `created_at` / `updated_at` | timestamptz | `updated_at` bumps on edit |
| `deleted_at` | timestamptz null | soft delete — undo restores; agents must never see a row with this set |

## B2. Context links table (P0)

"One entry can have many links" — a `/all` note is **one entry + N links**,
never N copies; one undo removes it everywhere.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | client-generated |
| `entry_id` | uuid → context_entries | |
| `target_kind` | `'canvas' \| 'node' \| 'edge'` | `'group'` reserved for v2 |
| `target_id` | uuid null | null ⇔ `target_kind = 'canvas'` (background) |
| `origin` | `'user_chosen' \| 'user_moved' \| 'shortcut'` | "chosen by the user, moved by the user, set by a shortcut" |
| `state` | `'active' \| 'deleted'` | link removed / component deleted |
| `created_at` | timestamptz | |

- Moving a note = mark old link `deleted`, insert new link with `origin='user_moved'` (or update in place — backend's choice, but the move must be recorded as a user decision, see B4).
- When a node/edge row is deleted, its links go `deleted` with it; undoing the delete restores them (see B9).

## B3. Node sequence numbers (P0)

- `nodes.seq` (int) — **unique per canvas, never reused, never renumbered**, assigned in creation order.
- Must survive deletes: needs a per-canvas counter (`canvases.next_node_seq`) — `max(seq)+1` is NOT enough, it reuses the number of a deleted last node.
- A duplicated node gets a new number. Undoing a delete brings the old number back (the row/number is restored, not re-assigned).
- Must **arrive with the node data** (hydration select + any node payload).
- **Who assigns?** Recommended: DB default/trigger on insert (frontend writes nodes directly, so an API-side assign would race). Frontend needs it back — either `insert(...).select('seq')` or the frontend reads it on next hydrate. Until then the frontend assigns locally (see blocker.md BL-3).

## B4. Decision log (P1)

Record of user actions on context, for agents and the learning loop:
`note.created | note.edited | note.moved | note.deleted | note.restored | edge_prompt.answered | edge_prompt.dismissed | component.removal_reason`.
Columns: `id, canvas_id, session_id, actor_id, action, entry_id null, link_id null, target_kind, target_id, payload jsonb, created_at`.

## B5. Removal reasons (P1)

"Why remove this?" answer stored as a record **linked to the deleted component** (kind + id), never to a surviving component. Can live in the decision log (`component.removal_reason`, payload `{ reason }`) or its own table.

## B6. Notify endpoint / events (P0)

Following write-then-notify, the frontend writes `context_entries`/`context_links` straight to Supabase, then notifies with ids only. Proposed additions to the `CanvasEvent` union on `POST /api/canvas-event`:

```ts
{ event_type: 'context.created',  entry_id }   // new entry + its links
{ event_type: 'context.updated',  entry_id }   // content edited
{ event_type: 'context.moved',    entry_id, link_id }
{ event_type: 'context.deleted',  entry_id }   // soft delete
{ event_type: 'context.restored', entry_id }   // undo of a delete
{ event_type: 'component.removal_reason', target_kind, target_id, reason }
```

Alternative (backend's call): dedicated `POST /api/context` routes that do the write server-side. Either way the frontend needs the decision before wiring the real repository.

## B7. Settings endpoint — bracketed defaults (P1)

"Numbers in brackets … must be easy to change without a release." Frontend needs one read (e.g. `GET /api/settings/context` or a `app_settings` row) returning:

| Key | Default |
|---|---|
| `composer_max_lines` | 5 |
| `canvas_bar_max_lines` | 5 |
| `hash_autocomplete_rows` | 5 |
| `note_max_chars` | 1000 |
| `panel_note_collapsed_lines` | 4 |
| `edge_prompt_delay_ms` | 10000 |
| `needs_you_max_visible` | 3 |
| `removal_prompt_visible_ms` | 10000 |

Frontend currently reads these from `src/lib/context-settings.ts` (single place, env-overridable) — see BL-5.

## B8. Edge "?" qualification (P1)

Spec puts "deciding when an edge qualifies for a '?' and capping how many are open at once" on the **backend**. Frontend needs either:
- a rule it can apply locally (current stand-in: human-drawn edge, created this session, no note, focus moved away ≥ `edge_prompt_delay_ms`, not dismissed), or
- an SSE message (e.g. `{ type: 'edge_prompt', edge_id }`) — must be a **new RedisMessage type**; the frontend already ignores unknown types gracefully.

Dismissals must be stored (`edge_prompt.dismissed` in B4) so "not asked again" survives reloads.

## B9. Undo semantics (P0)

Every note change (add, edit, move, delete) undoable in one step:
- add → soft delete entry + its links (one call, `/all` included)
- edit → restore previous `content` (needs previous version, or the frontend sends it back)
- move → restore previous link
- delete → clear `deleted_at`
- component delete undone → links back to `active`, seq number back.

## B10. Draft storage (P2)

Spec: backend "stores draft state"; drafts must survive refresh and connection loss. Frontend stand-in keeps drafts in `localStorage` (works offline, which is the main failure case). Ask: does product want drafts server-side (cross-device)? If yes: `context_drafts (canvas_id, author_id, target_kind, target_id, content, updated_at)` upserted on a debounce. See pm_handoff.md PM-11.

## B11. Live updates (P1)

"The front end receives new notes and link changes as they happen, including from other tabs." Supabase Realtime is prohibited (CLAUDE.md non-negotiable #2), so this must come over the **existing SSE stream**:
`{ type: 'context_changed', entry_id, change: 'created'|'updated'|'moved'|'deleted'|'restored' }` → frontend re-reads the entry. (Stand-in syncs tabs via the `storage` event.)

## B12. Agent consumption (P0 for the AI value, not for the UI)

- Agents receive context entries with `source`, latest version only, never `deleted_at` rows, never `state='deleted'` links.
- A `/all` note: agents see it on **each** node it links to.
- Canvas-linked notes feed the **rolling canvas summary** the same way background speech does.
- Typed notes are "at least as reliable" as voice on the same component (open question on weighting — pm_handoff.md PM-14).
- Length limit enforced server-side too (B7).

## B13. Edge labels (P2 — needed for the "?" rule)

Spec: "The user may also type a short label on the edge itself. That is the edge, not a note." There is no `edges.label` column. "?" depends on "no label and no note". Need `edges.label text null` (frontend-written, notify `edge.updated` or no notify — backend decides).

## B14. Later (not v1)

- v2: suggestions from notes (ghost edge/link suggestions), dismissals remembered, capped per session; group targets (`target_kind = 'group'` or N links).
- After voice: attachments as context entries (`source='attachment'`), storage, safety scanning, limits per plan, agent preparation.

---

## Shared-contract checklist (§8) — status

| Item | Status |
|---|---|
| Focus events (same list as voice) | Frontend implements: create, click, type-in-node → focus; drag/pan/resize/multi-select → no change; click empty → none. Needs voice doc alignment. |
| Context entry shape | Proposed in B1 — needs backend sign-off |
| Links | Proposed in B2 |
| Sequence numbers | B3 — backend must own |
| Shortcuts (`@n<k>`, `#text`, `/all`) | Frontend-only parsing; backend only sees resulting links (`origin='shortcut'`) |
| Counts | Badge + panel both computed from the same store — ✅ frontend side |
| Drafts | B10 |
| Live updates | B11 |
| Settings | B7 |
| Failure | Frontend: draft kept + Retry button on failed save ✅ |
