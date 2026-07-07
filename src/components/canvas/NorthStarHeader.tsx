'use client'

import { useState } from 'react'
import { PhaseToggle } from '@/components/session/PhaseToggle'
import { SessionCompleteModal } from '@/components/session/SessionCompleteModal'
import { useSessionStore } from '@/stores/session-store'

// Renders `canvases.original_intent` + phase toggle + Session Complete
// trigger. original_intent is write-once at canvas creation
// (CODING-STANDARDS.md non-negotiable #5) — never wire an edit affordance.
export function NorthStarHeader() {
  const canvas = useSessionStore((s) => s.canvas)
  const sessionId = useSessionStore((s) => s.session_id)
  const [completing, setCompleting] = useState(false)

  if (!canvas) return null
  return (
    <header className="flex items-center justify-between gap-4 border-b border-zinc-200 bg-white/80 px-4 py-2 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="min-w-0 flex-1">
        <div className="text-xs uppercase tracking-wide text-zinc-500">north star</div>
        <div className="truncate text-sm text-zinc-900 dark:text-zinc-100">
          {canvas.original_intent}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <PhaseToggle />
        {sessionId && (
          <button
            className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            onClick={() => setCompleting(true)}
          >
            Session Complete
          </button>
        )}
      </div>
      {completing && sessionId && (
        <SessionCompleteModal
          sessionId={sessionId}
          canvasId={canvas.canvas_id}
          onClose={() => setCompleting(false)}
        />
      )}
    </header>
  )
}
