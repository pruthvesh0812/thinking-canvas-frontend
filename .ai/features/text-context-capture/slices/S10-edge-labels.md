# S10 — Edge labels *(DEFERRED — decided "later")*

**Goal:** type a short label on an edge (≤ 80 chars); a labelled edge never shows a "?".
**Depends on:** S01, BK-4c. Recommended: **defer**.

## What changes
- Inline label editor on the edge; `update edges set label`.
- The local "?" stand-in skips labelled edges.
- Hydration reads `label`.

## Test (for you)
Label an edge → reload → label shown; no "?"; clearing the label allows "?" again; over 80 chars is blocked.

## Done when
`tsc` + `lint` clean; checks pass.
