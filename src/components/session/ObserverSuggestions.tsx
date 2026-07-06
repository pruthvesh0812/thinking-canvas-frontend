'use client'

import { useEffect, useState } from 'react'
import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'
import { StructureOverlay } from '@/components/observer/StructureOverlay'
import {
  useObserverStore,
  type ObserverEdge,
  type ObserverNode,
} from '@/stores/observer-store'

// Session Complete screen 1 — session_learnings for this session.
// The Observer pipeline is async; the screen shows a "reading your canvas"
// state and re-polls until rows land.
type SessionLearning = {
  id: string
  session_id: string
  content: string
  learning_type: string | null
  is_contradiction: boolean | null
  status: 'pending' | 'accepted' | 'dismissed' | 'carried' | null
}

type Props = {
  sessionId: string
  canvasId?: string
  onNext(): void
}

export function ObserverSuggestions({ sessionId, canvasId, onNext }: Props) {
  const [rows, setRows] = useState<SessionLearning[] | null>(null)
  const [waiting, setWaiting] = useState(true)
  const structures = useObserverStore((s) => s.structures)
  const setStructures = useObserverStore((s) => s.setStructures)

  // ⚠ Backend-blocked: the observer_structures/observer_edges read path isn't
  // in the contract yet (API-CONTRACT Known Gap #2). This effect optimistically
  // reads what tables exist; missing tables surface a warn and the UI falls
  // back to the flat session_learnings cards below.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: structRows, error: sErr } = await supabase
        .from('observer_structures')
        .select('id, session_id')
        .eq('session_id', sessionId)
        .returns<{ id: string; session_id: string }[]>()
      if (sErr || !structRows || structRows.length === 0) {
        if (sErr) logger.warn('[observer] structures load skipped (Gap #2)', { sErr })
        return
      }
      const structureIds = structRows.map((s) => s.id)
      const { data: nodeRows } = await supabase
        .from('observer_nodes')
        .select('id, structure_id, content, level, anchor, materialized')
        .in('structure_id', structureIds)
        .returns<(ObserverNode & { structure_id: string })[]>()
      const { data: edgeRows } = await supabase
        .from('observer_edges')
        .select('id, structure_id, from_node_id, to_node_id, level, status')
        .in('structure_id', structureIds)
        .returns<(ObserverEdge & { structure_id: string })[]>()
      if (cancelled) return
      const byStructure = structRows.map((s) => ({
        id: s.id,
        session_id: s.session_id,
        nodes: (nodeRows ?? []).filter((n) => n.structure_id === s.id),
        edges: (edgeRows ?? []).filter((e) => e.structure_id === s.id),
        flagging: false,
      }))
      setStructures(byStructure)
    })()
    return () => {
      cancelled = true
    }
  }, [sessionId, setStructures])

  useEffect(() => {
    let cancelled = false
    let attempts = 0

    async function poll() {
      const { data, error } = await supabase
        .from('session_learnings')
        .select('id, session_id, content, learning_type, is_contradiction, status')
        .eq('session_id', sessionId)
        .returns<SessionLearning[]>()
      if (error) logger.warn('[session] session_learnings load failed', { sessionId, error })
      if (cancelled) return
      if (data && data.length > 0) {
        setRows(data)
        setWaiting(false)
      } else if (attempts++ < 10) {
        setTimeout(poll, 2000)
      } else {
        setRows([])
        setWaiting(false)
      }
    }
    poll()
    return () => {
      cancelled = true
    }
  }, [sessionId])

  async function updateStatus(id: string, status: SessionLearning['status']) {
    await supabase.from('session_learnings').update({ status }).eq('id', id)
    setRows((r) => (r ? r.map((row) => (row.id === id ? { ...row, status } : row)) : r))
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Observer suggestions</h2>
      {waiting && (
        <p className="text-sm text-zinc-500">The Observer is reading your canvas…</p>
      )}
      {rows && rows.length === 0 && Object.keys(structures).length === 0 && (
        <p className="text-sm text-zinc-500">No observations from this session.</p>
      )}
      {canvasId &&
        Object.values(structures).map((structure) => (
          <StructureOverlay
            key={structure.id}
            structure={structure}
            canvasId={canvasId}
            sessionId={sessionId}
          />
        ))}
      <ul className="space-y-2">
        {rows?.map((row) => (
          <li
            key={row.id}
            className="rounded-md border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {row.is_contradiction && (
              <div className="text-xs font-medium uppercase text-amber-600">contradiction</div>
            )}
            <div>{row.content}</div>
            <div className="mt-2 flex gap-2 text-xs">
              <button
                className="rounded bg-emerald-500 px-2 py-0.5 font-medium text-white"
                onClick={() => updateStatus(row.id, 'accepted')}
              >
                Accept to canvas
              </button>
              <button
                className="rounded border border-zinc-300 px-2 py-0.5 dark:border-zinc-600"
                onClick={() => updateStatus(row.id, 'dismissed')}
              >
                Dismiss
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex justify-end">
        <button
          className="rounded bg-black px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black"
          onClick={onNext}
        >
          Next
        </button>
      </div>
    </div>
  )
}
