import { useGhostStore, type GhostPairSlot } from "@/stores/ghost-store"
import { useCanvasPersistence } from "@/hooks/use-canvas-persistence"

// Per-node accept/reject — shown on hover/focus only, gated on the pair
// member being fully streamed (GHOST-STREAMING.md: controls before `done`
// would let the user judge a half-streamed thought).
export function GhostControls({ triggerNodeId, slot }: { triggerNodeId: string; slot: GhostPairSlot }) {
  const { materializeGhost } = useCanvasPersistence()

  return (
    <div className="absolute left-[2px] top-full mt-2 flex gap-1.5">
      <button
        type="button"
        className="rounded-full px-3 py-1 text-xs"
        style={{ background: "var(--tc-node)", border: "1px solid rgba(43,38,34,.4)", color: "var(--tc-ink)" }}
        onClick={() => {
          useGhostStore.getState().accept(triggerNodeId, slot)
          materializeGhost(triggerNodeId, slot)
        }}
      >
        ✓ Accept
      </button>
      <button
        type="button"
        className="rounded-full px-3 py-1 text-xs"
        style={{ background: "transparent", border: "1px solid rgba(43,38,34,.2)", color: "var(--tc-chrome)" }}
        onClick={() => useGhostStore.getState().requestReject(triggerNodeId, slot)}
      >
        ✕ Reject
      </button>
    </div>
  )
}
