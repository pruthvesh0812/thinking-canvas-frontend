import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react"
import { useGhostStore, type GhostNodeStatus, type GhostPairSlot } from "@/stores/ghost-store"

export interface GhostEdgeData extends Record<string, unknown> {
  pairKey: string
  slot: GhostPairSlot
}

function edgeAppearance(status: GhostNodeStatus | undefined, showRejected: boolean) {
  switch (status) {
    case "accepted":
      return { opacity: 0.8, dash: "0" }
    case "rejected-pending-reason":
      return { opacity: 0.32, dash: "6 5" }
    case "rejected-final":
      return { opacity: showRejected ? 0.28 : 0, dash: "6 5" }
    case "drawing":
      return { opacity: 0.3, dash: "6 5" }
    case "streaming":
    case "pending":
      return { opacity: 0.5, dash: "6 5" }
    case "hidden":
    default:
      return { opacity: 0, dash: "6 5" }
  }
}

// Dashed, muted — connects a ghost to its trigger (or a nudge to its
// grounding). Never user-drawable, inherits ghost translucency while its
// node is pending (CANVAS-RENDERING.md).
export function GhostEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps) {
  const edgeData = data as GhostEdgeData | undefined
  const showRejected = useGhostStore((s) => s.showRejected)
  const status = useGhostStore((s) => {
    if (!edgeData) return undefined
    return s.pairs[edgeData.pairKey]?.[edgeData.slot]?.status
  })
  const { opacity, dash } = edgeAppearance(status, showRejected)
  const [path] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
  return (
    <BaseEdge
      path={path}
      style={{
        stroke: "rgba(43,38,34,.55)",
        strokeWidth: 1.5,
        strokeDasharray: dash,
        opacity,
        transition: "opacity .5s ease",
      }}
    />
  )
}
