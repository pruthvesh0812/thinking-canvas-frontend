"use client"

import { useSessionStore } from "@/stores/session-store"

// The north star: `original_intent` is captured once at canvas creation and is
// immutable forever (CORE-CONCEPTS.md non-negotiable #6). There is deliberately
// no edit affordance here — changing your mind means creating a new canvas.
export function NorthStarHeader() {
  const originalIntent = useSessionStore((s) => s.originalIntent)

  if (!originalIntent) return null

  return (
    <div className="border-b border-zinc-200 bg-white/80 px-6 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <p className="text-[11px] font-medium uppercase tracking-widest text-zinc-400">
        North star
      </p>
      <p className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">{originalIntent}</p>
    </div>
  )
}
