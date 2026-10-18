# S11 — Remove the intervention demo

**Goal:** delete the client-side intervention demo; the backend removed the feature it demonstrated.
**Why a slice:** its own change so the context slices stay reviewable. No dependency on them (it uses none of the removed types).
**Depends on:** nothing; scheduled last.

## What changes
- Delete `src/hooks/use-intervention-demo.ts`, `src/lib/mock-intervention-scenario.ts`, `src/components/**/DebounceIndicator.tsx` (and `use-debounce-indicator.ts` if only the demo uses it).
- Remove the "Run the intervention" button and its wiring in `Canvas.tsx`.
- Remove any dead imports/exports left behind. I'll list every file I delete in the commit message.

## Not in this slice
Real SSE handling of ghosts (untouched).

## Test (for you)
Canvas loads; no "Run the intervention" button; ghosts from a real `relate`/`question` edge still stream and accept/reject as before.

## Done when
`tsc` + `lint` clean; no references to the removed files remain.

## Rollback
Revert the commit.

## What actually changed (built)
- Deleted: `src/hooks/use-intervention-demo.ts`, `src/lib/mock-intervention-scenario.ts`, `src/components/canvas/DebounceIndicator.tsx`. (`use-debounce-indicator.ts` does not exist in this repo — nothing to delete.)
- `Canvas.tsx`: removed the demo hook, the "Run the intervention / Reset" strip, the `DebounceIndicator` overlay and their three imports.
- `CLAUDE.md`'s repo-structure list still names `DebounceIndicator.tsx` / `use-debounce-indicator.ts` — left alone (not part of this change); worth a one-line cleanup there.
- Checks run: `npx tsc --noEmit` and `npm run lint` — clean. Behaviour not tested (yours; `test.md` → Slice S11).
