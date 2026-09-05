import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react"
import { useGhostStore, type GhostPairSlot } from "@/stores/ghost-store"

export interface GhostEdgeData extends Record<string, unknown> {
  pairKey: string
  slot: GhostPairSlot
}

// Mirrors GhostNodeCard's own drawing/streaming/pending read of the pair —
// no more per-node status enum, just contextText/questionText + streamed.
function edgeAppearance(text: string | undefined, streamed: boolean | undefined) {
  if (text === undefined) return { opacity: 0, dash: "6 5" } // pair (or slot) gone
  if (text === "" && !streamed) return { opacity: 0.3, dash: "6 5" } // drawing
  return { opacity: 0.5, dash: "6 5" } // streaming or pending
}

// Dashed, muted — connects a ghost to its trigger (or a nudge to its
// grounding). Never user-drawable, inherits ghost translucency while its
// node is pending (CANVAS-RENDERING.md).
export function GhostEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps) {
  const edgeData = data as GhostEdgeData | undefined
  // Two separate selectors, each returning a primitive — an object-literal
  // selector would give useGhostStore a fresh reference every render and
  // never settle (no shallow-compare wired into this store).
  const text = useGhostStore((s) => {
    const pair = edgeData ? s.pairs[edgeData.pairKey] : undefined
    if (!pair || !edgeData) return undefined
    return edgeData.slot === "context" ? pair.contextText : pair.questionText
  })
  const streamed = useGhostStore((s) => (edgeData ? s.pairs[edgeData.pairKey]?.streamed : undefined))
  const { opacity, dash } = edgeAppearance(text, streamed)
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
