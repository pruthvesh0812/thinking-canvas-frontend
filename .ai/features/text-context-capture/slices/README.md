# Vertical slices — text-only context capture

Replaces the phased plan in `../frontend-requirements.md` (Phases 1–3) as the
working order. Backend facts come from `thinking-canvas-be` branch
`feature/pivot-text-context-capture-2026-10-16T1703` (`frontend-handoff.md`
there). Where this folder and the older docs disagree, **this folder wins**.

## How we work

1. **One slice = one user-visible capability, built end to end** (UI → store →
   Supabase → database) so it can be tested on its own. No slice is "just the
   plumbing" except S01, which is called out as such.
2. **One slice = one commit**, message `Slice SNN: <title>`.
   Branch: `feature/context-capture-slices-2026-10-17T1500` (cut from `ccr-dffed412-k09857`). No PRs from me unless you ask.
3. **Approval gate.** Before starting a slice I stop and wait for your "go". After
   finishing it I stop again, update that slice's *Test* section and `test.md`,
   and wait for your review before the next one.
4. **I don't test on my own.** I run `tsc` and `lint` only. You test. **After every slice I list in chat exactly what to test** (the same steps as the slice file and `test.md`).
5. All blockers in [`BLOCKERS.md`](./BLOCKERS.md) are resolved. Apply the three backend migrations to your local database before testing S02.

## Order

| # | Slice | You can test | Needs DB | Status |
|---|---|---|---|---|
| [S01](./S01-contract-types.md) | Contract types mirror + rev-3 names *(plumbing only)* | App behaves exactly as before | No | approved (go for S02) |
| [S02](./S02-node-numbers.md) | Node numbers (`n1…`) come from the database | Same numbers in two browsers; never reused | Yes | approved (go for S03) |
| [S03](./S03-save-note-on-node.md) | Save a note on a node, for real | Note survives reload and shows elsewhere | Yes | approved (go for S04) |
| [S04](./S04-edit-delete-undo-note.md) | Edit, delete and undo a note | Delete/undo round trip persists | Yes | **built — awaiting your review** |
| [S05](./S05-canvas-and-edge-notes.md) | Notes on the canvas and on edges | Canvas bar + edge notes persist | Yes | **verification only — no code needed** |
| [S06](./S06-all-and-shortcuts.md) | `/all`, `@nK`, `#` targets | One note on N nodes, one undo | Yes | **verification only — no code needed** |
| [S07](./S07-move-note.md) | Move a note | Move + undo; no duplicate | Yes | **built — awaiting your review** |
| [S08](./S08-delete-component-with-notes.md) | Delete a node/edge that has notes + "Why remove this?" | Notes retire with their node; reason is stored | Yes | **built — awaiting your review** |
| [S09](./S09-system-config.md) | Settings from `system_config` | Change a limit in the DB, UI follows | Yes | not started |
| [S10](./S10-edge-labels.md) | Edge labels | — | Yes | **deferred** (decided: later) |
| [S11](./S11-remove-intervention-demo.md) | Remove the intervention demo | The button and demo are gone; nothing else changes | No | not started |

## Parked (not in any slice)

- Backend-decided "?" on edges and `edge_clarification` — backend removed it; the local stand-in stays.
- Live updates over SSE (`context_changed`) — removed from v1; the `storage`-event tab sync stays.
- Attachments upload/preview — table only on the backend, no bucket or scan.
- Agents reading notes — not built on the backend.
- Voice mode.

## Template for every slice file

Goal · Why this is a slice · Depends on · What changes (files) · Not in this slice ·
Test (for you) · Done when · Rollback.
