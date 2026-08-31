---
last-verified: 2026-08-16
verified-against: backend canvasEventSchema (write-then-notify contract) + DB table list in backend ARCHITECTURE.md + nodes.{x,y,width,height} and edges.{from_handle,to_handle} layout-persistence contract update
stale-after-days: 60
---

# STATE-MANAGEMENT.md

> **Load this when:** Working on Zustand stores, the persistence hook, canvas
> hydration, or any question of "where does this state live / who writes it".

---

## The One Data-Flow Diagram

```
USER ACTION (create node / draw edge / edit / toggle phase)
  │
  ▼
Zustand store (optimistic — canvas updates instantly)
  │
  ▼
Supabase write (anon key, RLS)          ←— the durable truth
  │  on failure: revert store, surface error
  ▼
POST /api/canvas-event { ids only }     ←— tells the backend "go read the row"
  │
  ▼  (seconds later, maybe)
SSE spawn/chunk/done ──▶ ghost store ──▶ ghost layer renders

GHOST ACCEPT
  │
  ▼
Supabase write (owner:'ai' node + edges) + POST /api/ghost-status
  │
  ▼
canvas store adopts the new real nodes; ghost store drops the pair
```

Two rules fall out of this:
1. **The store is optimistic, Supabase is authoritative.** Never wait for the
   round-trip to paint; always reconcile on failure.
2. **Notify only after the write commits.** The backend immediately reads the
   row — notifying first is a race you will lose.

---

## Store Layout — one store per concern

| Store | Owns | Never contains |
|---|---|---|
| `canvas-store` | real nodes + edges (React Flow shapes), positions, selection | ghosts, session meta |
| `ghost-store` | pending pairs keyed by `trigger_node_id`, streamed text, `streamed` flag | anything persisted |
| `observer-store` | revealed structures, per-edge accept/reject state | ghost pairs |
| `session-store` | canvas meta (`original_intent`, title), active session id, `current_phase`, debounce-indicator state | node/edge data |

Cross-store reads happen in hooks/components — stores never import each other.

---

## Canvas Hydration (on canvas page mount)

```
1. Load canvas row          → session-store (north star, title)
2. Load this canvas's whole session history (session-history.ts) → resuming
   an active session, or a brand-new canvas with no history at all, calls
   POST /api/session/start right away (idempotent per canvas); closed
   history with nothing active defers it instead — session-store.
   showSessionLanding true, CanvasShell renders SessionLanding, not the
   canvas, until a deliberate "Continue" (see SESSION-FLOWS.md)
3. Load ALL nodes + edges for the canvas (every session — nodes belong to
   the canvas, not the session) — always, regardless of step 2's outcome,
   so the canvas is ready the instant SessionLanding's Continue resolves
4. Map rows → React Flow nodes/edges → canvas-store
5. Open the SSE stream (useGhostStream)
```

Carried-forward `session_learnings` are NOT loaded here — only once a
session actually starts (continueToNewSession, use-session-lifecycle.ts),
which for a deferred canvas is after step 2's SessionLanding detour, not
during hydration itself (see SESSION-FLOWS.md → Carry-Forward).

---

## Persistence Patterns

### Creating a node

```typescript
// use-canvas-persistence.ts — the ONLY place canvas writes happen.
// Persist on content commit (first blur with non-empty text), not per keystroke.
async function persistNode(node: CanvasNode) {
  // 1. Durable write — id is generated client-side so the store, Supabase,
  //    and the backend all agree on it with no read-back.
  const { error } = await supabase.from('nodes').insert({
    id: node.id, canvas_id, session_id,
    owner: 'human', content: node.content,
  })
  if (error) return rollback(node.id, error)

  // 2. Notify — IDs only; backend reads the authoritative row.
  await api.canvasEvent({ canvas_id, session_id, event_type: 'node.created', node_id: node.id })

  // 3. Debounce indicator on — the backend's window just opened.
  useSessionStore.getState().setDebounceActive(node.id)
}
```

### Creating an edge

Same shape, plus the two fields the backend routes on — set correctly at write
time, they are never recomputed server-side:
- `edge_type` — from the EdgeTypeSelector
- `both_existing` — true ⇔ drawn between two already-existing nodes

Plus two frontend-owned, backend-ignored columns for visual routing:
`from_handle` / `to_handle` — which side of each node the edge attaches to.

**Why the id is compound, not just a side.** Each `HumanNode` renders TWO
handles per side, stacked at the same position — a `type="target"` one and a
`type="source"` one (HumanNode.tsx) — so a connection can be started from or
dropped onto any edge of the card. `"right"` alone doesn't identify either
one; `right-target` and `right-source` are two distinct DOM handles at the
same spot, and React Flow needs the exact id to know which one an edge is
anchored to.

**Why the DB only stores the bare side.** `edge.sourceHandle` is *always* a
`-source`-suffixed id and `edge.targetHandle` is *always* `-target`-suffixed —
enforced by connection validity (strict mode won't let you start from a
target handle or land on a source handle). So the suffix carries no
information beyond "which column is this" — storing it would be redundant,
and the DB's check constraint restricts the column to the bare side anyway
(`TOP`/`RIGHT`/`BOTTOM`/`LEFT`, **uppercase**).

**The round trip.** `handleSide()` in use-canvas-persistence.ts strips the
`-source`/`-target` suffix before uppercasing on write. Hydration reattaches
it deterministically — `from_handle` always becomes `<side>-source`,
`to_handle` always becomes `<side>-target` — since which suffix to use is
fully determined by which column it came from, never guessed. Skipping this
(e.g. hydrating `sourceHandle: "right"` instead of `"right-source"`) makes
React Flow look for a handle literally named `"right"`, find nothing, and
silently fall back to a default side — the exact bug this feature exists to
fix. Null lets that same default-side fallback happen on purpose (edge drawn
without a specific handle, or a pre-migration row).

Same frontend-owns / no-notify contract as node `x/y/width/height`.

### Position / size changes

Node layout persists to the `nodes` table's `x`/`y`/`width`/`height` columns
(all nullable — the frontend owns them, the backend never reads them). Written
on create (they ride along in `writeNodeContent`'s upsert) and on every
move/resize **commit** — drag end / resize end, not per frame
(`persistNodeLayout`). No `canvas-event` — layout is not a thinking event and
the backend is intentionally blind to it. On re-entry `use-canvas-hydration.ts`
restores the saved layout, falling back to a grid only for pre-migration rows
whose columns are still null.

### Edits / deletes

Persist to Supabase as normal. ⚠ The backend has no update/delete events yet
(API-CONTRACT Known Gap #3) — agents may act on stale content until the event
surface is extended. Do not invent unofficial events; flag the story instead.

### Phase toggle

`PhaseToggle` writes `sessions.current_phase` directly to Supabase via the
session-store action. No canvas-event — the backend reads phase when routing.

---

## Zustand Conventions

```typescript
// ✅ create with a typed interface; actions live inside the store
export const useCanvasStore = create<CanvasStore>()((set, get) => ({ ... }))

// ✅ select narrowly in components — never subscribe to the whole store
const nodes = useCanvasStore((s) => s.nodes)

// ✅ non-React access (hooks, event handlers) via getState()
useGhostStore.getState().appendChunk(target, data)

// ❌ No persist middleware for canvas data — Supabase is the persistence layer;
//    a localStorage copy WILL go stale and conflict
// ❌ No derived data stored — compute in selectors
// ❌ No cross-store imports inside store definitions
```

No react-query/SWR in MVP: canvas data is loaded once per mount and mutated
through the stores; there is no polling or background refetching to manage.
Introduce a fetching library only when a story genuinely needs caching.

---

## ID Strategy

All node/edge/canvas IDs are client-generated UUIDs (`crypto.randomUUID()`).
The frontend never waits for a DB round-trip to learn an id — which is what
makes optimistic rendering and the write-then-notify contract race-free.
Ghost IDs are the exception: pre-assigned by the **backend** in the
SpawnDescriptor, and reused as the real node id on acceptance so the thread's
record of the ghost matches the canvas row.
