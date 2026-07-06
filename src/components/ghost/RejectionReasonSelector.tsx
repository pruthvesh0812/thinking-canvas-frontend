'use client'

import type { RejectionReason } from '@/types'

// Rejection is signal, not failure — the backend's Rejection Insights Engine
// turns the reason into negative constraints on future prompts
// (CORE-CONCEPTS.md). Reason is mandatory UI; backend defaults to skip_for_now.
const OPTIONS: { value: RejectionReason; label: string }[] = [
  { value: 'too_abstract', label: 'Too abstract' },
  { value: 'too_technical', label: 'Too technical' },
  { value: 'skip_for_now', label: 'Skip for now' },
]

type Props = {
  onSelect(reason: RejectionReason): void
  onCancel(): void
}

export function RejectionReasonSelector({ onSelect, onCancel }: Props) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-zinc-200 bg-white p-1 text-xs shadow-md dark:border-zinc-700 dark:bg-zinc-900">
      <div className="px-2 py-1 text-zinc-500">Why reject?</div>
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
