---
last-verified: 2026-08-05
verified-against: thinking-canvas-api commit 21d9ac4 — src/routes/*, src/index.ts (route mounting), src/streaming/*, types/index.ts (actual implemented code + its own .ai/context/FRONTEND-CONTRACT.md, not design docs)
stale-after-days: 30
---

# API-CONTRACT.md

> **Load this when:** Calling any backend endpoint, handling SSE messages, shaping
> payloads, or deciding what the frontend vs the backend is responsible for.

This file documents the backend contract **as actually implemented** in
`thinking-canvas-api`. When in doubt, the backend repo's `types/index.ts` wins —
our `types/index.ts` is a mirror of it (see `.ai/skills/sync-contract-types.md`).

> **2026-08-05 sync note:** the backend's "frontend-contract-holes" story
> (2026-07-19) landed since this file was last verified and closed several
> gaps below marked ~~struck~~ in the old version — `done` now carries
> attribution, the SSE connection is hold-open, marker-splitting moved
> server-side, and `ghost.accepted` enrichment exists. This revision reflects
> that. The backend's own `.ai/context/FRONTEND-CONTRACT.md` is the fuller
> writeup; this file stays the frontend-side condensed version.

---

## The Division of Labour

```
FRONTEND WRITES:  user nodes + edges → Supabase directly (anon key, RLS)
                  accepted ghost nodes + edges → Supabase (owner: 'ai')
FRONTEND TELLS:   POST /api/canvas-event — IDs only, after the Supabase write
BACKEND WRITES:   node enrichment (summary, embedding), threads, insights,
                  learnings, observer structures — never user nodes/edges
BACKEND PUSHES:   ghost node pairs ONLY, via SSE. Nothing else, ever.
```

The backend reads the **authoritative row back from Supabase** on every canvas
event. It never trusts flags from the request body — which means the frontend
must write `edge_type` and `both_existing` correctly *before* notifying.

---

## Base URLs

| Env | Backend |
|---|---|
| Local | `http://localhost:3001` (hardcoded port in `src/index.ts`) |
| Prod | Railway URL — `NEXT_PUBLIC_API_URL` |

CORS on the backend is locked to exactly one origin (`FRONTEND_URL`). If SSE or
fetches fail cross-origin, the backend env var is wrong — not a frontend bug.
There is **no auth** on any `/api/*` route today (Known Gap #1) — CORS is the
only guard. Don't bake "no auth headers" deep into the client; isolate it in
`src/lib/api.ts` so adding a Supabase JWT later touches one file.

---

## Endpoints

### `POST /api/canvas-event`

Notify the backend that a node or edge row now exists in Supabase, or that a
ghost pair was accepted. Fire this **after** the Supabase write succeeds — the
backend immediately re-reads the row(s).

```typescript
// Request — CanvasEvent (types/index.ts), a discriminated union on event_type
{ canvas_id, session_id, event_type: 'node.created' | 'node.updated' | 'node.deleted', node_id }
{ canvas_id, session_id, event_type: 'edge.created' | 'edge.deleted', edge_id }
{ canvas_id, session_id, event_type: 'ghost.accepted', node_ids: string[], agent_role }
// Response: { ok: true } | 400 { error, issues } | 500 { error }
```

What the backend does with it:
- `node.created` → generates summary + embedding on the row (**synchronous,
  ~1–3s** — fire-and-forget, never block the canvas on the response), appends
  the node to `sessions.node_sequence`, then fires the **debounced** agent
  pipeline (~10s after the user pauses). A ghost pair *may* arrive on the stream.
- `edge.created` with `both_existing=true` (non-question) → **Articulator, immediate.**
- `edge.created` with `edge_type='question'` → **Outer Subconscious, immediate.**
- `ghost.accepted` → enriches the AI node(s) you just wrote yourself (summary +
  embedding + `node_sequence` append) and writes an `ai_contributions` audit
  row. **Does not re-trigger any agent** — an AI acceptance is not a new-node
  event. Idempotent, safe to retry. See "Accept flow" below.
- other edges → part of the debounced flow.

> Only creates + `ghost.accepted` exist today. There are still **no**
> `node.updated` / `*.deleted` events reaching agents meaningfully — the Zod
> schema *accepts* `node.updated`/`node.deleted`/`edge.deleted` shapes, but no
> pipeline re-enriches on them yet (Known Gap, see below).

### `GET /api/stream/:sessionId` — SSE

The only server push channel. **Open exactly one `EventSource` per session, at
session start, and keep it for the whole session** — the connection is
hold-open server-side (resolves only on client abort or a write error, never
on `done`). There is no reconnect-per-ghost loop to design around.

```typescript
type RedisMessage =
  | { type: 'spawn'; descriptor: SpawnDescriptor }        // render empty ghost frames NOW
  | { type: 'chunk'; target: string; data: string }       // append data to the ghost node whose id === target
  | { type: 'node_type'; target: string; node_type: ContextNodeType } // restyle the context ghost named by target
  | { type: 'done'; thread_id: string; turn_index: number; trigger_node_id: string;
      context_ghost_id: string; question_ghost_id: string | null }   // this pair is fully streamed
  | { type: 'ping' }                                       // keepalive every 25s — ignore
  // 'waiting' | 'offer' | 'withdraw' also exist in the type but are NEVER
  // emitted today — routes/intervention.ts is imported but not mounted in
  // src/index.ts. Handle them (ignore-and-log) for forward-compat only.
```

Protocol sequence per ghost pair: `spawn` → *(~1.5s gap for your animation)* →
`chunk`*/`node_type` → `done`. **Chunks arrive pre-routed** — the backend
strips `[NODE_TYPE:]`/`[QUESTION]` server-side (`src/streaming/tokens.ts`) and
sends `node_type` + already-split `chunk.target`s instead. The frontend does
**not** parse markers out of the raw stream anymore. Full frontend handling in
`GHOST-STREAMING.md`.

### `POST /api/ghost-status`

Record the user's accept/reject decision on a ghost pair.

```typescript
// Request — GhostStatusPayload
{
  thread_id: string       // take straight off the `done` message — no agent_threads read needed
  turn_index: number      // also on `done`
  canvas_id: string
  session_id: string
  context_node_status: 'accepted' | 'rejected'
  question_node_status: 'accepted' | 'rejected' | null  // null when the pair has no question node
  rejection_reason?: 'too_abstract' | 'too_technical' | 'skip_for_now'
  interacted_at: number   // unix ms — validated, not currently used backend-side
}
// Response: { ok: true } | 400 | 404 | 500
```

A rejected **context** node (regardless of the question node's status) fires
the Rejection Insights Engine — always collect a reason via
`RejectionReasonSelector` before sending a rejection (backend defaults to
`skip_for_now` if omitted). Rejecting only the question node does not fire it.

### `POST /api/session/start`

```typescript
// Request: { canvas_id: string }
// Response: { session_id: string, session_number: number }
```

Creates the session row (`status:'active'`, `current_phase:'diverging'`) and,
if prior sessions exist, drops a session-boundary marker into every agent
thread. **Idempotent per canvas** — if the canvas already has an active
session, that one is returned as-is (`session_id` + `session_number`
unchanged) instead of creating a sibling; Known Gap #7 (a second active
session per canvas going unrejected) is closed. **Still never insert
`sessions` rows directly** — session lifecycle stays backend-owned.

Because it's idempotent, the frontend calls this **unconditionally** on
every canvas open — whether starting fresh or resuming — rather than
pre-checking for an active session and only calling it when none exists
(`use-canvas-hydration.ts`). This is also the only source for
`session_number`: a 1-indexed ordinal (`priorSessions.length + 1`, or the
matched session's array position on an idempotent return) for display
(`NorthStarHeader`'s "Session N") — **not** a persisted column on
`sessions`, so it only ever exists in this response.

### `POST /api/session/complete`

```typescript
// Request: { session_id: string, canvas_id: string, carry_forward_ids: string[] }
// Response: { ok: true }   — the work is ASYNC
```

Enqueues the session-complete pipeline: Observer runs over the whole canvas,
its observations are persisted as `session_learnings` rows, then the session is
closed. **Nothing streams back** — the response is an ack; poll
`session_learnings`/`sessions.status` or tolerate eventual consistency. ⚠
`carry_forward_ids` is validated but **currently ignored** by the pipeline —
don't build "Carry Forward" expecting it to persist anything yet.

### `POST /api/stripe/webhook`

Backend-only (Stripe calls it). The frontend never touches this endpoint.
There is **no checkout endpoint** — starting a subscription is unbuilt.

### `GET /health`

`{ status: 'ok' }` — use for env smoke tests.

---

### Accept flow — the frontend persists the ghost itself (§7.3 of the backend's FRONTEND-CONTRACT.md)

The backend never writes an accepted ghost to the canvas. On accept:
1. Insert `nodes` rows (`owner:'ai'`) for the context node and, if accepted,
   the question node — **reuse the ghost UUIDs as the node ids** so thread
   records and canvas rows correlate.
2. Insert the `edges` rows mirroring `context_edge`/`question_edge`
   (`both_existing:false`).
3. `POST /api/ghost-status` with the statuses.
4. `POST /api/canvas-event` with `event_type:'ghost.accepted'`,
   `node_ids` = the accepted id(s), `agent_role` from the spawn descriptor.
   This is what makes accepted AI nodes first-class in later semantic recall —
   don't skip it (this replaces the older "never notify on accept" guidance).

On reject: discard the ghost visuals, `POST /api/ghost-status` with the reason.
Nothing is written to `nodes`/`edges`.

---

## What the Frontend Reads Directly from Supabase

The backend has no generic read endpoints — canvas state is loaded straight
from Supabase under RLS:

| Table | Frontend reads it for |
|---|---|
| `canvases` | dashboard list, north star header (`original_intent`) |
| `sessions` | active session lookup, `current_phase`, `node_sequence` |
| `nodes` | canvas hydration on mount (all sessions of the canvas) |
| `edges` | canvas hydration on mount |
| `agent_threads` | optional ground-truth reconciliation only — no longer needed for ghost-status (thread_id/turn_index come off `done` now) |
| `session_learnings` | Session Complete screen 2 + next-session carry-forward |
| `observer_structures` / `observer_edges` | Observer structure UI — tables exist but nothing writes them yet (Known Gap) |
| `subscriptions` | current tier for UI show/hide (enforcement stays server-side). Missing row or `status != 'active'` ⇒ treat as `free` |

Frontend also **writes** directly (RLS-scoped): `canvases` (insert only —
`original_intent` is INSERT-once, RLS `WITH CHECK` blocks an UPDATE that
changes it), `nodes`, `edges` (see the accept flow above for AI-owned rows),
and `sessions.current_phase` (the phase toggle).

---

## Known Gaps (cross-repo — do not silently work around)

Renumbered against the backend's own audit (`FRONTEND-CONTRACT.md` §11,
2026-07-19). The three original P0 rows from this file's prior revision —
`done` carrying nothing, SSE closing per-ghost, no accept-enrichment path —
are **resolved** and removed from this table. Gap #7 (second active session
per canvas going unrejected) is also now **resolved** (2026-08-16,
`thinking-canvas-be` commit `a46d851` — see `POST /api/session/start`
above) and removed; numbers below aren't renumbered to fill the gap.

| # | Severity | Gap | Impact | Direction |
|---|---|---|---|---|
| 1 | P1 | No auth on any `/api/*` route or the SSE stream | Any origin-bypassing client can post events / read a session's stream by uuid | Backend should verify a Supabase JWT on all routes; token query-param for EventSource |
| 2 | P1 | Free tier reaches Outer Subconscious via question edges — tier is only checked in the debounced pipeline, not `outer-sub-pipeline.ts` | A tier-driven `UpgradePrompt` on question edges would be wrong; don't gate that affordance on tier | Backend should gate the immediate pipelines by tier too (or intentionally make Outer-Sub free and document it) |
| 3 | P1 | `carry_forward_ids` accepted by the schema, ignored by the pipeline | The "Carry Forward" screen can't rely on it persisting anything | Backend should wire it into session-complete, or drop it from the schema until built |
| 4 | P2 | `observerEdgeStatusSchema` exists in `types/index.ts` but **no route implements it** | Per-edge Observer accept/reject UI has nothing to call | Backend must add `POST /api/observer-edge-status` |
| 5 | P2 | No Stripe checkout endpoint — only the webhook exists | Upgrade flow can't start a subscription | Use Stripe Payment Links short-term, or backend adds a checkout route |
| 6 | P2 | Canvas events are still create-only in practice — `node.updated`/`node.deleted`/`edge.deleted` are accepted by the Zod schema but no pipeline re-enriches on them | Backend agents can read stale canvas state after edits/deletes/moves | Backend needs to extend real handling to the mutation event types |

---

## Streaming Protocol Forward-Compatibility

The intervention-spectrum design (`waiting`/`offer`/`withdraw` message types,
a processing-timer + glow/sidebar surface model) is drafted in the backend's
types and referenced in its `RedisMessage` union, but **its route is not
mounted** — nothing on the wire emits these today. The frontend dispatcher
must still route on `type` with an explicit ignore-and-log default branch —
never an exhaustive switch that throws on unknown types — both because this
spectrum may land later and because the protocol can grow in other ways too.
