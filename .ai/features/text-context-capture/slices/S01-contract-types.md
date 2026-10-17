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
