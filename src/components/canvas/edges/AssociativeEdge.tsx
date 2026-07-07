'use client'

import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react'

// Render-only in v1 — not exposed in the EdgeTypeSelector; reserved for
// AI-drawn edges (CANVAS-RENDERING.md).
export function AssociativeEdge(props: EdgeProps) {
  const [path] = getBezierPath(props)
  return (
    <BaseEdge
      id={props.id}
      path={path}
      style={{ stroke: '#d4d4d8', strokeWidth: 1.5, strokeDasharray: '2 3' }}
    />
  )
}
