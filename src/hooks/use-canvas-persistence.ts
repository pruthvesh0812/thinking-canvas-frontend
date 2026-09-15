import { useCanvasStore, type CanvasEdge, type CanvasNode, type HumanEdgeType } from "@/stores/canvas-store"
import { useCanvasUiStore } from "@/stores/canvas-ui-store"
import { useGhostStore, type GhostPairSlot } from "@/stores/ghost-store"
import { useSessionStore } from "@/stores/session-store"
import { supabase } from "@/lib/supabase"
import { logger } from "@/lib/logger"

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

function edgeDeleteLabel(edgeType: HumanEdgeType): string {
  return edgeType === "question" ? "Question edge" : "Logical edge"
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

// The write-then-notify loop (STATE-MANAGEMENT.md) has no backend to notify
// yet — canvas-core/contract-layer haven't landed, so the Supabase write
// below happens with NO POST /api/canvas-event call after it. That seam is
// commented where it belongs so wiring it in later is a drop-in.
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
    // TODO(contract-layer): POST /api/canvas-event('node.created') with IDs
    // only, once notifying the backend is turned on.

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
    // TODO(contract-layer): POST /api/canvas-event('edge.created') with IDs
    // only, once notifying the backend is turned on.
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
    // floating with a trigger that no longer exists. This is cleanup, not a
    // reject decision, so it goes through dismiss, not requestReject.
    useCanvasStore.getState().removeNode(nodeId)
    useGhostStore.getState().dismiss(nodeId)

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
      useGhostStore.getState().dismiss(node.id)
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

  function materializeGhost(triggerNodeId: string, slot: GhostPairSlot) {
    // TODO(ghost-interaction, contract-layer): Supabase insert of the
    // accepted node (owner:'ai') + connecting edge, then POST
    // /api/ghost-status — no canvas-event (the pipeline must not react to
    // its own output). The accepted ghost keeps rendering from ghost-store;
    // this only marks the seam where real materialization will happen.
    logger.info("[ghost-interaction] ghost accepted (mock — no backend write)", { triggerNodeId, slot })
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
    materializeGhost,
  }
}
