# S01 — Contract types mirror + rev-3 names *(plumbing only)*

**Goal:** the app uses the backend's real types and rev-3 field names. Nothing new for the user to see.
**Why a slice:** the one allowed exception to "user-visible": every later slice imports these types. Kept tiny and regression-only.
**Depends on:** BK-2, BK-5.

## What changes
- `types/index.ts`: mirror from backend branch (record SHA + "unmerged feature branch" in the header). Adds `ContextEntry`, `ContextLink`, `CreateContextEntryArgs`, `ComponentRemoval`, `SystemConfigRow`, `Node.seq`, `Canvas.next_node_seq`, `Edge.label`; drops the intervention types.
- `types/database.types.ts`: drop `intervention_offers`, add the new tables.
- Delete `src/lib/context-contract.ts`; import from `@/types`.
- Rename in the stand-in: `target_kind`→`target_type`, `origin`→`origin_status` (`OWNED | MOVED`), links gain `canvas_id` / `updated_at`; bump storage key to `tc.context.v2.`.
- Remove `logDecision` and `decisions[]` (a deletion; `saveRemovalReason` keeps working by writing a `component_removals`-shaped row locally).
- `.ai/skills/sync-contract-types.md`: fix the stale repo name.

## Not in this slice
Any behaviour change (move-in-place, delete semantics, Supabase calls).

## Test (for you)
Open a canvas in mock mode: add notes on a node, the canvas bar and an edge; move one; delete one and undo; delete a node. Everything behaves as before. (Old saved notes from the previous storage key will not appear — expected.)

## Done when
`npx tsc --noEmit` and `npm run lint` clean; no `target_kind`, `origin:`, `logDecision` under `src/`.

## Rollback
Revert the commit.

## What actually changed (built)
- `types/index.ts`: full resync from backend commit `24a57d4` — everything above the "API payload types" banner is the backend file verbatim; the banner section stays hand-expanded (this repo has no zod).
- `types/database.types.ts`: copied from the backend (has the new tables, `create_context_entry`, `nodes.seq`, `edges.label`; no `intervention_offers`).
- `src/lib/context-contract.ts` deleted; `context-store`, `ContextPanel`, `use-context-notes`, `context-repository` import from `@/types`.
- `saveNote` lost its `origin` parameter (links are always `OWNED`; a move is `MOVED`); `ComposerState.viaShortcut` removed.
- `logDecision` / `decisions[]` removed; "Why remove this?" now writes a `ComponentRemoval`-shaped row to the stand-in.
- Storage key `tc.context.v2.`. `ContextEntry.content` is now `string | null`; the panel and edit treat null as empty.
- **One unplanned change:** the backend still sends `{type:'ping'}` every 25 s but dropped it from `RedisMessage`, so `use-ghost-stream.ts` now ignores it before the typed switch (otherwise it would log "unhandled message type" every 25 s).
- Checks run: `npx tsc --noEmit` and `npm run lint` — both clean. Behaviour not tested (yours to do, see `test.md` → Slice S01).
