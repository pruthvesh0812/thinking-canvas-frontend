import { useCanvasStore, type CanvasEdge, type CanvasNode, type HumanEdgeType } from "@/stores/canvas-store"
import { useGhostStore, type GhostPairSlot } from "@/stores/ghost-store"
import { supabase } from "@/lib/supabase"
import { logger } from "@/lib/logger"

// Flip to "true" to fall back to the old local-only mock (no Supabase writes)
// without deleting the real path below — useful if local Supabase is down.
const USE_MOCK_PERSISTENCE = process.env.NEXT_PUBLIC_USE_MOCK_PERSISTENCE === "true"

// DEV-ONLY: canvas-dashboard/session-lifecycle haven't landed, so there is no
// real canvas/session yet to hang node writes off. `sessions` rows may only
// ever come from POST /api/session/start (STATE-MANAGEMENT.md) — never
// inserted directly — so until that call is wired in, these env vars point
// at a canvas + session row you create by hand in Supabase for local testing.
// Delete this block once canvas-dashboard/session-lifecycle land.
const DEV_CANVAS_ID = process.env.NEXT_PUBLIC_DEV_CANVAS_ID
const DEV_SESSION_ID = process.env.NEXT_PUBLIC_DEV_SESSION_ID

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

    if (!DEV_CANVAS_ID || !DEV_SESSION_ID) {
      logger.error(
        "[persistence] NEXT_PUBLIC_DEV_CANVAS_ID / NEXT_PUBLIC_DEV_SESSION_ID not set — skipping Supabase write",
        { nodeId },
      )
      return
    }

    // Fire-and-forget: never block the canvas render on the round-trip
    // (same rule as api.ts's canvasEvent).
    void writeNodeContent(nodeId, content, previousContent, DEV_CANVAS_ID, DEV_SESSION_ID)
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
    const { error } = await supabase.from("nodes").upsert({
      id: nodeId,
      canvas_id: canvasId,
      session_id: sessionId,
      owner: "human",
      content,
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

  // Any edge touching this node that stayed local-only because this node
  // (or possibly still the other end) wasn't synced yet. Runs after every
  // successful node write, not just the "first" one, since either endpoint
  // of a pending edge could be the one that was still uncommitted.
  function retryPendingEdges(nodeId: string) {
    const { edges } = useCanvasStore.getState()
    const pending = edges.filter((e) => !e.synced && (e.source === nodeId || e.target === nodeId))
    for (const edge of pending) attemptEdgeWrite(edge)
  }

  function persistEdge(source: string, target: string, edgeType: HumanEdgeType) {
    // Store generates the id here (not the hook) so the dedupe check and the
    // id used for the Supabase write are the same call — no way for them to
    // drift apart.
    const edge = useCanvasStore.getState().addEdge(source, target, edgeType)
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

    if (!DEV_CANVAS_ID || !DEV_SESSION_ID) {
      logger.error(
        "[persistence] NEXT_PUBLIC_DEV_CANVAS_ID / NEXT_PUBLIC_DEV_SESSION_ID not set — skipping Supabase write",
        { edgeId: edge.id },
      )
      return
    }

    void writeEdge(edge, DEV_CANVAS_ID, DEV_SESSION_ID)
  }

  async function writeEdge(edge: CanvasEdge, canvasId: string, sessionId: string) {
    // both_existing is always true today — Canvas.tsx's onConnect only fires
    // between two nodes already on the canvas; there is no "drag to empty
    // space creates a child node" gesture yet (STATE-MANAGEMENT.md).
    const { error } = await supabase.from("edges").insert({
      id: edge.id,
      canvas_id: canvasId,
      session_id: sessionId,
      from_node_id: edge.source,
      to_node_id: edge.target,
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

  function deleteNode(nodeId: string) {
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

    if (!node.data.synced) {
      // Never had a Supabase row — and per the sync rule, neither did any
      // edge that only ever touched it — so there's nothing to delete
      // server-side.
      logger.debug("[persistence] uncommitted node removed locally only", { nodeId })
      return
    }

    if (USE_MOCK_PERSISTENCE) {
      logger.debug("[persistence] node removed (mock — no Supabase write)", { nodeId })
      return
    }

    if (!DEV_CANVAS_ID || !DEV_SESSION_ID) {
      logger.error(
        "[persistence] NEXT_PUBLIC_DEV_CANVAS_ID / NEXT_PUBLIC_DEV_SESSION_ID not set — skipping Supabase write",
        { nodeId },
      )
      return
    }

    void writeNodeDelete(node, connectedEdges)
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

  function materializeGhost(triggerNodeId: string, slot: GhostPairSlot) {
    // TODO(ghost-interaction, contract-layer): Supabase insert of the
    // accepted node (owner:'ai') + connecting edge, then POST
    // /api/ghost-status — no canvas-event (the pipeline must not react to
    // its own output). The accepted ghost keeps rendering from ghost-store;
    // this only marks the seam where real materialization will happen.
    logger.info("[ghost-interaction] ghost accepted (mock — no backend write)", { triggerNodeId, slot })
  }

  return { persistNodeContent, persistEdge, deleteNode, materializeGhost }
}
