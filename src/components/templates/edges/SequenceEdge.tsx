import { BaseEdge, EdgeLabelRenderer, getStraightPath, type EdgeProps } from "@xyflow/react"
import type { TemplateEdgeData } from "./HierarchyEdge"

// Directed sequence link: straight line WITH an arrowhead at the destination,
// slightly darker than hierarchy edges to emphasize direction. The
// `transition` label ("which triggers") sits at the midpoint. `markerEnd` is
// threaded in from the canvas edge mapping. Ghost edges render dashed + dimmed.
export function SequenceEdge({ sourceX, sourceY, targetX, targetY, markerEnd, data }: EdgeProps) {
  const [path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY })
  const d = data as TemplateEdgeData | undefined
  const isGhost = !!d?.isGhost
  const label = d?.label ?? ""

  return (
    <>
      <BaseEdge
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: "#6A6154",
          strokeWidth: 1.5,
          strokeDasharray: isGhost ? "5 4" : undefined,
          opacity: isGhost ? 0.6 : 1,
        }}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            aria-hidden="true"
            className="nodrag nopan absolute rounded-[5px] px-1 text-[11px]"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              background: "var(--tc-surface)",
              color: "var(--tc-chrome)",
              opacity: isGhost ? 0.7 : 1,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
