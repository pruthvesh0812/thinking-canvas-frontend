---
feature: "text-context-capture"
type: backend-requirements
created: 2026-10-16
revised: 2026-10-17 (aligned to schema.md rev 3)
source: "Text-Only Context Capture — Requirements (Oct 16, 2026, @Pruthvesh) — §8"
status: requested — nothing below exists in thinking-canvas-api yet
---

# Text-Only Context Capture — what the backend must build

**Tables, columns, SQL, RLS and the ER diagram: [`schema.md`](./schema.md) (rev 3).**
This file is the backend's work list, in priority order. Each item points to its
schema section. Where the two disagree, `schema.md` wins.

The frontend currently runs on a `localStorage` stand-in
(`src/lib/context-repository.ts`). When P0 lands, that file switches to Supabase
and nothing else in the UI changes.

---

## P0 — v1 cannot go live without these

### B1. `context_entries` table — schema §2.1
- One row per piece of context. `source` is `typed | spoken | attachment`.
- Soft delete via `deleted_at`.
- `content` ≤ 1000 chars, required unless `source = 'attachment'` (then it's the optional caption).
- `id` is **client-generated**. Accept the frontend's uuid; don't generate one.

### B2. `context_links` table — schema §2.2
- Columns: `target_type` (`canvas | node | edge`), `target_id` (**no FK**, null for canvas), `origin_status` (`OWNED | MOVED`), `state` (`active | deleted`).
- Partial unique index: one active link per (entry, target).
- **Trigger on `nodes` and `edges` AFTER DELETE** sets that component's links to `state = 'deleted'`.
- A `/all` note is **one entry + N links**.

### B3. Node sequence numbers — schema §2.4
- `canvases.next_node_seq` counter.
- `nodes.seq` unique per canvas, assigned by a BEFORE INSERT trigger. Never reused, never renumbered.
- Backfill existing nodes per canvas in `created_at` order.
- The frontend reads it via `insert(...).select('seq')` and in its hydration select.

### B6. Write path: RPCs + notify events — schema §5
The frontend writes straight to Supabase, then notifies (write-then-notify, as for nodes and edges).

RPCs, so multi-row writes are atomic over the anon key:
- `create_context_entry(entry jsonb, links jsonb[], attachment jsonb default null)`
- `delete_context_entry(entry_id)`: sets `deleted_at` and the entry's active links to `deleted`.
- `restore_context_entry(entry_id)`: clears `deleted_at` and reactivates **only** links whose node/edge still exists.

New `CanvasEvent` members on `POST /api/canvas-event`, ids only:
```ts
{ event_type: 'context.created',  entry_id }
{ event_type: 'context.updated',  entry_id }
{ event_type: 'context.moved',    entry_id, link_id }
{ event_type: 'context.deleted',  entry_id }
{ event_type: 'context.restored', entry_id }
```
**Add these to the backend `types/index.ts`** so the frontend can mirror them (sync-contract-types.md).

### B9. Undo semantics — schema §2.2 (action table)
Every note change is undoable in one step:

| Action | Undo |
|---|---|
| Add | `delete_context_entry` |
| Edit | update back to the previous `content` (the frontend sends it) |
| Move | update the link back (`target_id`, `origin_status`) |
| Delete | `restore_context_entry` |

Node/edge delete undo never reaches the DB: the frontend deletes the row only after its 5 s window.

### B12. Agents use context — schema §4
- Agents read only through the `agent_context` view:
  - `deleted_at is null`;
  - `state = 'active'`;
  - attachments only when `scan_status = 'clean'`.
- A `/all` entry is seen on each linked node.
- `target_type = 'canvas'` entries feed the rolling canvas summary, the same way background speech does.
- Typed notes count at least as much as voice on the same component (weighting is open, pm_handoff.md).
- Enforce the 1000-char limit server-side too.

---

## P1

### B4. `component_removals` table — schema §2.6
- Stores the "Why remove this?" answer against a **deleted** node/edge.
- `component_id` has no FK; `component_label` is a snapshot.
- Insert + select only.

### B7. `system_config` table — schema §2.7
- Global key/value table for the spec's bracketed numbers (`context.*`, `edge.*`, later `attachment.*`).
- Readable by authenticated users; writable by service role only.
- Seed it with the defaults listed in the schema.

### B8. Edge clarification ("?") — schema §2.5
- Add `edges.clarification_status` (`null | needed | dismissed | answered`) and `clarification_updated_at`.
- The backend sets `needed` when the edge has no label, no active note, and `edge.clarification_delay_ms` has passed since creation.
- It then pushes SSE `{ type: 'edge_clarification', edge_id, status: 'needed' }`. **Add this to the `RedisMessage` union.** The frontend already ignores unknown types, so ship order doesn't matter.
- Never set `needed` on an edge that is `dismissed` or `answered`.
- On `context.created` for an edge, set it to `answered`.

### B11. Live updates — over the existing SSE stream
- Supabase Realtime is prohibited, so use the existing stream: `{ type: 'context_changed', entry_id, change: 'created'|'updated'|'moved'|'deleted'|'restored' }`.
- The frontend re-reads that entry and its links. This covers other tabs and devices.

---

## P2 / later

### B5. `context_attachments` table — schema §2.3 (after voice mode)
- `entry_id` FK, cascade; **unique in v1** (one file per entry).
- `storage_path` in a **private** bucket `context/<canvas_id>/<entry_id>/…`.
- `file_name`, `mime_type`, `size_bytes`, `width`/`height`, `scan_status`, `alt_text`.
- The backend owns the safety scan (`pending → clean | rejected`) and prepares files for agents.
- Storage RLS uses the same canvas-owner rule.
- Limits come from `system_config`.

### B13. `edges.label` — schema §2.8
Short label typed on the edge itself; a labelled edge never gets a "?".

---

## Explicitly NOT needed (decided)

| Item | Why |
|---|---|
| Decision / audit log table | Dropped (rev 2). Row state covers v1. |
| `edge_prompts` table | Replaced by `edges.clarification_status`. |
| Drafts table / API | Drafts stay in browser `localStorage`; no cross-device drafts. |
| `deleted_at` / `delete_reason` on nodes or edges | Nodes and edges stay hard-deleted; reasons go to `component_removals`. |

## Open questions (backend to answer)

1. Is a trigger OK for `nodes.seq`?
2. Is the AFTER DELETE trigger on nodes/edges that marks links `deleted` OK?
3. Is the `edge_clarification` message shape OK? Should the delay run from edge creation or from the last edit?
4. Attachment storage bucket name and scanning mechanism.
