'use client'

import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react'

export function DoubtEdge(props: EdgeProps) {
  const [path] = getBezierPath(props)
  return (
    <BaseEdge
      id={props.id}
      path={path}
      style={{ stroke: '#a1a1aa', strokeWidth: 2, strokeDasharray: '6 4' }}
    />
  )
}
