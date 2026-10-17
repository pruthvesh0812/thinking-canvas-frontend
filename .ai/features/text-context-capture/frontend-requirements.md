---
feature: "text-context-capture"
type: frontend-requirements (handoff for the next session)
created: 2026-10-17
branch: "ccr-dffed412-k09857 — continue on it, or branch from it"
status: ready to pick up — Phase 1 needs no backend
---

# Text-Only Context Capture — frontend work remaining

## Read first
1. `CLAUDE.md` (repo rules). Key ones here:
   - write-then-notify;
   - no `supabase.channel()`;
   - contract types are mirrored from the backend;
   - log via `logger`;
   - npm only.
2. `.ai/features/text-context-capture/schema.md` (**rev 3**) — the agreed data model. This file follows it.
3. `.ai/features/text-context-capture/backend-requirements.md` — what the backend is building (B1–B13).
4. `.ai/features/text-context-capture/story.md` — what v1 UI already does.
5. Root `pm_handoff.md` (product decisions), `blocker.md`, `test.md`.

**Working rule from the product owner:** don't test on your own. Update
`test.md` with what changed and what to check; the product owner tests.

## Where things stand

The whole v1 UI exists and works against a **`localStorage` stand-in**:
composer, canvas bar, panel, badges, shortcuts, edge "?", "Why remove this?",
drafts. All persistence goes through `src/lib/context-repository.ts`. All
logic lives in `src/hooks/use-context-notes.ts`.

The code was written **before** schema rev 3, so its names and behaviour
differ:

| Area | Code today | Rev 3 target |
|---|---|---|
| Link target field | `target_kind` | `target_type` |
| Link origin | `origin: 'user_chosen' \| 'user_moved' \| 'shortcut'` | `origin_status: 'OWNED' \| 'MOVED'` |
| Link extras | — | `canvas_id`, `updated_at` |
| Move a note | deletes the old link + inserts a new one (`setEntryLinks`) | **update the link in place** (`target_id`, `origin_status='MOVED'`); undo updates back |
| Delete a note | only `entries.deleted_at` | `deleted_at` **and** the entry's active links → `state='deleted'`; restore reactivates only links whose node/edge still exists |
| Audit log | `logDecision(...)` + `decisions[]` in the repository | **removed** — no decision log |
| "Why remove this?" | written as a decision-log row | a `component_removals` row (`component_type`, `component_id`, `component_label`, `reason`) |
| Edge "?" | local `promptEligibleEdges` + `dismissedEdgePrompts` + `edgePromptQueue` + timer | per-edge **`clarification_status`**: `null \| needed \| dismissed \| answered` |
| Settings | `CONTEXT_SETTINGS` (env-overridable) | keys from global `system_config` (`context.*`, `edge.*`), env as fallback |
| Entry content | always required | nullable when `source='attachment'` |
| Attachments | none | `context_attachments` table (one file per entry) — **later** |
| Node numbers | assigned in the browser, stored in `localStorage` | `nodes.seq` from the DB (trigger) |

---

## Phase 1 — align the code to rev 3 (no backend needed)

Keep the `localStorage` stand-in, but make its shapes and behaviour exactly
rev 3. Then Phase 2 only swaps storage.

1. **`src/lib/context-contract.ts`** (provisional types, still marked PROVISIONAL):
   - Rename `ContextTargetKind` → `ContextTargetType`.
   - `ContextLink`: `target_type`, `target_id`, `canvas_id`, `origin_status: 'OWNED' | 'MOVED'`, `state: 'active' | 'deleted'`, `created_at`, `updated_at`.
   - Remove `ContextLinkOrigin`, `ContextDecision`, `ContextDecisionAction`.
   - Add `ComponentRemoval` (schema §2.6).
   - Add `ContextAttachment` (schema §2.3). Type only for now.
   - `ContextEntry.content: string | null`.
2. **`src/lib/context-repository.ts`** — method set mirroring the rev 3 writes (schema §5):
   - `createEntry(entry, links, attachment?)`
   - `updateEntryContent(entryId, content)`
   - `deleteEntry(entryId)`: sets `deleted_at` + active links → `deleted`.
   - `restoreEntry(entryId, liveTargetIds)`: clears `deleted_at`; reactivates links whose target is in `liveTargetIds` or whose type is `canvas`.
   - `updateLink(linkId, { target_id, origin_status })`
   - `markTargetLinksDeleted(targetIds)`: the stand-in for the DB trigger.
   - `insertComponentRemoval(row)`
   - `setEdgeClarification(edgeId, status)`: stand-in for the `edges.clarification_status` column.
   - Remove `logDecision`, `setEntryLinks`, `decisions`, `dismissedEdgePrompts`.
   - **Bump the storage key to `tc.context.v2.`** (old `v1` data has the old shape). Read-and-migrate v1 if easy; dropping it is acceptable — it's local test data only.
3. **`src/stores/context-store.ts`**:
   - `notesFor` / `noteCount` read `target_type`.
   - Replace `dismissedEdgePrompts` / `edgePromptQueue` with `clarificationByEdge: Record<edgeId, 'needed'|'dismissed'|'answered'>`. The "?" and the "Needs you" list show edges whose status is `needed`, oldest first.
   - Keep `promptEligibleEdges` only as the stand-in's "drawn this session" rule (PM-7).
   - Remove `ComposerState.viaShortcut`; it no longer changes what's stored.
4. **`src/hooks/use-context-notes.ts`**:
   - **`saveNote`:** drop the origin parameter; always `origin_status: 'OWNED'`. Callers to update:
     - `ContextComposer.tsx`
     - `CanvasContextBar.tsx` (both the `/all` and canvas paths)
     - `answerEdgePrompt`
   - **`moveNote`:**
     - Update the viewed link in place: `target_id`, `origin_status: 'MOVED'`, `updated_at`.
     - Undo restores the previous `target_id` + `origin_status`.
     - If the entry already has an active link on the destination, mark the moved link `deleted` instead (the unique-active index would reject a duplicate).
   - **`softDelete`** (also the undo of a save) → `repository.deleteEntry`.
   - **`restoreNote`** → `repository.restoreEntry`, passing live node/edge ids from `useCanvasStore`.
   - **`onComponentsDeleteCommitted`** → `markTargetLinksDeleted`. Keep it client-side for the stand-in; in Phase 2 the DB trigger does it, and the client only updates its store.
   - **`saveRemovalReason`** → `insertComponentRemoval`:
     - `component_type`: the prompt's kind.
     - `component_id`: one row per id, for group deletes.
     - `component_label`: the prompt label.
   - Delete `logDecision` and every call to it.
   - **Edge "?":**
     - The stand-in timer sets `clarificationByEdge[id] = 'needed'`.
     - Skip sets `dismissed`.
     - Saving any note on the edge (composer or Needs-you answer) sets `answered`.
     - Keep hiding the "?" while that edge is focused.
     - Show at most `edge.needs_you_max_visible`.
5. **Components:**
   - `ContextBadge.tsx` (`EdgeQuestionMark`) and `ContextPanel.tsx` (Needs-you tab, counts) read `clarificationByEdge`.
   - `ContextPanel` `NoteItem`: handle `content === null` (attachment-only entry), even though no attachment UI exists yet.
6. **`src/lib/context-settings.ts`:**
   - Re-key to the `system_config` names: `context.composer_max_lines`, …, `edge.clarification_delay_ms`, `edge.needs_you_max_visible`.
   - Add a `loadSystemConfig()` seam that returns the defaults today (Phase 3 fills it).
   - Keep the `NEXT_PUBLIC_CONTEXT_*` env fallback.
7. Update `story.md`, `blocker.md`, `test.md`:
   - **Moves:** after a move, the panel still shows the note on the new node; undo puts it back.
   - **Deletes:** deleting a note, then deleting its node, then undoing the note delete — the note returns only where the target still exists.

**Done when:**
- `npx tsc --noEmit` and `npm run lint` are clean.
- No `target_kind`, `origin:`, `logDecision`, `dismissedEdgePrompts` or `edgePromptQueue` remain under `src/`.
- `test.md` reflects the changes.

---

## Phase 2 — real persistence (blocked on backend B1, B2, B3, B6)

1. **Mirror types:** when the backend adds the context types and `CanvasEvent` members to its `types/index.ts`, run `.ai/skills/sync-contract-types.md`. Then delete `src/lib/context-contract.ts` and import from `@/types`.
2. **Supabase repository:** keep the `localStorage` version for `NEXT_PUBLIC_USE_MOCK_PERSISTENCE=true` and add a Supabase version behind the same interface:
   - writes via the RPCs `create_context_entry` / `delete_context_entry` / `restore_context_entry`, plus plain updates for edit and move;
   - after each successful write, notify via a new `src/lib/api.ts` wrapper → `canvasEvent({ event_type: 'context.created' | … , entry_id })`, fire-and-forget like `node.created` (`.ai/skills/add-api-call.md`).
3. **Hydration:** in `use-canvas-hydration.ts`, load `context_entries` + active `context_links` for the canvas, and `nodes.seq` in the existing node select. Push them into `context-store` instead of the `localStorage` load in `useContextLifecycle`.
4. **Node numbers from the DB:**
   - In `use-canvas-persistence.ts` `writeNodeContent`, read `seq` back (`.select('seq')`) and set it in the store.
   - Remove the client-side assigner in `useContextLifecycle` for real canvases (keep it for mock mode).
   - Duplicated nodes get their seq the same way.
5. **Author:** `author_id` = current Supabase user; already captured as `currentUserId`.
6. **Failure path:** a rejected RPC must keep the draft and show Retry. This already exists; verify it's wired to the new repository.
7. **Drafts:** stay in `localStorage` (decided). No change.

**Done when:**
- Notes survive a reload on another browser.
- The badge count matches the DB.
- `canvas-event` fires once per write.
- Mock mode still works offline.

---

## Phase 3 — P1 backend items (blocked on B4, B7, B8, B11)

1. **Edge clarification:**
   - Hydrate `edges.clarification_status` into `CanvasEdge`.
   - In `use-ghost-stream.ts`, handle SSE `edge_clarification` with a type guard. Unknown types must keep being ignored.
   - Dismiss/answer write `edges.clarification_status`.
   - Delete the stand-in timer and `promptEligibleEdges`.
2. **`component_removals`:** insert into the real table.
3. **`system_config`:** `loadSystemConfig()` reads the table once on canvas load; env vars remain a fallback.
4. **Live updates:** handle SSE `context_changed` → re-read that entry + links. Remove the `storage`-event sync for real canvases.

## Phase 4 — later (after voice mode / P2)

- **Attachments (schema §2.3):**
  - Attach button, drag-drop and paste in the composer and bar.
  - Upload to the private bucket `context/<canvas_id>/<entry_id>/…`, then `create_context_entry(…, attachment)`.
  - Upload progress, and retry without losing the draft.
  - Panel: images as thumbnails (signed URLs), files as name/type/size chips.
  - `scan_status` `pending` / `rejected` states.
  - `alt_text` for screen readers.
  - Each file counts in the badge.
- **Edge labels (B13):** inline label editor on the edge. A labelled edge never shows "?".
- **Voice:** spoken entries (`source='spoken'`) share the same store, focus and panel. The panel already labels the source.
