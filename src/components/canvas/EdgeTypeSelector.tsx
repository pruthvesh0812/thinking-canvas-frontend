'use client'

import { useEffect, useRef } from 'react'
import type { EdgeType } from '@/types'

// Popover shown at the connection point after onConnect. The edge is NOT
// written until a type is chosen; Escape cancels the pending connection
// (CANVAS-RENDERING.md → EdgeTypeSelector). Associative is reserved for
// AI-drawn edges and never appears here.
const OPTIONS: { type: EdgeType; label: string; hint: string }[] = [
  { type: 'logical', label: 'Logical', hint: 'standard reasoning step' },
  { type: 'doubt', label: 'Doubt', hint: "I'm not sure this follows" },
  { type: 'question', label: 'Question', hint: 'the AI may answer this' },
]

type Props = {
  position: { x: number; y: number }
  onSelect(type: EdgeType): void
  onCancel(): void
}

export function EdgeTypeSelector({ position, onSelect, onCancel }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [onCancel])

  return (
    <div
      ref={containerRef}
      className="absolute z-50 flex flex-col gap-1 rounded-md border border-zinc-200 bg-white p-1 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
      style={{ left: position.x, top: position.y }}
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.type}
          className="rounded px-3 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
          onClick={() => onSelect(opt.type)}
        >
          <div className="font-medium">{opt.label}</div>
          <div className="text-xs text-zinc-500">{opt.hint}</div>
        </button>
      ))}
    </div>
  )
}
