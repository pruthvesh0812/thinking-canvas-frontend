'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'
import { CanvasCard, type CanvasSummary } from '@/components/canvas/CanvasCard'

// The workspace front door. RLS scopes canvases to the current user
// (anonymous or permanent — the uid stays constant across conversion).
export default function DashboardPage() {
  const [canvases, setCanvases] = useState<CanvasSummary[] | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      // One aggregate read per resource — never N+1 per card.
      const { data: canvasRows, error: canvasErr } = await supabase
        .from('canvases')
        .select('id, title, original_intent')
        .returns<{ id: string; title: string | null; original_intent: string }[]>()
      if (canvasErr) {
        logger.warn('[dashboard] canvases load failed', { error: canvasErr })
      }
      if (cancelled || !canvasRows) return

      const ids = canvasRows.map((c) => c.id)
      if (ids.length === 0) {
        setCanvases([])
        return
      }

      const [{ data: nodeRows }, { data: sessionRows }] = await Promise.all([
        supabase
          .from('nodes')
          .select('canvas_id')
          .in('canvas_id', ids)
          .returns<{ canvas_id: string }[]>(),
        supabase
          .from('sessions')
          .select('canvas_id, updated_at')
          .in('canvas_id', ids)
          .returns<{ canvas_id: string; updated_at: string | null }[]>(),
      ])

      const nodeCounts = new Map<string, number>()
      ;(nodeRows ?? []).forEach((n) => {
        nodeCounts.set(n.canvas_id, (nodeCounts.get(n.canvas_id) ?? 0) + 1)
      })
      const lastSessionAt = new Map<string, string | null>()
      ;(sessionRows ?? []).forEach((s) => {
        const prev = lastSessionAt.get(s.canvas_id)
        if (!prev || (s.updated_at && s.updated_at > prev)) {
          lastSessionAt.set(s.canvas_id, s.updated_at ?? null)
        }
      })

      if (cancelled) return
      setCanvases(
        canvasRows.map((c) => ({
          id: c.id,
          title: c.title,
          original_intent: c.original_intent,
          node_count: nodeCounts.get(c.id) ?? 0,
          last_session_at: lastSessionAt.get(c.id) ?? null,
        })),
      )
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-8 py-12">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Your canvases</h1>
          <p className="mt-2 text-sm text-zinc-500">
            The canvas where a human thinks in nodes and edges.
          </p>
        </div>
        <Link
          href="/canvas/new"
          className="inline-flex h-10 items-center rounded-md bg-black px-4 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          New canvas
        </Link>
      </header>

      {canvases === null && <p className="text-sm text-zinc-500">Loading…</p>}
      {canvases && canvases.length === 0 && (
        <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No canvases yet. Start one with your first north star.
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {canvases?.map((c) => (
          <CanvasCard key={c.id} canvas={c} />
        ))}
      </div>
    </main>
  )
}
