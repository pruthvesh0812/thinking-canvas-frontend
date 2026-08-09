import { useCanvasStore, type CanvasEdge, type HumanEdgeType } from "@/stores/canvas-store"
import { supabase } from "@/lib/supabase"
import { logger } from "@/lib/logger"
import type { GhostPairSlot } from "@/stores/ghost-store"

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
    const previousContent = useCanvasStore.getState().nodes.find((n) => n.id === nodeId)?.data.content

    // Optimistic — the store updates instantly regardless of write path.
    updateNodeContent(nodeId, content)

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

    logger.info("[persistence] node persisted to Supabase", { nodeId })
    // TODO(contract-layer): POST /api/canvas-event('node.created') with IDs
    // only, once notifying the backend is turned on.
  }

  function persistEdge(source: string, target: string, edgeType: HumanEdgeType) {
    // Store generates the id here (not the hook) so the dedupe check and the
    // id used for the Supabase write are the same call — no way for them to
    // drift apart.
    const edge = useCanvasStore.getState().addEdge(source, target, edgeType)
    if (!edge) return // source/target already connected — nothing to persist

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
      // Also fires if source/target is a brand-new node whose content was
      // never committed (STATE-MANAGEMENT.md — nodes persist on first
      // non-empty blur), since that node row doesn't exist in Supabase yet
      // to satisfy the FK. Known gap, not handled here.
      logger.warn("[persistence] edge insert failed, rolling back", { edgeId: edge.id, error })
      useCanvasStore.getState().removeEdge(edge.id)
      return
    }

    logger.info("[persistence] edge persisted to Supabase", { edgeId: edge.id })
    // TODO(contract-layer): POST /api/canvas-event('edge.created') with IDs
    // only, once notifying the backend is turned on.
  }

  function materializeGhost(triggerNodeId: string, slot: GhostPairSlot) {
    // TODO(ghost-interaction, contract-layer): Supabase insert of the
    // accepted node (owner:'ai') + connecting edge, then POST
    // /api/ghost-status — no canvas-event (the pipeline must not react to
    // its own output). The accepted ghost keeps rendering from ghost-store;
    // this only marks the seam where real materialization will happen.
    logger.info("[ghost-interaction] ghost accepted (mock — no backend write)", { triggerNodeId, slot })
  }

  return { persistNodeContent, persistEdge, materializeGhost }
}
