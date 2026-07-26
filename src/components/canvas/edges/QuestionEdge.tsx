import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react"

// Solid line + arrowhead like LogicalEdge, differentiated only by a small
// pulsing "Q" badge at the midpoint — the highest-signal human mark: an open
// question that summons the AI's cross-domain association
// (CORE-CONCEPTS.md). The pulse is the product's one ambient, non-attention-
// seeking motion; prefers-reduced-motion freezes it without losing the mark.
export function QuestionEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
}: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })
  return (
    <>
      <BaseEdge path={path} markerEnd={markerEnd} style={{ stroke: "#6A6154", strokeWidth: 1.5 }} />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan absolute flex items-center justify-center rounded-[7px] text-[10px] font-bold"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            width: 17,
            height: 15,
            background: "var(--tc-surface)",
            color: "var(--tc-ink)",
            animation: "tc-qpulse var(--tc-motion-pulse) ease-in-out infinite",
          }}
        >
          Q
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
