'use client'

import { useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useCanvasStore } from '@/stores/canvas-store'
import { logger } from '@/lib/logger'

// Session Complete screen 2 — frontend-computed unresolved items:
//   · question edges with no follow-up node at the target
//   · human nodes with empty content
// The full "unfollowed contradictions" surface arrives with observer-structure-ui.
// Carry-forward writes to session_learnings directly from the frontend (see
// SESSION-FLOWS.md → the modal ordering note).

type Thread = { key: string; label: string; nodeId?: string; edgeId?: string }
type Choice = 'carry' | 'resolve' | 'discard' | null

type Props = {
  sessionId: string
  canvasId: string
  onNext(): void
}

export function UnresolvedThreads({ sessionId, canvasId, onNext }: Props) {
  const nodes = useCanvasStore((s) => s.nodes)
  const edges = useCanvasStore((s) => s.edges)

  const threads = useMemo<Thread[]>(() => {
    const items: Thread[] = []
    for (const n of nodes) {
      if (!n.data?.content?.trim()) {
        items.push({ key: `empty:${n.id}`, label: 'Empty node', nodeId: n.id })
      }
    }
    const nodesById = new Map(nodes.map((n) => [n.id, n]))
    for (const e of edges) {
      const edgeType = (e.data as { edge_type?: string } | undefined)?.edge_type
      if (edgeType !== 'question') continue
      const targetHasFollowUp = edges.some((other) => other.source === e.target)
      if (!targetHasFollowUp) {
        const target = nodesById.get(e.target)
        items.push({
          key: `question:${e.id}`,
          label: `Unanswered question edge → "${target?.data?.content?.slice(0, 40) ?? ''}"`,
          edgeId: e.id,
        })
      }
    }
    return items
  }, [nodes, edges])

  const [choices, setChoices] = useState<Record<string, Choice>>({})

  async function commitChoices() {
    const carry = threads.filter((t) => choices[t.key] === 'carry')
    if (carry.length === 0) return onNext()
    const rows = carry.map((t) => ({
      session_id: sessionId,
      canvas_id: canvasId,
      content: t.label,
      status: 'carried' as const,
    }))
    const { error } = await supabase.from('session_learnings').insert(rows)
    if (error) logger.warn('[session] carry-forward insert failed', { error })
    onNext()
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Unresolved threads</h2>
      {threads.length === 0 && (
        <p className="text-sm text-zinc-500">Nothing left hanging — nice.</p>
      )}
      <ul className="space-y-2">
        {threads.map((t) => (
          <li
            key={t.key}
            className="flex items-center justify-between rounded-md border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <span>{t.label}</span>
            <div className="flex gap-1 text-xs">
              {(
                [
                  ['carry', 'Carry forward'],
                  ['resolve', 'Resolve now'],
                  ['discard', 'Discard'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  className={
                    'rounded px-2 py-0.5 ' +
                    (choices[t.key] === value
                      ? 'bg-black text-white dark:bg-white dark:text-black'
                      : 'border border-zinc-300 dark:border-zinc-600')
                  }
                  onClick={() => setChoices((c) => ({ ...c, [t.key]: value }))}
                >
                  {label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <div className="flex justify-end">
        <button
          className="rounded bg-black px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black"
          onClick={commitChoices}
        >
          Next
        </button>
      </div>
    </div>
  )
}
