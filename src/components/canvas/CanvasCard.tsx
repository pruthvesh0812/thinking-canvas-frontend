'use client'

import Link from 'next/link'

export type CanvasSummary = {
  id: string
  title: string | null
  original_intent: string
  node_count: number
  last_session_at: string | null
}

// Card in the dashboard grid. Clicking navigates into the canvas — the
// canvas page handles session start / resume via the persistence hook
// (STATE-MANAGEMENT.md → Canvas Hydration).
export function CanvasCard({ canvas }: { canvas: CanvasSummary }) {
  return (
    <Link
      href={`/canvas/${canvas.id}`}
      className="block rounded-lg border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-400 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-500"
    >
      <div className="text-xs uppercase tracking-wide text-zinc-500">north star</div>
      <div className="mt-1 line-clamp-3 text-sm text-zinc-900 dark:text-zinc-100">
        {canvas.original_intent}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
        <span>{canvas.node_count} nodes</span>
        <span>
          {canvas.last_session_at
            ? new Date(canvas.last_session_at).toLocaleDateString()
            : 'new'}
        </span>
      </div>
    </Link>
  )
}
