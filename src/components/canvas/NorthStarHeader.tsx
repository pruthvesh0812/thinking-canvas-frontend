'use client'

import { useSessionStore } from '@/stores/session-store'

// Renders `canvases.original_intent` for the whole session. Read-only, always
// visible — original_intent is write-once at canvas creation
// (CODING-STANDARDS.md non-negotiable #5). Never wire an edit affordance.
export function NorthStarHeader() {
  const canvas = useSessionStore((s) => s.canvas)
  if (!canvas) return null
  return (
    <header className="border-b border-zinc-200 bg-white/80 px-4 py-2 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="text-xs uppercase tracking-wide text-zinc-500">north star</div>
      <div className="text-sm text-zinc-900 dark:text-zinc-100">{canvas.original_intent}</div>
    </header>
  )
}
