# Implementation Order & Context Playbook — thinking-canvas-web

> Read this before starting ANY story. It answers two questions:
> **what to build next**, and **how to use the `.ai/` ecosystem so every story
> starts with full knowledge and zero wasted tokens.**

---

## Part 1 — The Build Order

Build strictly in this order. Each story's file lists its exact scope, files,
contract impact, and definition of done.

> **Status audited 2026-08-31** against the actual repo (not just each
> story's own frontmatter, which had drifted — see each file's new "Audit
> Note"). Legend: ✅ done · 🟡 partial/UI-only · ⬜ not started.

| # | Story | Status | Delivers | Depends on | Context to load |
|---|---|---|---|---|---|
| 1 | `project-bootstrap` | ✅ done | Next.js skeleton, Tailwind, logger, env, route shells | — | ARCHITECTURE + CODING-STANDARDS |
| 2 | `contract-layer` | ✅ done | Mirrored types, Supabase client, typed api.ts | 1 | API-CONTRACT + sync/add-api-call skills |
| 3 | `canvas-core` | 🟡 partial — **`canvas-event` notify never called** | Nodes on canvas, write-then-notify loop live | 2 | CORE-CONCEPTS + CANVAS-RENDERING + STATE-MANAGEMENT |
| 4 | `edge-system` | 🟡 partial — same notify gap; Doubt/AssociativeEdge unbuilt (low priority) | 4 edge types, selector, routing flags, question pulse | 3 | CORE-CONCEPTS + CANVAS-RENDERING + STATE-MANAGEMENT |
| 5 | `ghost-streaming` | 🟡 UI-only — **no real SSE consumer; all ghosts are the scripted demo** | SSE hook, ghost store, ghosts appear + stream | 4 | CORE-CONCEPTS + GHOST-STREAMING + CANVAS-RENDERING |
| 6 | `ghost-interaction` | 🟡 UI-only — accept/reject never persists or reports | Accept/reject, rejection reasons, materialization | 5 | CORE-CONCEPTS + GHOST-STREAMING + API-CONTRACT |
| 7 | `session-lifecycle` | ✅ done (v1 simplifications documented in-file) | North star capture, phase toggle, Session Complete, carry-forward | 6 | CORE-CONCEPTS + SESSION-FLOWS |
| 8 | `canvas-dashboard` | ✅ done | Multi-canvas home, create/open flow | 7 | CORE-CONCEPTS + SESSION-FLOWS |
| 9 | `auth` | 🟡 partial — anonymous sign-in only; conversion/gate/login unbuilt | Anonymous-first, conversion, session-2+ gate | 8 | ARCHITECTURE + SESSION-FLOWS |
| 10 | `billing-and-tiers` | ⬜ not started — settings/login still stub pages | Tier UI, UpgradePrompt, Stripe links | 9 ⚠gap#5 | ARCHITECTURE + API-CONTRACT |
| 11 | `observer-structure-ui` | ⬜ not started — **backend-blocked** | Anchors, DAG reveal, per-edge consent | 7 ⚠gap#4 | CORE-CONCEPTS + GHOST-STREAMING + API-CONTRACT |
| 12 | `session-selector` | ✅ done (closed 2026-08-31) | Real session history browsing (replaces mock-sessions.ts UI) | 8 | CORE-CONCEPTS + SESSION-FLOWS + STATE-MANAGEMENT |

### What to pick up next

The build order above is nominally 3→12, but the real blocker is narrower
than "do the next story": **stories 3 and 4 are functionally live except for
one missing call** — nothing in `use-canvas-persistence.ts` ever calls
`canvasEvent` from `src/lib/api.ts` after a node/edge write succeeds
(confirmed by grep — the wrapper exists, has zero call sites). That single
gap is *why* story 5 has no real ghosts to show: the backend never learns
work happened, so its agent pipeline never fires, so `ghost-streaming`'s
`use-ghost-stream.ts`/SSE hook was never built against anything — the whole
ghost experience today is `use-intervention-demo.ts`'s scripted timer, not
the product.

None of this is backend-blocked — API-CONTRACT.md/GHOST-STREAMING.md's
2026-08-05 sync already resolved the gaps (`thread_id`/`turn_index`
attribution, server-side marker splitting, hold-open SSE) that earlier
drafts of this file cited as reasons to wait. It's purely unbuilt frontend
work, in this order:

**Recommended order from here:**
1. Wire `canvasEvent` into `use-canvas-persistence.ts`'s node-content-commit
   and edge-create paths (small, closes `canvas-core`+`edge-system` for real).
2. Verify against a running local backend that the agent pipeline actually
   fires — this is the first point the *real* product loop can be observed.
3. Rewrite `ghost-store.ts` to the shape `GHOST-STREAMING.md` § Ghost Store
   Shape specifies (`appendChunk`/`setNodeType`/`markDone`/`attribution`,
   accumulated text instead of full-text-up-front) and build the real
   `use-ghost-stream.ts` (EventSource on `GET /api/stream/:sessionId` —
   `GHOST-STREAMING.md` § The useGhostStream Hook has the exact code to
   start from). The ghost UI components are the render target and mostly
   reusable, but they currently read the mock store's `displayedText`
   typewriter field — expect them to need adjusting to the new shape too.
   `use-intervention-demo.ts` can stay for manual QA of the visual sequence
   once it's no longer the only path feeding the store.
4. Wire `ghost-interaction`'s `materializeGhost` (Supabase insert + edges,
   currently a logged stub) and the `ghostStatus`/`ghost.accepted` calls
   (currently unused) once real pairs exist to accept/reject — nothing left
   blocking this backend-side; `thread_id`/`turn_index` come straight off
   `done`.
5. Only after that loop is real end-to-end does `auth`'s remaining half
   (signup prompt after Session Complete, `/login`, `middleware.ts` gate) or
   `billing-and-tiers` become worth starting — both are still genuinely
   untouched, not next in line yet.

### Why this order

- **1→2 before any UI:** the backend already exists — coding against its real
  contract from day one is the entire reason it was built first. Story 2 is
  cheap and de-risks everything after.
- **3→4→5→6 is the core value spine:** create → connect → ghost appears →
  human decides. Each story is independently demoable, and 5 is the first
  moment the product *feels* like the product.
- **7 before 8/9:** Session Complete is a dependency of the auth story's
  product design (the signup prompt fires after the first complete) and of the
  dashboard's open-canvas flow (carry-forward).
- **11 floats:** it depends only on story 7 plus backend work. Slot it wherever
  the backend gap closes — don't hold 8-10 for it.

### The milestone checkpoints

| After story | You can honestly demo |
|---|---|
| 3 | "I can think in nodes and it persists" |
| 6 | **The core thesis** — AI offers, human decides, canvas grows |
| 7 | A complete session arc with learning carried forward |
| 10 | A sellable product |

### Cross-repo gaps to watch (full detail: API-CONTRACT.md → Known Gaps)

> **Renumbered 2026-08-31 to match API-CONTRACT.md's own table exactly** —
> this table had drifted from it and was citing gaps as open that were
> already resolved. Two batches of closures folded in:
> - **2026-08-05** (`thinking-canvas-api`'s "frontend-contract-holes" story):
>   `done` now carries `thread_id`/`turn_index` (old #1, below); markers are
>   split server-side into `chunk`/`node_type` messages, so there's no raw
>   stream left to parse (old #6); the SSE connection holds open for the
>   whole session, no reconnect-per-ghost (old #6b); `ghost.accepted`
>   enrichment exists (old #5). All four are gone from the table — GHOST-
>   STREAMING.md and API-CONTRACT.md reflect the fix, not the old workarounds.
> - **2026-08-16:** second active session per canvas going unrejected by
>   `session/start` (old #8 here / API-CONTRACT.md's old #7). `thinking-
>   canvas-be` commit `a46d851` made the route idempotent per canvas
>   instead; see `session-selector` story's update note.
>
> What's left is exactly API-CONTRACT.md's current Known Gaps table:

| Gap | Blocks | Action |
|---|---|---|
| #1 no auth on any `/api/*` route or the SSE stream | all stories (any origin-bypassing client can post events / read a stream by uuid) | backend should verify a Supabase JWT; token query-param for EventSource |
| #2 free tier still gets Outer-Sub on question edges (tier only checked in the debounced pipeline) | story 10 (UpgradePrompt logic) | don't gate the question-edge UI on tier until backend gates the pipeline too |
| #3 `carry_forward_ids` accepted by the schema, ignored by the pipeline | story 7 (session-lifecycle's Carry Forward screen) | backend should wire it into session-complete, or drop it from the schema until built |
| #4 no `observer-edge-status` route (schema exists, no route) | story 11 | backend adds the route + a structure read path |
| #5 no checkout endpoint, only the webhook | story 10 | v1 = Stripe Payment Link |
| #6 canvas events still create-only — `node.updated`/`node.deleted`/`edge.deleted` accepted by schema, no pipeline re-enriches on them | edit/delete fidelity (stories 3+) | backend needs to extend real handling to the mutation event types; frontend just leaves seam comments |

---

## Part 2 — The Context Playbook

The `.ai/` ecosystem exists to eliminate two failure modes: **knowledge gaps**
(agent doesn't know the ghost protocol, invents one) and **token waste** (agent
loads six files to change a button). Use it like this:

### The per-task ritual

```
1. CLAUDE.md               → classify the task, read its row in the Load Table
2. Load ONLY those files   → they are scoped to be sufficient; trust the table
3. Story file              → .ai/features/<story>/story.md is the scope contract
4. Contract work?          → API-CONTRACT.md + verify against the backend repo
                             if anything smells stale (backend code outranks docs)
5. New library surface?    → fetch its llms.txt from .ai/refs/EXTERNAL-DOCS.md
                             BEFORE writing library-specific code
6. Repeatable task type?   → follow the matching .ai/skills/ file step by step
7. Implement               → CODING-STANDARDS.md non-negotiables apply to every line;
                             comment the contract seams and multi-phase functions
8. Verify the DoD          → the story's Definition of Done is the exit test,
                             end-to-end against a running local backend
```

### Rules that keep the ecosystem effective

- **Don't load speculatively.** The load table was written after the context
  files — it reflects what each file actually covers. Fixing a ghost animation
  does not need API-CONTRACT.md; adding an endpoint call does not need
  CANVAS-RENDERING.md.
- **The story is the scope.** If mid-implementation you discover work the story
  doesn't cover, that's a new story or a story amendment — not silent scope creep.
- **Docs are versioned truth — keep them true.** Every context file carries
  `last-verified` frontmatter. If you change something a context file
  describes (a store's shape, a flow, a protocol handler), update the file and
  its date **in the same PR**. A stale context file is worse than none — the
  next agent will trust it.
- **Gaps get flagged, never fudged.** When the backend contract is missing
  something (Known Gaps table), the move is: note it in the story PR, leave a
  contract-seam comment at the affected code, coordinate the backend change.
  Never invent an endpoint, an event, or a workaround protocol.
- **The backend repo is a context source too.** For any contract ambiguity,
  read `thinking-canvas-api`'s `types/index.ts` and `src/routes/` — five
  minutes there beats an hour of guessing. Then fix the doc that let you down.
- **One story, one branch, DoD before merge.** Branch naming per
  CODING-STANDARDS.md (`feature/<short-title>-<timestamp>` — never
  auto-generated names).

### When the architecture changes

Adopting/replacing a library, changing a flow or protocol handler, adding a
store, or adding/removing a non-negotiable ⇒ update the affected
`.ai/context/` file(s) + CLAUDE.md's tables in the same PR. New repeatable
task pattern ⇒ add a `.ai/skills/` file. This mirrors the backend repo's
`update-ai-context` discipline.
