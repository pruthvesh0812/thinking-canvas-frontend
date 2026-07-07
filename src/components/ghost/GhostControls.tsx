'use client'

import { useState } from 'react'
import { RejectionReasonSelector } from './RejectionReasonSelector'
import type { RejectionReason } from '@/types'

// Per-node controls, rendered only after `done` (pre-done judgement would
// have the user reacting to a half-streamed thought — GHOST-STREAMING.md).
// Appreciation gets acknowledge-only (no reject button).
type Props = {
  streamed: boolean
  isAppreciation?: boolean
  onAccept(): void
  onReject(reason: RejectionReason): void
  onAcknowledge?(): void
}

export function GhostControls({
  streamed,
  isAppreciation,
  onAccept,
  onReject,
  onAcknowledge,
}: Props) {
  const [rejecting, setRejecting] = useState(false)
  if (!streamed) return null
  if (isAppreciation) {
    return (
      <div className="mt-2 flex justify-end">
        <button
          className="rounded bg-amber-400 px-2 py-0.5 text-xs font-medium text-black hover:bg-amber-300"
          onClick={onAcknowledge}
        >
          Acknowledge
        </button>
      </div>
    )
  }
  if (rejecting) {
    return (
      <div className="mt-2">
        <RejectionReasonSelector onSelect={onReject} onCancel={() => setRejecting(false)} />
      </div>
    )
  }
  return (
    <div className="mt-2 flex justify-end gap-1 text-xs">
      <button
        className="rounded bg-emerald-500 px-2 py-0.5 font-medium text-white hover:bg-emerald-400"
        onClick={onAccept}
      >
        Accept
      </button>
      <button
        className="rounded border border-zinc-300 px-2 py-0.5 font-medium hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
        onClick={() => setRejecting(true)}
      >
        Reject
      </button>
    </div>
  )
}
