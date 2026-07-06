'use client'

import type { EdgeFeedback } from '@/stores/observer-store'

// Per-edge rejection vocabulary is distinct from ghost rejection (CORE-CONCEPTS.md).
const OPTIONS: { value: EdgeFeedback; label: string }[] = [
  { value: 'not_related', label: 'Not related' },
  { value: 'wrong_direction', label: 'Wrong direction' },
  { value: 'too_indirect', label: 'Too indirect' },
  { value: 'already_obvious', label: 'Already obvious' },
]

type Props = {
  onSelect(feedback: EdgeFeedback): void
  onCancel(): void
}

export function EdgeFeedbackSelector({ onSelect, onCancel }: Props) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-zinc-200 bg-white p-1 text-xs shadow-md dark:border-zinc-700 dark:bg-zinc-900">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          className="rounded px-2 py-1 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
          onClick={() => onSelect(opt.value)}
        >
          {opt.label}
        </button>
      ))}
      <button
        className="rounded px-2 py-1 text-left text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        onClick={onCancel}
      >
        Cancel
      </button>
    </div>
  )
}
