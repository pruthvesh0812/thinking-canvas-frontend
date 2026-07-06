'use client'

import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'

export type GhostQuestionData = {
  questionText: string
  streamed: boolean
  triggerNodeId: string
}

type Props = NodeProps & { data: GhostQuestionData }

export const GhostQuestionNode = memo(function GhostQuestionNode({ data }: Props) {
  return (
    <div
      className={
        'w-56 rounded-md border-2 border-dashed border-indigo-400 bg-indigo-50/60 p-3 text-sm text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-100 ' +
        (data.streamed ? '' : 'opacity-50')
      }
    >
      <div className="mb-1 text-xs uppercase tracking-wide">question</div>
      <div className="whitespace-pre-wrap break-words">{data.questionText}</div>
    </div>
  )
})
