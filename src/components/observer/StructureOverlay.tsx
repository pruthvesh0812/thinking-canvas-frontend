'use client'

import { useMemo, useState } from 'react'
import * as api from '@/lib/api'
import { logger } from '@/lib/logger'
import { useObserverStore, type EdgeFeedback, type ObserverStructure } from '@/stores/observer-store'
import { EdgeFeedbackSelector } from './EdgeFeedbackSelector'

// Leveled DAG view — level-k → level-(k+1) only, so a simple column layout
// (CORE-CONCEPTS.md → Observer Structure). Nodes materialize once ALL their
// incoming edges are accepted. Rejects batch: the structure stays visible in
// `flagging` mode until the user finishes.

type Props = {
  structure: ObserverStructure
  canvasId: string
  sessionId: string
}

export function StructureOverlay({ structure, canvasId, sessionId }: Props) {
  const acceptEdge = useObserverStore((s) => s.acceptEdge)
  const rejectEdge = useObserverStore((s) => s.rejectEdge)
  const finishFlagging = useObserverStore((s) => s.finishFlagging)
  const [flaggingEdgeId, setFlaggingEdgeId] = useState<string | null>(null)

  const nodesByLevel = structure.nodes
  const levels = useMemo(() => {
    const byLevel: Record<number, typeof nodesByLevel> = {}
    nodesByLevel.forEach((n) => {
      byLevel[n.level] = byLevel[n.level] ?? []
      byLevel[n.level].push(n)
    })
    return Object.keys(byLevel)
      .map(Number)
      .sort((a, b) => a - b)
      .map((k) => ({ level: k, nodes: byLevel[k] }))
  }, [nodesByLevel])

  async function reportEdgeStatus(
    edgeId: string,
    status: 'accepted' | 'rejected',
    feedback?: EdgeFeedback,
  ) {
    // ⚠ Backend-blocked: API-CONTRACT Known Gap #2 — /api/observer-edge-status
    // has no route yet. The api.observerEdgeStatus wrapper is a stub that logs
    // the intended call until the backend lands. Do NOT invent a substitute
    // endpoint — leave the seam visible.
    try {
      await api.observerEdgeStatus({
        edge_id: edgeId,
        canvas_id: canvasId,
        session_id: sessionId,
        status,
        feedback,
      })
    } catch (err) {
      logger.warn('[observer] edge-status call failed', { err })
    }
  }

  return (
    <div className="rounded-md border border-indigo-200 bg-indigo-50/60 p-3 text-sm dark:border-indigo-800 dark:bg-indigo-950/40">
      <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide text-indigo-800 dark:text-indigo-200">
        <span>observer structure</span>
        {structure.flagging && (
          <button
            className="rounded bg-indigo-600 px-2 py-0.5 text-white"
            onClick={() => finishFlagging(structure.id)}
          >
            Finish flagging
          </button>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto">
        {levels.map(({ level, nodes }) => (
          <div key={level} className="flex min-w-40 flex-col gap-2">
            <div className="text-xs text-indigo-500">L{level}</div>
            {nodes.map((n) => (
              <div
                key={n.id}
                className={
                  'rounded border px-2 py-1 text-xs ' +
                  (n.materialized
                    ? 'border-emerald-400 bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100'
                    : n.anchor
                      ? 'border-indigo-400 bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100'
                      : 'border-dashed border-indigo-400 bg-white/60 text-zinc-500 dark:bg-zinc-900/60')
                }
              >
                {n.content}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="mt-3 space-y-1">
        {structure.edges.map((e) => (
          <div
            key={e.id}
            className="flex items-center justify-between rounded border border-zinc-200 bg-white/70 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900/70"
          >
            <span className="truncate">
              L{e.level - 1}→L{e.level}: {e.from_node_id.slice(0, 6)} → {e.to_node_id.slice(0, 6)}
            </span>
            <span className="flex items-center gap-1">
              {e.status === 'accepted' && <span className="text-emerald-600">accepted</span>}
              {e.status === 'rejected' && (
                <span className="text-red-500">rejected ({e.feedback})</span>
              )}
              {e.status === 'pending' && flaggingEdgeId === e.id && (
                <EdgeFeedbackSelector
                  onSelect={(feedback) => {
                    rejectEdge(structure.id, e.id, feedback)
                    reportEdgeStatus(e.id, 'rejected', feedback)
                    setFlaggingEdgeId(null)
                  }}
                  onCancel={() => setFlaggingEdgeId(null)}
                />
              )}
              {e.status === 'pending' && flaggingEdgeId !== e.id && (
                <>
                  <button
                    className="rounded bg-emerald-500 px-1.5 py-0.5 font-medium text-white"
                    onClick={() => {
                      acceptEdge(structure.id, e.id)
                      reportEdgeStatus(e.id, 'accepted')
                    }}
                  >
                    Accept
                  </button>
                  <button
                    className="rounded border border-zinc-300 px-1.5 py-0.5 dark:border-zinc-600"
                    onClick={() => setFlaggingEdgeId(e.id)}
                  >
                    Reject
                  </button>
                </>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
