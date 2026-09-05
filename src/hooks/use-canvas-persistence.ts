import { useCanvasStore, type CanvasEdge, type CanvasNode, type HumanEdgeType } from "@/stores/canvas-store"
import { useCanvasUiStore } from "@/stores/canvas-ui-store"
import { useGhostStore, hasQuestionGhost, type GhostPairSlot, type GhostPairState, type GhostSlotDecision } from "@/stores/ghost-store"
import { useSessionStore } from "@/stores/session-store"
import { supabase } from "@/lib/supabase"
import { canvasEvent, ghostStatus } from "@/lib/api"
import { GHOST_WIDTH, ghostPositions, ghostPositionsFromEdge } from "@/lib/ghost-layout"
import { logger } from "@/lib/logger"
import type { EdgeType, RejectionReason } from "@/types"

// How long a guarded delete stays undoable before it commits for real. Kept
// as module state, not store state — it's a side-effect timer, not display
// data (create-zustand-store.md: actions live in stores, timers don't). Node
// and edge deletes get separate timer maps (their ids are never compared
// against each other) but share one toast slot in canvas-ui-store.
const DELETE_UNDO_WINDOW_MS = 5000
const pendingNodeDeleteTimers = new Map<string, ReturnType<typeof setTimeout>>()
const pendingEdgeDeleteTimers = new Map<string, ReturnType<typeof setTimeout>>()
// Keyed by a synthetic "batch:<uuid>" (requestNodesDelete), not a node id —
// a group delete is one action with one undo, not N independent ones.
const pendingGroupDeleteTimers = new Map<string, ReturnType<typeof setTimeout>>()

function nodeDeleteLabel(content: string): string {
  const firstLine = (content.split("\n")[0] ?? "").trim()
  if (!firstLine) return "Untitled node"
  return firstLine.length > 24 ? `${firstLine.slice(0, 24)}…` : firstLine
}

function groupDeleteLabel(count: number): string {
  return `${count} nodes`
}

function edgeDeleteLabel(edgeType: EdgeType): string {
  // "logical"/"question"/"relate" are human-drawable (the pen rack's three
  // pens); doubt/associative are AI-drawn only, but an accepted ghost edge
  // can carry either — undo-toast copy for those falls back to the generic
  // label rather than widening this switch for two types nothing lets a
  // human delete-confirm differently anyway.
  if (edgeType === "question") return "Question edge"
  if (edgeType === "logical") return "Logical edge"
  if (edgeType === "relate") return "Relate edge"
  return "Edge"
}

// Flip to "true" to fall back to the old local-only mock (no Supabase writes)
// without deleting the real path below — useful if local Supabase is down.
const USE_MOCK_PERSISTENCE = process.env.NEXT_PUBLIC_USE_MOCK_PERSISTENCE === "true"

// Fallback dev ids for testing a single canvas without the create/hydrate
// flow (a canvas + session row made by hand in Supabase). The real path now
// reads the hydrated canvas/session from session-store; these only fill in
// when nothing has been hydrated yet.
const DEV_CANVAS_ID = process.env.NEXT_PUBLIC_DEV_CANVAS_ID
const DEV_SESSION_ID = process.env.NEXT_PUBLIC_DEV_SESSION_ID

// The canvas/session a write belongs to: whatever real canvas is currently
// hydrated (session-store), falling back to the dev env vars. Returns null
// only when neither is available — the caller then skips the Supabase write.
function currentIds(): { canvasId: string; sessionId: string } | null {
  const { canvasId, sessionId } = useSessionStore.getState()
  const resolvedCanvas = canvasId ?? DEV_CANVAS_ID
  const resolvedSession = sessionId ?? DEV_SESSION_ID
  if (!resolvedCanvas || !resolvedSession) return null
  return { canvasId: resolvedCanvas, sessionId: resolvedSession }
}

// React Flow handle ids are "<side>-source" / "<side>-target" (HumanNode.tsx
// — one handle pair per side). The DB's from_handle/to_handle check
// constraint only allows the bare side, uppercase ('TOP'|'RIGHT'|'BOTTOM'|
// 'LEFT') — NOT the whole compound id uppercased, which is what caused
// edges_from_handle_check to reject every insert. Strip the -source/-target
// suffix before uppercasing.
function handleSide(handle: string | null | undefined): string | null {
  if (!handle) return null
  return handle.split("-")[0].toUpperCase()
}

// ghost-interaction (API-CONTRACT.md § Accept flow): records this slot's
// call, then — once BOTH slots are decided (or the only one, when there's
// no question ghost) — fires the real materialize/ghost-status/canvas-event
// sequence exactly once. Mixed outcomes (context accepted, question
// rejected) are one ghost-status call with two statuses, never two calls,
// so nothing fires while a decision is still outstanding. Module-scope, not
// inside the hook — it closes over nothing hook-local (only .getState()
// accessors and module imports), and the react-hooks/purity rule otherwise
// flags the Date.now() below as an impure call "during render" even though
// this only ever runs from a click handler.
function decideGhost(
  triggerNodeId: string,
  slot: GhostPairSlot,
  decision: GhostSlotDecision,
  reason?: RejectionReason,
) {
  useGhostStore.getState().recordDecision(triggerNodeId, slot, decision, reason)
  const pair = useGhostStore.getState().pairs[triggerNodeId]
  if (!pair) return // pair already gone (e.g. its trigger node was deleted mid-decision)

  const questionExists = hasQuestionGhost(pair)
  const contextDecided = pair.contextDecision !== undefined
  const questionDecided = !questionExists || pair.questionDecision !== undefined
  if (!contextDecided || !questionDecided) return // waiting on the other slot

  void resolveGhostPair(triggerNodeId, pair, questionExists)
}

async function resolveGhostPair(triggerNodeId: string, pair: GhostPairState, questionExists: boolean) {
  const ids = currentIds()
  if (!ids) {
    logger.error("[ghost-interaction] no canvas/session in context — skipping", { triggerNodeId })
    return
  }
  // Controls only ever appear once `streamed` (GhostNodeCard), and `done`
  // sets attribution in the same write as streamed — this should be
  // unreachable, but ghost-status has nowhere to read thread_id/turn_index
  // from without it.
  if (!pair.attribution) {
    logger.error("[ghost-interaction] pair has no attribution at decision time", { triggerNodeId })
    return
  }

  const contextAccepted = pair.contextDecision === "accepted"
  const questionAccepted = questionExists && pair.questionDecision === "accepted"
  // Mirrors Canvas.tsx's own edge-vs-node position choice exactly, so the
  // accepted node lands precisely where the ghost was hanging — a
  // `relate`-triggered pair floats at its edge's midpoint, not next to a
  // single trigger node.
  const nodes = useCanvasStore.getState().nodes
  const [anchorA, anchorB] = pair.anchorNodeIds
  const nodeA = anchorA ? nodes.find((n) => n.id === anchorA) : undefined
  const nodeB = anchorB ? nodes.find((n) => n.id === anchorB) : undefined
  // Exactly the condition Canvas.tsx's relateEndpoints uses, so what
  // acceptance persists can't disagree with what the ghost showed.
  const relateEndpoints = pair.triggerEdgeId && nodeA && nodeB ? ([nodeA, nodeB] as const) : undefined
  const positions = relateEndpoints
    ? ghostPositionsFromEdge([relateEndpoints[0], relateEndpoints[1]])
    : ghostPositions(nodes.find((n) => n.id === triggerNodeId))

  // While pending, a `relate` pair's ghost hangs from BOTH endpoints — one
  // drop-line each (Canvas.tsx's edges memo). The descriptor names only one
  // edge (context_edge.from is the trigger node, i.e. one endpoint), so
  // materializing it alone would silently drop the second connection and
  // the accepted node would land wired to a single node. Persist one real
  // edge per anchor instead, so the settled graph keeps the shape the ghost
  // promised. Node-triggered spawns are unaffected — one anchor, one edge.
  const contextEdges = relateEndpoints
    ? pair.anchorNodeIds.map((from) => ({ ...pair.descriptor.context_edge, from }))
    : [pair.descriptor.context_edge]

  // 1. Insert accepted node(s) + connecting edge(s), owner:'ai', reusing
  //    the ghost UUID as the node id — landed at the same spot the ghost
  //    was floating, so acceptance reads as a settle (CANVAS-RENDERING.md).
  //    Articulator content persists PARSED, markers stripped — never the
  //    raw [ARTICULATION n]-tagged stream (GHOST-STREAMING.md § Content
  //    Delivery / ghost-interaction's Contract Impact).
  const contextContent = pair.articulations ? pair.articulations.join("\n\n") : pair.contextText
  if (contextAccepted) {
    await materializeAcceptedGhost(
      pair.descriptor.context_node.ghost_id,
      contextContent,
      positions.context,
      GHOST_WIDTH.context,
      contextEdges,
      ids,
    )
  }
  if (questionAccepted && pair.descriptor.question_edge) {
    // question_edge.from is the CONTEXT ghost id — if context was rejected
    // (never inserted above), this insert's FK fails and rolls itself back,
    // silently declining an "accept the question, reject its own grounding"
    // combination. Not a real product path ("ground before nudge, never
    // question-first" — CORE-CONCEPTS.md), so that's an acceptable failure
    // mode rather than something worth its own guard.
    await materializeAcceptedGhost(
      pair.descriptor.question_node!.ghost_id,
      pair.questionText,
      positions.question,
      GHOST_WIDTH.question,
      [pair.descriptor.question_edge],
      ids,
    )
  }

  // 2. POST /api/ghost-status — thread_id/turn_index straight off `done`'s
  //    attribution (no agent_threads read needed). Fire-and-forget, same
  //    swallow-after-logging rule as canvasEvent — api.ts's post() already
  //    logs a failure.
  const interactedAt = Date.now()
  void ghostStatus({
    thread_id: pair.attribution.thread_id,
    turn_index: pair.attribution.turn_index,
    canvas_id: ids.canvasId,
    session_id: ids.sessionId,
    context_node_status: pair.contextDecision!,
    question_node_status: questionExists ? pair.questionDecision! : null,
    ...(pair.rejectionReason ? { rejection_reason: pair.rejectionReason } : {}),
    interacted_at: interactedAt,
  }).catch(() => {})

  // 3. POST /api/canvas-event('ghost.accepted') enriches the accepted
  //    node(s) (summary/embedding/node_sequence + an ai_contributions
  //    row) — never fired on an all-reject outcome (nothing to enrich),
  //    and never re-triggers an agent either way.
  const acceptedIds = [
    ...(contextAccepted ? [pair.descriptor.context_node.ghost_id] : []),
    ...(questionAccepted ? [pair.descriptor.question_node!.ghost_id] : []),
  ]
  if (acceptedIds.length > 0) {
    void canvasEvent({
      canvas_id: ids.canvasId,
      session_id: ids.sessionId,
      event_type: "ghost.accepted",
      node_ids: acceptedIds,
      agent_role: pair.descriptor.context_node.agent_role,
    }).catch(() => {})
  }

  // 4. The ghost layer's job ends here — accepted node(s) already live in
  //    canvas-store as real nodes (step 1); anything rejected just vanishes.
  useGhostStore.getState().resolve(triggerNodeId)
}

// Insert one accepted ghost's node + its connecting edge(s) as a single
// unit — owner:'ai', both_existing:false. Usually one edge; a `relate`
// pair passes two (one per anchor), and they go in as ONE multi-row
// insert so the pair can't half-land. The edge insert is skipped (and the
// node rolled back) if the node insert itself failed; a node insert
// succeeding but its edges failing leaves an orphaned real node with no
// rollback, same asymmetric-failure tradeoff writeEdge already accepts
// for the human-drawn path (retryPendingEdges has no equivalent here —
// ghost-status still fires either way, so a retry isn't wired).
async function materializeAcceptedGhost(
  ghostId: string,
  content: string,
  position: { x: number; y: number },
  width: number,
  edgeSpecs: Array<{ from: string; to: string; edge_type: EdgeType }>,
  ids: { canvasId: string; sessionId: string },
) {
  const { error: nodeError } = await supabase.from("nodes").insert({
    id: ghostId,
    canvas_id: ids.canvasId,
    session_id: ids.sessionId,
    owner: "ai",
    content,
    x: position.x,
    y: position.y,
    width,
    height: null,
  })
  if (nodeError) {
    logger.warn("[ghost-interaction] accepted node insert failed", { ghostId, error: nodeError })
    return
  }

  const edgeRows = edgeSpecs.map((spec) => ({
    id: crypto.randomUUID(),
    canvas_id: ids.canvasId,
    session_id: ids.sessionId,
    from_node_id: spec.from,
    to_node_id: spec.to,
    from_handle: null,
    to_handle: null,
    edge_type: spec.edge_type,
    both_existing: false,
  }))
  const { error: edgeError } = await supabase.from("edges").insert(edgeRows)
  if (edgeError) {
    logger.warn("[ghost-interaction] accepted edge insert failed, rolling back node", { ghostId, error: edgeError })
    await supabase.from("nodes").delete().eq("id", ghostId)
    return
  }

  useCanvasStore.getState().addAiNode(
    {
      id: ghostId,
      position,
      width,
      data: {
        content,
        owner: "ai",
        aiMarker: true,
        sessionNumber: useSessionStore.getState().sessionNumber ?? 1,
        synced: true,
      },
    },
    edgeRows.map((row) => ({
      id: row.id,
      source: row.from_node_id,
      target: row.to_node_id,
      edgeType: row.edge_type,
      synced: true,
    })),
  )
  logger.info("[ghost-interaction] accepted ghost materialized", {
    ghostId,
    edgeIds: edgeRows.map((row) => row.id),
  })
}

// The write-then-notify loop (STATE-MANAGEMENT.md): every user node/edge
// write below is followed by a fire-and-forget canvasEvent() call once the
// Supabase write succeeds — never before, never blocking. Edits and deletes
// intentionally do NOT notify (node.updated/edge.deleted have no reacting
// pipeline yet — API-CONTRACT.md Known Gap #6); those seams stay commented
// TODOs at their call sites.
export function useCanvasPersistence() {
  const updateNodeContent = useCanvasStore((s) => s.updateNodeContent)

  function persistNodeContent(nodeId: string, content: string) {
    const node = useCanvasStore.getState().nodes.find((n) => n.id === nodeId)
    const previousContent = node?.data.content
    const alreadySynced = node?.data.synced ?? false

    // Optimistic — the store updates instantly regardless of write path.
    updateNodeContent(nodeId, content)

    // A node with no Supabase row yet and no real text still isn't a
    // "commit" — stays local-only (STATE-MANAGEMENT.md: persist on first
    // NON-EMPTY blur, not per keystroke, not on an empty node). A node that
    // already has a row can legitimately be cleared back to empty — that's
    // an edit, not a never-committed node, so it still syncs.
    if (!content.trim() && !alreadySynced) {
      logger.debug("[persistence] empty node — staying local only, not yet committed", { nodeId })
      return
    }

    if (USE_MOCK_PERSISTENCE) {
      logger.debug("[persistence] node content updated (mock — no Supabase write)", { nodeId })
      return
    }

    const ids = currentIds()
    if (!ids) {
      logger.error("[persistence] no canvas/session in context — skipping Supabase write", { nodeId })
      return
    }

    // Fire-and-forget: never block the canvas render on the round-trip
    // (same rule as api.ts's canvasEvent).
    void writeNodeContent(nodeId, content, previousContent, ids.canvasId, ids.sessionId)
  }

  async function writeNodeContent(
    nodeId: string,
    content: string,
    previousContent: string | undefined,
    canvasId: string,
    sessionId: string,
  ) {
    // upsert, not insert: this same path handles both the first content
    // commit (creation) and every later edit (STATE-MANAGEMENT.md
    // "Persistence Patterns" — creation and edits are the same shape here,
    // and the id is always client-generated up front).
    // Layout (x/y/width/height) rides along so a node's very first row
    // already carries its position — the frontend owns these columns; the
    // backend never reads them (layout contract update, 2026-08-11).
    const node = useCanvasStore.getState().nodes.find((n) => n.id === nodeId)
    const { error } = await supabase.from("nodes").upsert({
      id: nodeId,
      canvas_id: canvasId,
      session_id: sessionId,
      owner: "human",
      content,
      x: node?.position.x ?? null,
      y: node?.position.y ?? null,
      width: node?.width ?? null,
      height: node?.height ?? null,
    })

    if (error) {
      logger.warn("[persistence] insert failed, rolling back", { nodeId, error })
      if (previousContent !== undefined) updateNodeContent(nodeId, previousContent)
      return
    }

    useCanvasStore.getState().markNodeSynced(nodeId)
    logger.info("[persistence] node persisted to Supabase", { nodeId })

    // Only the first non-empty content commit is a creation — `node.synced`
    // above was read before this upsert, so it still reflects pre-write
    // state. A later edit reuses this same upsert path but must NOT refire
    // node.created (no node.updated pipeline exists yet — Known Gap #6).
    if (!node?.data.synced) {
      // Fire-and-forget: never block the canvas on the backend round-trip
      // (node.created's summary+embedding is synchronous and slow, ~1-3s).
      // canvasEvent() throws on a non-2xx (api.ts's post()), which already
      // logs the failure — catch here only so a backend error surfaces as a
      // log line, not an unhandled promise rejection in the console.
      void canvasEvent({ canvas_id: canvasId, session_id: sessionId, event_type: "node.created", node_id: nodeId }).catch(
        () => {},
      )
    }

    retryPendingEdges(nodeId)
  }

  // Move / resize commit — persist x/y/width/height for a node that already
  // has a Supabase row. Spatial-only: no content touched, no canvas-event
  // (the backend is intentionally blind to layout — it never invalidates a
  // fingerprint or wakes an agent). A node not yet synced is skipped: its
  // layout gets written with the first content commit (writeNodeContent),
  // so there's nothing to persist here until then.
  function persistNodeLayout(nodeId: string) {
    const node = useCanvasStore.getState().nodes.find((n) => n.id === nodeId)
    if (!node || !node.data.synced) return

    if (USE_MOCK_PERSISTENCE) {
      logger.debug("[persistence] node layout changed (mock — no Supabase write)", { nodeId })
      return
    }
    if (!currentIds()) {
      logger.error("[persistence] no canvas/session in context — skipping layout write", { nodeId })
      return
    }

    void writeNodeLayout(nodeId, node.position.x, node.position.y, node.width, node.height ?? null)
  }

  async function writeNodeLayout(
    nodeId: string,
    x: number,
    y: number,
    width: number,
    height: number | null,
  ) {
    // update, not upsert — the row exists (synced check above), and an update
    // touches only these four columns, never content/owner.
    const { error } = await supabase.from("nodes").update({ x, y, width, height }).eq("id", nodeId)
    if (error) {
      // No rollback: snapping a node back to a stale position mid-work is
      // more jarring than a lost layout write. Log and move on — the next
      // move/resize commit will try again.
      logger.warn("[persistence] node layout write failed", { nodeId, error })
      return
    }
    logger.debug("[persistence] node layout persisted", { nodeId })
  }

  // Drag-to-bend commit (EdgeBendHandle) — would persist bend_x/bend_y for
  // an edge that already has a Supabase row, same shape and same
  // "frontend owns this column, backend never reads it" convention as
  // persistNodeLayout/writeNodeLayout above (nodes got x/y/width/height this
  // way in the 2026-08-11 layout contract update). NOT wired to a real write
  // yet: the edges table has no bend_x/bend_y columns — types/database.types.ts
  // is generated from the live schema and doesn't have them, so an update
  // here would just 400 on every drag. The bend still lives correctly in
  // canvas-store; it just won't survive a reload until that migration lands
  // and this TODO is turned into the same update(...).eq("id", ...) call
  // writeNodeLayout uses.
  // TODO(contract-layer): add bend_x/bend_y (nullable float8) to edges, then
  // supabase.from("edges").update({ bend_x, bend_y }).eq("id", edgeId).
  function persistEdgeBend(edgeId: string) {
    logger.debug("[persistence] edge bend changed (not yet persisted — bend_x/bend_y column pending)", {
      edgeId,
    })
  }

  // Any edge touching this node that stayed local-only because this node
  // (or possibly still the other end) wasn't synced yet. Runs after every
  // successful node write, not just the "first" one, since either endpoint
  // of a pending edge could be the one that was still uncommitted.
  function retryPendingEdges(nodeId: string) {
    const { edges } = useCanvasStore.getState()
    const pending = edges.filter((e) => !e.synced && (e.source === nodeId || e.target === nodeId))
    for (const edge of pending) attemptEdgeWrite(edge)
  }

  function persistEdge(
    source: string,
    target: string,
    edgeType: HumanEdgeType,
    sourceHandle?: string | null,
    targetHandle?: string | null,
  ) {
    // Store generates the id here (not the hook) so the dedupe check and the
    // id used for the Supabase write are the same call — no way for them to
    // drift apart.
    const edge = useCanvasStore
      .getState()
      .addEdge(source, target, edgeType, sourceHandle ?? undefined, targetHandle ?? undefined)
    if (!edge) return // source/target already connected — nothing to persist
    attemptEdgeWrite(edge)
  }

  // Shared by persistEdge (right after drawing) and retryPendingEdges (once
  // a blocking node syncs later) — same guard chain either way.
  function attemptEdgeWrite(edge: CanvasEdge) {
    const nodes = useCanvasStore.getState().nodes
    const sourceSynced = nodes.find((n) => n.id === edge.source)?.data.synced ?? false
    const targetSynced = nodes.find((n) => n.id === edge.target)?.data.synced ?? false
    if (!sourceSynced || !targetSynced) {
      // Same rule as node content: stays local-only until both ends are
      // real Supabase rows. Whichever node syncs later re-triggers this via
      // retryPendingEdges — no failed round-trip in the meantime.
      logger.debug("[persistence] edge touches an uncommitted node — staying local only", {
        edgeId: edge.id,
      })
      return
    }

    if (USE_MOCK_PERSISTENCE) {
      logger.debug("[persistence] edge created (mock — no Supabase write)", { edgeId: edge.id })
      return
    }

    const ids = currentIds()
    if (!ids) {
      logger.error("[persistence] no canvas/session in context — skipping Supabase write", { edgeId: edge.id })
      return
    }

    void writeEdge(edge, ids.canvasId, ids.sessionId)
  }

  async function writeEdge(edge: CanvasEdge, canvasId: string, sessionId: string) {
    // both_existing is always true today — Canvas.tsx's onConnect only fires
    // between two nodes already on the canvas; there is no "drag to empty
    // space creates a child node" gesture yet (STATE-MANAGEMENT.md).
    // from_handle/to_handle store just the bare side (TOP/RIGHT/BOTTOM/LEFT,
    // uppercase — a DB check constraint), not the whole "right-source"
    // compound id React Flow uses. See handleSide.
    const { error } = await supabase.from("edges").insert({
      id: edge.id,
      canvas_id: canvasId,
      session_id: sessionId,
      from_node_id: edge.source,
      to_node_id: edge.target,
      from_handle: handleSide(edge.sourceHandle),
      to_handle: handleSide(edge.targetHandle),
      edge_type: edge.edgeType,
      both_existing: true,
    })

    if (error) {
      // A retried write failing here is a real error (not the FK case —
      // attemptEdgeWrite already confirmed both ends are synced), so the
      // same rollback applies even though the edge may have been sitting on
      // the canvas for a while by the time a retry runs.
      logger.warn("[persistence] edge insert failed, rolling back", { edgeId: edge.id, error })
      useCanvasStore.getState().removeEdge(edge.id)
      return
    }

    useCanvasStore.getState().markEdgeSynced(edge.id)
    logger.info("[persistence] edge persisted to Supabase", { edgeId: edge.id })
    // Fire-and-forget, same rule (and same swallow-after-logging) as
    // writeNodeContent's canvasEvent call — never block the canvas on the
    // round-trip. both_existing:true above is what the backend reads to
    // decide Articulator vs debounced flow, per edge_type (API-CONTRACT.md).
    void canvasEvent({ canvas_id: canvasId, session_id: sessionId, event_type: "edge.created", edge_id: edge.id }).catch(
      () => {},
    )
  }

  // Guarded delete (Node Delete UI): hides the node immediately — same
  // optimistic cascade the old instant delete did — but holds the real
  // Supabase write behind a 5s undo window shown as a toast
  // (canvas-ui-store's pendingDelete). Confirming *before* this runs is the
  // caller's job (HumanNode's confirm popover / Backspace-on-selected); this
  // is the "committed, but still reversible for a few seconds" half.
  function requestNodeDelete(nodeId: string) {
    const node = useCanvasStore.getState().nodes.find((n) => n.id === nodeId)
    // Ghost ids never appear in canvas-store (no-op by lookup failing), and
    // AI-owned nodes are excluded by design (CANVAS-RENDERING.md — delete is
    // "only human-owned elements") — both land here as a no-op rather than
    // needing a special case at the call site.
    if (!node || node.data.owner !== "human") return

    const connectedEdges = useCanvasStore.getState().edges.filter(
      (e) => e.source === nodeId || e.target === nodeId,
    )

    // Optimistic — the store cascades the connected edges itself. Also drop
    // any pending ghost pair keyed to this node: it would otherwise keep
    // floating with a trigger that no longer exists. This is cleanup, not an
    // accept/reject decision, but resolve() is the store's only removal
    // action either way.
    useCanvasStore.getState().removeNode(nodeId)
    useGhostStore.getState().resolve(nodeId)

    useCanvasUiStore.getState().setPendingDelete({
      id: nodeId,
      label: nodeDeleteLabel(node.data.content),
      undo: () => undoNodeDelete(nodeId, node, connectedEdges),
    })

    const timer = setTimeout(() => {
      pendingNodeDeleteTimers.delete(nodeId)
      // Only clear the toast if it's still showing THIS node — a later
      // delete may already have replaced it, and that one's own timer owns
      // clearing it now.
      if (useCanvasUiStore.getState().pendingDelete?.id === nodeId) {
        useCanvasUiStore.getState().setPendingDelete(null)
      }
      void commitNodeDelete(node, connectedEdges)
    }, DELETE_UNDO_WINDOW_MS)
    pendingNodeDeleteTimers.set(nodeId, timer)
  }

  function undoNodeDelete(nodeId: string, node: CanvasNode, connectedEdges: CanvasEdge[]) {
    const timer = pendingNodeDeleteTimers.get(nodeId)
    if (timer) {
      clearTimeout(timer)
      pendingNodeDeleteTimers.delete(nodeId)
    }
    useCanvasStore.getState().restoreNode(node, connectedEdges)
    if (useCanvasUiStore.getState().pendingDelete?.id === nodeId) {
      useCanvasUiStore.getState().setPendingDelete(null)
    }
  }

  // Runs once the undo window has elapsed with no undo — the actual
  // Supabase delete, same write/rollback shape the old instant deleteNode
  // used (restoreNode on failure puts the node back exactly like an undo).
  async function commitNodeDelete(node: CanvasNode, connectedEdges: CanvasEdge[]) {
    if (!node.data.synced) {
      // Never had a Supabase row — and per the sync rule, neither did any
      // edge that only ever touched it — so there's nothing to delete
      // server-side.
      logger.debug("[persistence] uncommitted node removed locally only", { nodeId: node.id })
      return
    }

    if (USE_MOCK_PERSISTENCE) {
      logger.debug("[persistence] node removed (mock — no Supabase write)", { nodeId: node.id })
      return
    }

    // Deletes are by id (RLS-scoped), so writeNodeDelete doesn't need the
    // ids — this only confirms we're in a real canvas context before hitting
    // the network at all.
    if (!currentIds()) {
      logger.error("[persistence] no canvas/session in context — skipping Supabase delete", { nodeId: node.id })
      return
    }

    await writeNodeDelete(node, connectedEdges)
  }

  // Group select's Backspace/Delete (Canvas.tsx's own keydown listener,
  // gated on 2+ nodes selected) — one shared confirm-then-undo action for
  // the whole selection instead of requestNodeDelete called once per node
  // (which used to pop open one confirm popover per selected node — the
  // bug this replaces). Same optimistic-cascade / undo-window shape as
  // requestNodeDelete, just batched: one pendingDelete toast, one undo,
  // one commit.
  function requestNodesDelete(nodeIds: string[]) {
    const allNodes = useCanvasStore.getState().nodes
    const targets = nodeIds
      .map((id) => allNodes.find((n) => n.id === id))
      .filter((n): n is CanvasNode => !!n && n.data.owner === "human")
    if (targets.length === 0) return
    // Not actually a group — same single-node path as the kebab menu/solo
    // Backspace, so it gets that flow's per-node label instead of "1 node".
    if (targets.length === 1) {
      requestNodeDelete(targets[0].id)
      return
    }

    const targetIds = new Set(targets.map((n) => n.id))
    const connectedEdges = useCanvasStore
      .getState()
      .edges.filter((e) => targetIds.has(e.source) || targetIds.has(e.target))

    // Optimistic — same cascade requestNodeDelete does, just for every
    // selected node in one pass. removeNode's own edge-filter is safe to
    // call repeatedly: an edge between two targets is already gone by the
    // time the second endpoint's removeNode call runs, so that pass is a
    // no-op for it.
    for (const node of targets) {
      useCanvasStore.getState().removeNode(node.id)
      useGhostStore.getState().resolve(node.id)
    }

    const batchKey = `batch:${crypto.randomUUID()}`
    useCanvasUiStore.getState().setPendingDelete({
      id: batchKey,
      label: groupDeleteLabel(targets.length),
      undo: () => undoNodesDelete(batchKey, targets, connectedEdges),
    })

    const timer = setTimeout(() => {
      pendingGroupDeleteTimers.delete(batchKey)
      if (useCanvasUiStore.getState().pendingDelete?.id === batchKey) {
        useCanvasUiStore.getState().setPendingDelete(null)
      }
      void commitNodesDelete(targets, connectedEdges)
    }, DELETE_UNDO_WINDOW_MS)
    pendingGroupDeleteTimers.set(batchKey, timer)
  }

  function undoNodesDelete(batchKey: string, nodes: CanvasNode[], edges: CanvasEdge[]) {
    const timer = pendingGroupDeleteTimers.get(batchKey)
    if (timer) {
      clearTimeout(timer)
      pendingGroupDeleteTimers.delete(batchKey)
    }
    useCanvasStore.getState().restoreNodes(nodes, edges)
    if (useCanvasUiStore.getState().pendingDelete?.id === batchKey) {
      useCanvasUiStore.getState().setPendingDelete(null)
    }
  }

  // Runs once the undo window elapses with no undo — same shape as
  // commitNodeDelete, batched. Nodes that never had a Supabase row (still
  // local-only) are filtered out before the network call the same way
  // commitNodeDelete's own !node.data.synced check does; if NONE of the
  // batch was ever synced, there's nothing to send at all.
  async function commitNodesDelete(nodes: CanvasNode[], edges: CanvasEdge[]) {
    const syncedNodes = nodes.filter((n) => n.data.synced)
    if (syncedNodes.length === 0) {
      logger.debug("[persistence] uncommitted nodes removed locally only", { count: nodes.length })
      return
    }

    if (USE_MOCK_PERSISTENCE) {
      logger.debug("[persistence] nodes removed (mock — no Supabase write)", { count: syncedNodes.length })
      return
    }

    if (!currentIds()) {
      logger.error("[persistence] no canvas/session in context — skipping Supabase delete", {
        count: syncedNodes.length,
      })
      return
    }

    await writeNodesDelete(syncedNodes, edges)
  }

  async function writeNodesDelete(nodes: CanvasNode[], edges: CanvasEdge[]) {
    // Edges first, same FK-ordering reason as writeNodeDelete — batched via
    // .in() instead of one .eq() per row.
    const syncedEdgeIds = edges.filter((e) => e.synced).map((e) => e.id)
    if (syncedEdgeIds.length > 0) {
      const { error: edgeError } = await supabase.from("edges").delete().in("id", syncedEdgeIds)
      if (edgeError) {
        logger.warn("[persistence] failed to delete connected edges, restoring nodes", {
          count: nodes.length,
          error: edgeError,
        })
        useCanvasStore.getState().restoreNodes(nodes, edges)
        return
      }
    }

    const nodeIds = nodes.map((n) => n.id)
    const { error } = await supabase.from("nodes").delete().in("id", nodeIds)
    if (error) {
      // Same asymmetric rollback as writeNodeDelete: edges may already be
      // gone from Supabase by this point, so only the nodes come back.
      logger.warn("[persistence] nodes delete failed, restoring nodes", { count: nodes.length, error })
      useCanvasStore.getState().restoreNodes(nodes)
      return
    }

    logger.info("[persistence] nodes deleted from Supabase", { count: nodes.length })
    // TODO(contract-layer): no node.deleted canvas-event yet, same gap
    // writeNodeDelete's TODO notes.
  }

  // Delete-menu "Duplicate" — clones content + layout locally, then seeds
  // its first Supabase row through the same upsert path a typed node's
  // first content blur uses (persistNodeContent already no-ops on empty
  // content, so an empty duplicate stays local-only like any fresh node).
  function duplicateNode(nodeId: string) {
    const source = useCanvasStore.getState().nodes.find((n) => n.id === nodeId)
    if (!source || source.data.owner !== "human") return
    const clone = useCanvasStore.getState().duplicateNode(nodeId)
    if (!clone) return
    persistNodeContent(clone.id, clone.data.content)
  }

  async function writeNodeDelete(node: CanvasNode, connectedEdges: CanvasEdge[]) {
    // Edges first: deleting the node while a synced edge still references it
    // would fail the FK. Not transactional — see the comment below for what
    // happens if the node delete fails after this step succeeds.
    const syncedEdgeIds = connectedEdges.filter((e) => e.synced).map((e) => e.id)
    if (syncedEdgeIds.length > 0) {
      const { error: edgeError } = await supabase.from("edges").delete().in("id", syncedEdgeIds)
      if (edgeError) {
        logger.warn("[persistence] failed to delete connected edges, restoring node", {
          nodeId: node.id,
          error: edgeError,
        })
        useCanvasStore.getState().restoreNode(node, connectedEdges)
        return
      }
    }

    const { error } = await supabase.from("nodes").delete().eq("id", node.id)
    if (error) {
      // Connected edges may already be gone from Supabase by this point (the
      // two deletes aren't wrapped in one transaction) — restoring them
      // locally here would misrepresent server state, so only the node
      // itself comes back.
      logger.warn("[persistence] node delete failed, restoring node", { nodeId: node.id, error })
      useCanvasStore.getState().restoreNode(node)
      return
    }

    logger.info("[persistence] node deleted from Supabase", { nodeId: node.id })
    // TODO(contract-layer): there is no node.deleted canvas-event yet
    // (API-CONTRACT Known Gap #3 / CANVAS-RENDERING.md) — nothing to notify.
  }

  // Edge hover-delete: unlike requestNodeDelete there's no confirm step
  // first (an edge has no cascade to warn about) — one click hides it and
  // starts the same undo window, sharing canvas-ui-store's single toast
  // slot with node deletes.
  function requestEdgeDelete(edgeId: string) {
    const edge = useCanvasStore.getState().edges.find((e) => e.id === edgeId)
    if (!edge) return

    useCanvasStore.getState().removeEdge(edgeId)

    useCanvasUiStore.getState().setPendingDelete({
      id: edgeId,
      label: edgeDeleteLabel(edge.edgeType),
      undo: () => undoEdgeDelete(edgeId, edge),
    })

    const timer = setTimeout(() => {
      pendingEdgeDeleteTimers.delete(edgeId)
      if (useCanvasUiStore.getState().pendingDelete?.id === edgeId) {
        useCanvasUiStore.getState().setPendingDelete(null)
      }
      void commitEdgeDelete(edge)
    }, DELETE_UNDO_WINDOW_MS)
    pendingEdgeDeleteTimers.set(edgeId, timer)
  }

  function undoEdgeDelete(edgeId: string, edge: CanvasEdge) {
    const timer = pendingEdgeDeleteTimers.get(edgeId)
    if (timer) {
      clearTimeout(timer)
      pendingEdgeDeleteTimers.delete(edgeId)
    }
    useCanvasStore.getState().restoreEdge(edge)
    if (useCanvasUiStore.getState().pendingDelete?.id === edgeId) {
      useCanvasUiStore.getState().setPendingDelete(null)
    }
  }

  async function commitEdgeDelete(edge: CanvasEdge) {
    if (!edge.synced) {
      logger.debug("[persistence] uncommitted edge removed locally only", { edgeId: edge.id })
      return
    }
    if (USE_MOCK_PERSISTENCE) {
      logger.debug("[persistence] edge removed (mock — no Supabase write)", { edgeId: edge.id })
      return
    }
    if (!currentIds()) {
      logger.error("[persistence] no canvas/session in context — skipping Supabase delete", { edgeId: edge.id })
      return
    }

    const { error } = await supabase.from("edges").delete().eq("id", edge.id)
    if (error) {
      logger.warn("[persistence] edge delete failed, restoring edge", { edgeId: edge.id, error })
      useCanvasStore.getState().restoreEdge(edge)
      return
    }
    logger.info("[persistence] edge deleted from Supabase", { edgeId: edge.id })
    // TODO(contract-layer): there is no edge.deleted canvas-event yet either
    // (API-CONTRACT Known Gap #3 / CANVAS-RENDERING.md) — nothing to notify.
  }

  return {
    persistNodeContent,
    persistNodeLayout,
    persistEdge,
    persistEdgeBend,
    requestNodeDelete,
    requestNodesDelete,
    requestEdgeDelete,
    duplicateNode,
    decideGhost,
  }
}
