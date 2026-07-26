import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react"

// Solid line, arrowhead — "this follows from that" (CANVAS-RENDERING.md).
export function LogicalEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
}: EdgeProps) {
  const [path] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
  return <BaseEdge path={path} markerEnd={markerEnd} style={{ stroke: "#6A6154", strokeWidth: 1.5 }} />
}
