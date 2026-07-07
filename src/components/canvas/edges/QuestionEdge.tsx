'use client'

import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react'

// Pulsing = promise to the user: "the AI may answer this." Backend fires the
// Outer Subconscious immediately on question-edge writes (API-CONTRACT.md).
// Keep the pulse subtle but unmistakable.
export function QuestionEdge(props: EdgeProps) {
  const [path] = getBezierPath(props)
  return (
    <>
      <style>{`
        @keyframes tc-question-pulse {
          0%, 100% { stroke-opacity: 0.35; }
          50% { stroke-opacity: 1; }
        }
        .tc-question-edge { animation: tc-question-pulse 1.8s ease-in-out infinite; }
      `}</style>
      <BaseEdge
        id={props.id}
        path={path}
        className="tc-question-edge"
        style={{ stroke: '#6366f1', strokeWidth: 2 }}
      />
    </>
  )
}
