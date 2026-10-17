# Blockers before slice work starts

Resolve in this order. Each has my recommendation so you can answer with "yes" or
a change. I will update the *Resolution* line as you answer. **No slice starts
until BK-1 and BK-2 are resolved**; BK-3/BK-4 can resolve while S01 runs, but each
must be resolved before the slice it names.

## BK-1 — A database that has the new schema *(blocks S02 onwards; owner: you)*

The backend migrations are on an **unmerged branch** and I can't confirm any
database has them. Three, in order:
1. `20261016000001_drop_intervention_layer.sql` — **destructive** (drops the intervention tables/columns).
2. `20261016000002_context_capture.sql`
3. `20261017000001_context_capture_rev3.sql`

Questions for you:
- Which Supabase project do you test against — the shared one, or a throwaway?
- Are the three migrations already applied there? (`supabase migration list`)

Recommendation: a **throwaway/dev Supabase project**, because migration 1 is
destructive and the shared project may still serve the deployed app. I can't run
Supabase here (no database in this cloud session), so I can only write code
against the documented schema; the first real round trip is yours to run (S03).

Resolution: _open_

## BK-2 — How a slice becomes a "commit or PR" *(blocks S01; owner: you)*

I may only push to `ccr-dffed412-k09857` and must not open PRs unless asked. That
branch also already carries the whole v1 UI (commit `0842ae2` and the docs commits),
which is not on `main` yet.

Options:
- **(a) Recommended:** one commit per slice, stacked on `ccr-dffed412-k09857`; you review commit by commit. No PRs from me.
- **(b)** Separate branch + PR per slice. Needs your permission to create branches, and each PR stacks on the previous one.

Also: should the v1 UI already on this branch be treated as an **approved baseline**,
or reviewed first? I'll assume baseline unless you say otherwise.

Resolution: _open_

## BK-3 — Keep the offline `localStorage` mode? *(blocks S03; owner: you)*

`NEXT_PUBLIC_USE_MOCK_PERSISTENCE=true` is an existing mode used elsewhere in the
app (sessions, threads, history). The context repository has a `localStorage`
version today.

- **Recommended: keep it**, as a second implementation of the same repository
  interface, kept to the minimum each slice needs. Costs a little in every slice.
- Or drop it for context notes once the database path works (less code, but notes
  don't work in mock mode and you lose offline demos).

Resolution: _open_

## BK-4 — Three product questions from the backend *(owner: you)*

| | Question | Blocks | Recommendation |
|---|---|---|---|
| 4a | Do AI nodes (accepted ghosts) show an `nK` number? The DB assigns one. | S02 | **Yes**, same style as human nodes — numbers are unique per canvas and `@n7` has to work for any node. |
| 4b | Delete the intervention demo (`use-intervention-demo.ts`, `mock-intervention-scenario.ts`, `DebounceIndicator.tsx`, "Run the intervention" button)? The backend removed the feature. | nothing | **Yes, but as its own change** after the slices, so slice commits stay reviewable. |
| 4c | Edge labels: build now (S10) or later? | S10 | **Later** — not in the spec's first release path; the "?" rule works without labels. |

Resolution: _open_

## BK-5 — Types come from an unmerged branch *(blocks S01; I resolve, you confirm)*

`.ai/skills/sync-contract-types.md` says to copy from backend `main` of
`thinking-canvas-api`. The real repo is `thinking-canvas-be` and the context types
exist only on the feature branch. Plan: mirror from the branch, record the exact
commit SHA and "unmerged feature branch" in the provenance header, re-sync when
it merges. The skill's repo name is stale; I'd fix that line in S01.

Resolution: _proposed above — needs your OK_

## BK-6 — Backend behaviour not verified against a real Supabase *(risk, not a blocker)*

The backend tested against plain Postgres 16, **not** Supabase. Unverified:
how supabase-js/PostgREST passes the JSON array to `create_context_entry`, the
`authenticated` role for anonymous sign-ins, and Postgres version. S03 is the first
real round trip; if it misbehaves I stop and report instead of working around it.

Resolution: _accepted risk; S03 is the test_

## BK-7 — Existing frontend assumes behaviour the backend removed *(info)*

The backend no longer runs agents on node creation (only edges produce ghosts) and
removed the intervention stream messages. I found no frontend code using the removed
*types* outside `types/` itself, so S01 should compile cleanly, but any UI that
"waits for a ghost after a node is created" is now misleading. Not in scope; noted
so a surprising "no ghost appeared" isn't blamed on these slices.

Resolution: _info only_
