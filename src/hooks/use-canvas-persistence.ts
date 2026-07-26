import { useCanvasStore } from "@/stores/canvas-store"
import { logger } from "@/lib/logger"
import type { GhostPairSlot } from "@/stores/ghost-store"

// The write-then-notify loop (STATE-MANAGEMENT.md) has no backend to talk to
// yet — canvas-core/contract-layer haven't landed. Every write here is local
// to canvas-store only. Each seam is commented with what the real call will
// be so wiring it in later is a drop-in, not a rewrite.
export function useCanvasPersistence() {
  const updateNodeContent = useCanvasStore((s) => s.updateNodeContent)

  function persistNodeContent(nodeId: string, content: string) {
    // TODO(contract-layer): Supabase `nodes` update, then
    // POST /api/canvas-event('node.created') with IDs only — never content.
    updateNodeContent(nodeId, content)
    logger.debug("[persistence] node content updated (mock — no backend write)", { nodeId })
  }

  function materializeGhost(triggerNodeId: string, slot: GhostPairSlot) {
    // TODO(ghost-interaction, contract-layer): Supabase insert of the
    // accepted node (owner:'ai') + connecting edge, then POST
    // /api/ghost-status — no canvas-event (the pipeline must not react to
    // its own output). The accepted ghost keeps rendering from ghost-store;
    // this only marks the seam where real materialization will happen.
    logger.info("[ghost-interaction] ghost accepted (mock — no backend write)", { triggerNodeId, slot })
  }

  return { persistNodeContent, materializeGhost }
}
