---
last-verified: 2026-08-05
verified-against: thinking-canvas-api commit 21d9ac4 — src/streaming/tokens.ts, src/streaming/spawn.ts, src/routes/stream.ts, src/agents/*.ts prompts, and its own .ai/context/FRONTEND-CONTRACT.md §6/§7 (frontend-contract-holes fix, 2026-07-19)
stale-after-days: 30
---

# GHOST-STREAMING.md

> **Load this when:** Working on the SSE hook, ghost node rendering, the ghost
> store, accept/reject flow, or anything touching `spawn`/`chunk`/`node_type`/`done` handling.

> **2026-08-05 sync note:** this file previously documented a raw, unsplit
> stream that the frontend had to parse markers out of, plus a
> reconnect-per-ghost lifecycle and no attribution on `done`. All three are
> now fixed backend-side (the "frontend-contract-holes" story). This revision
> reflects the current backend, not the old workaround.

---

## The Protocol (frontend side)

One `EventSource`, opened once per active session and held open for the
**whole session** — not per ghost. Every ghost pair arrives as this sequence
on that one connection:

```
spawn ──1.5s──▶ chunk*/node_type ──▶ done
```

The 1.5s gap is a deliberate backend sleep (`step.sleep('ghost-animation','1500ms')`)
— it exists so the frontend can animate empty ghost frames onto the canvas
before text starts arriving. Use it.

```typescript
type RedisMessage =
  | { type: 'spawn'; descriptor: SpawnDescriptor }
  | { type: 'chunk'; target: string; data: string }               // target = the ghost_id this text belongs to
  | { type: 'node_type'; target: string; node_type: ContextNodeType } // restyle the context ghost named by target
  | { type: 'done'; thread_id: string; turn_index: number; trigger_node_id: string;
      context_ghost_id: string; question_ghost_id: string | null }
  | { type: 'ping' }                                               // keepalive — ignore
```

> The backend splits markers **server-side** now (`src/streaming/tokens.ts`).
> `chunk.target` is whichever ghost (context or question) that text actually
> belongs to — append verbatim, no parsing. A `node_type` message is how
> `[NODE_TYPE: x]` reaches you: it overrides the spawn descriptor's default
> and tells you to restyle the context ghost. See "Content Delivery" below.

---

## SpawnDescriptor → Canvas Elements

The descriptor **is** the ghost layout. The frontend maps it 1:1 to React Flow
elements — it never invents structure, and the backend never dictates pixels.

```typescript
type SpawnDescriptor = {
  trigger_node_id: string          // the real node the pair anchors to
  session_id: string
  context_node: {
    ghost_id: string               // pre-assigned UUID — chunk/node_type messages target this
    node_type: ContextNodeType     // pre-assigned DEFAULT — a node_type message may override it
    agent_role: AgentRole          // shown as the small role icon
  }
  context_edge: { edge_type: EdgeType; from: string; to: string }
  question_node?: { ghost_id: string; node_type: 'question' }   // absent for the Articulator; present-but-may-receive-no-chunks for an appreciation
  question_edge?: { edge_type: EdgeType; from: string; to: string }
}
```

On `spawn` the frontend:
1. If a pending pair already exists for `trigger_node_id` → remove it
   (one-pair-per-node rule; the new pair replaces the old).
2. Create ghost React Flow nodes (empty content) + dotted ghost edges,
   positioned floating near the trigger node — above the canvas layer,
   non-blocking.
3. Start the ghost-frame entrance animation (~the 1.5s window).

On `chunk`: append `data` to the ghost node whose id **is** `target` — no
lookup-by-role, no buffering, no parsing. If `target` doesn't match any
spawned ghost id, that's a protocol error: log it, drop it.

On `node_type`: set the context ghost's rendered type to `node_type` (this
**overrides** the descriptor default) and restyle its badge/icon accordingly.

On `done`: mark **the pair named by `context_ghost_id`/`question_ghost_id`**
as streamed — enable accept/reject on exactly that pair. Multiple generations
can be in flight on the one connection (a debounced Expander run and an
immediate Articulator run can interleave); `done` is now attributed, so
finalize only the pair it names, never "whichever pair is pending."

---

## Content Delivery — Pre-Routed, You Just Append

There is no marker grammar left for the frontend to parse. The backend's
token layer already did it:

- Text before `[QUESTION]` in the agent's raw output arrives as `chunk`
  messages targeting the **context** ghost id.
- Text after `[QUESTION]` arrives as `chunk` messages targeting the
  **question** ghost id.
- `[NODE_TYPE: x]` never arrives as ghost text at all — it arrives as a
  `node_type` message instead.
- **Exception — the Articulator.** It has no question node; its body streams
  `[ARTICULATION 1] … [ARTICULATION 2] … [ARTICULATION 3]` (2–3, the third
  optional) as ordinary **context**-ghost chunks — this is sub-structure of
  one node, not a pair split. This is the one marker the frontend still reads
  itself: parse `[ARTICULATION n]` out of the context ghost's accumulated text
  and render 2–3 selectable readings inside that single node.

Per-agent cheat sheet (what to expect on `spawn.context_node.agent_role`):

| agent_role | Question node | Body format |
|---|---|---|
| `expander` | usually (omitted only for an `appreciation`) | paragraph, then `[QUESTION]` |
| `stress_tester` | usually (same rule) | paragraph, then `[QUESTION]` |
| `outer_subconscious` | always | paragraph, then `[QUESTION]` |
| `articulator` | never | `[ARTICULATION 1..3]` inside the context ghost |
| `observer` | never streams a ghost pair — session-complete only | — |

**Empty question ghost:** Expander/Stress-Tester spawns always pre-create a
question ghost in the descriptor, but an `appreciation` response omits
`[QUESTION]` — so that ghost simply never receives a `chunk`. If it has
received none by `done`, remove it and its edge silently (the sole exception
CANVAS-RENDERING.md already documents: appreciation renders at full opacity,
no reject button).

The persisted, accept-time content is exactly what accumulated per ghost id —
there are no markers left in it to strip.

---

## The useGhostStream Hook

```typescript
// src/hooks/use-ghost-stream.ts
// Owns the ONE EventSource for the active session — opened at session start,
// held open for the session's lifetime. Components never touch it directly.
export function useGhostStream(sessionId: string | null) {
  useEffect(() => {
    if (!sessionId) return
    const source = new EventSource(`${API_URL}/api/stream/${sessionId}`)

    source.onmessage = (e) => {
      const msg = JSON.parse(e.data) as RedisMessage
      switch (msg.type) {
        case 'spawn':     useGhostStore.getState().spawn(msg.descriptor); break
        case 'chunk':     useGhostStore.getState().appendChunk(msg.target, msg.data); break
        case 'node_type': useGhostStore.getState().setNodeType(msg.target, msg.node_type); break
        case 'done':      useGhostStore.getState().markDone(msg); break
        case 'ping':      break
        default:
          // Forward-compat: 'waiting'/'offer'/'withdraw' are typed but never
          // emitted today (intervention.ts isn't mounted) — and the protocol
          // may grow further. Unknown types are logged and ignored — never
          // thrown on.
          logger.warn('[ghost-stream] unhandled message type', { msg })
      }
    }

    source.onerror = () => {
      // A genuine network drop is the ONLY reason this fires — the backend
      // holds the connection open for the whole session and does not close
      // it per-ghost. Treat this as an error path: log it, and reconcile
      // ground truth from Supabase on the next mount rather than assuming
      // any specific pair was lost.
      logger.error('[ghost-stream] connection error')
    }
    return () => source.close()
  }, [sessionId])
}
```

**Lifecycle rules:**
- Open on canvas mount (once the active session id is known), close on unmount.
- **One connection for the whole session — do not reconnect per ghost.** The
  backend's route resolves only on client abort or a server write error
  (`src/routes/stream.ts`), never on `done`. If `onerror` fires, that's a real
  network problem, not routine flow.
- The backend sends `ping` every 25s; silence much longer than that means the
  connection is dead even if the browser hasn't noticed.
- Never open a second `EventSource` for the same session.

---

## Accept / Reject Flow

Per node in the pair — the user may accept the context and reject the question.

```
User clicks accept/reject on each pair node
  │
  ├── ACCEPT side effects (frontend owns materialization):
  │     1. Write accepted ghost(s) to Supabase as real nodes:
  │        { owner: 'ai', content: <accumulated ghost text>, canvas_id, session_id },
  │        reusing the ghost UUID as the node id
  │        + the connecting edge rows (both_existing: false)
  │     2. POST /api/ghost-status with both node statuses
  │     3. POST /api/canvas-event { event_type: 'ghost.accepted', node_ids, agent_role }
  │        — enriches the AI node(s) (summary/embedding/node_sequence + an
  │        ai_contributions audit row). Idempotent; never re-triggers an agent.
  │     4. Animate ghost → real (opacity 100%, solid border, solid edge)
  │
  ├── REJECT side effects:
  │     1. RejectionReasonSelector — too_abstract | too_technical | skip_for_now
  │     2. POST /api/ghost-status with the reason (omit ⇒ backend defaults to skip_for_now)
  │     3. Remove the ghost elements — nothing is written to nodes/edges
  │
  └── Either way, ghost-status needs thread_id + turn_index — read them
        straight off the `done` message for this pair; no agent_threads read,
        no extra request.
```

Rejection is not failure — it is signal. A rejected **context** node (not the
question alone) converts the reason into negative constraints for future
prompts via the Rejection Insights Engine.

---

## Ghost Store Shape

```typescript
// src/stores/ghost-store.ts
// Pending pairs keyed by trigger node — the one-pair-per-node rule falls out
// of the data structure instead of being checked imperatively.
type GhostPairState = {
  descriptor: SpawnDescriptor
  nodeType: ContextNodeType                // starts = descriptor default, overridden by a `node_type` message
  contextText: string                      // accumulated chunk.data for context_node.ghost_id
  questionText: string                     // accumulated chunk.data for question_node.ghost_id (if any)
  articulations?: string[]                 // Articulator only — parsed [ARTICULATION n] out of contextText
  streamed: boolean                        // set by `done` — gates the controls
  attribution?: { thread_id: string; turn_index: number }  // set by `done` — what ghost-status needs
}

type GhostStore = {
  pairs: Record<string, GhostPairState>    // key = trigger_node_id
  spawn(d: SpawnDescriptor): void          // replaces existing pair for the node
  appendChunk(ghostId: string, data: string): void       // routes to context or question by matching the id, no parsing
  setNodeType(ghostId: string, nodeType: ContextNodeType): void
  markDone(msg: Extract<RedisMessage, { type: 'done' }>): void  // sets streamed + attribution on the matching pair
  resolve(triggerNodeId: string): void     // remove after accept/reject completes
}
```

---

## What NOT to Do

```typescript
// ❌ Never subscribe to Supabase Realtime for ghosts (or anything else)
// ❌ Never render ghost layout from anything but the SpawnDescriptor
// ❌ Never let chunks create nodes — a chunk whose target has no spawned
//    frame is a protocol error: log it, drop it
// ❌ Never re-parse [NODE_TYPE:]/[QUESTION] out of chunk.data — the backend
//    already split it; a `node_type` message and pre-routed chunks are all
//    you get, and all you need
// ❌ Never reconnect the EventSource per ghost, or open a second one per session
// ❌ Never finalize "whichever pair is pending" on a bare `done` — it names
//    the pair via context_ghost_id/question_ghost_id; use that
// ❌ Never auto-accept, auto-reject, or fade a ghost on a timer
// ❌ Never throw on an unknown SSE message type
```
