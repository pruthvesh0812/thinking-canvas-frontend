'use client'

import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import type { AgentRole, ContextNodeType } from '@/types'

// Data attached to a ghost context React Flow node — sourced from the ghost
// store, projected in Canvas.tsx merge. Streamed text renders live; controls
// only enable after `done` (GHOST-STREAMING.md).
export type GhostContextData = {
  nodeType: ContextNodeType
  agentRole: AgentRole
  contextText: string
  articulations?: string[]
  streamed: boolean
  isAppreciation: boolean
  triggerNodeId: string
}

type Props = NodeProps & { data: GhostContextData }

export const GhostContextNode = memo(function GhostContextNode({ data }: Props) {
  const appreciation = data.isAppreciation
  return (
    <div
      className={
        'w-64 rounded-md border-2 border-dashed p-3 text-sm ' +
        (appreciation
          ? 'border-amber-400 bg-amber-50/90 text-zinc-900 dark:bg-amber-950/40 dark:text-zinc-100'
          : 'border-zinc-400 bg-white/60 text-zinc-500 dark:border-zinc-500 dark:bg-zinc-900/60 dark:text-zinc-400') +
        (data.streamed ? '' : ' opacity-50')
      }
    >
      <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-wide">
        <span>{data.nodeType}</span>
        <span className="text-zinc-400">{data.agentRole}</span>
      </div>
      {data.articulations ? (
        <ul className="space-y-1">
          {data.articulations.map((text, i) => (
            <li key={i} className="rounded border border-zinc-300 p-2 dark:border-zinc-600">
              {text}
            </li>
          ))}
        </ul>
      ) : (
        <div className="whitespace-pre-wrap break-words">{data.contextText}</div>
      )}
    </div>
  )
})
