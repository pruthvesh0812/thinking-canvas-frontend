'use client'

import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react'

// Dotted, muted — connects ghost nodes to their trigger / each other.
// Never user-selectable via EdgeTypeSelector (CANVAS-RENDERING.md).
export function GhostEdge(props: EdgeProps) {
  const [path] = getBezierPath(props)
  return (
    <BaseEdge
      id={props.id}
      path={path}
      style={{ stroke: '#a1a1aa', strokeWidth: 1.5, strokeDasharray: '2 3', opacity: 0.7 }}
    />
  )
}
