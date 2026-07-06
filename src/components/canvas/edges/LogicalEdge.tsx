'use client'

import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react'

export function LogicalEdge(props: EdgeProps) {
  const [path] = getBezierPath(props)
  return <BaseEdge id={props.id} path={path} style={{ stroke: '#71717a', strokeWidth: 2 }} />
}
