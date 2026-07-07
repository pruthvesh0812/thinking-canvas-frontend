'use client'

import { memo, useEffect, useRef, useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { HumanNodeData } from '@/stores/canvas-store'
import { useCanvasStore } from '@/stores/canvas-store'
import { logger } from '@/lib/logger'

// Inline-editable human node — the atomic unit of the thinking graph.
// Persists on first content blur (not per keystroke); the blur-with-empty
// case abandons the node without firing canvas-event (STATE-MANAGEMENT.md).

type Props = NodeProps & {
  data: HumanNodeData
}

export const HumanNode = memo(function HumanNode({ id, data, selected }: Props) {
  const [editing, setEditing] = useState(!data.content)
  const [draft, setDraft] = useState(data.content ?? '')
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const updateNodeContent = useCanvasStore((s) => s.updateNodeContent)
  const removeNode = useCanvasStore((s) => s.removeNode)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const commit = () => {
    const trimmed = draft.trim()
    if (!trimmed) {
      if (!data.content) {
        // Empty node abandoned → drop without notifying the backend.
        logger.info('[canvas] abandoning empty node', { id })
        removeNode(id)
        return
      }
      setDraft(data.content)
      setEditing(false)
      return
    }
    updateNodeContent(id, trimmed)
    // The persistence hook wires the actual Supabase write via the
    // window-level nodeCommit event dispatched below; keeping this component
    // free of the hook keeps it usable in stories/tests.
    window.dispatchEvent(
      new CustomEvent('canvas:node-commit', {
        detail: { id, content: trimmed, hadContent: Boolean(data.content) },
      }),
    )
    setEditing(false)
  }

  return (
    <div
      className={
        (selected ? 'ring-2 ring-blue-400 ' : '') +
        (data.owner === 'ai'
          ? 'border-solid border-emerald-500/60 bg-emerald-50/40 dark:bg-emerald-950/40 '
          : 'border-solid border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-950 ') +
        'w-56 rounded-md border px-3 py-2 text-sm shadow-sm'
      }
      onDoubleClick={() => setEditing(true)}
    >
      {editing ? (
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setDraft(data.content ?? '')
              setEditing(false)
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              commit()
            }
          }}
          rows={2}
          className="w-full resize-none border-none bg-transparent outline-none"
          placeholder="What are you thinking?"
        />
      ) : (
        <div className="whitespace-pre-wrap break-words">{data.content}</div>
      )}
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
})
