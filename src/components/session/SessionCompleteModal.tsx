'use client'

import { useEffect, useState } from 'react'
import * as api from '@/lib/api'
import { logger } from '@/lib/logger'
import { ObserverSuggestions } from './ObserverSuggestions'
import { UnresolvedThreads } from './UnresolvedThreads'

// The most significant UI moment in a session — a distinct modal flow.
// v1 sends carry_forward_ids: [] on complete and writes screen-2 choices as
// session_learnings rows directly (see SESSION-FLOWS.md → modal ordering note).

type Screen = 'observer' | 'unresolved' | 'closed'

type Props = {
  sessionId: string
  canvasId: string
  onClose(): void
}

export function SessionCompleteModal({ sessionId, canvasId, onClose }: Props) {
  const [screen, setScreen] = useState<Screen>('observer')

  useEffect(() => {
    api
      .sessionComplete({ session_id: sessionId, canvas_id: canvasId, carry_forward_ids: [] })
      .catch((err) => logger.warn('[session] complete call failed', { err }))
  }, [sessionId, canvasId])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl dark:bg-zinc-950">
        {screen === 'observer' && (
          <ObserverSuggestions sessionId={sessionId} onNext={() => setScreen('unresolved')} />
        )}
        {screen === 'unresolved' && (
          <UnresolvedThreads
            sessionId={sessionId}
            canvasId={canvasId}
            onNext={() => setScreen('closed')}
          />
        )}
        {screen === 'closed' && (
          <div className="space-y-4 text-center">
            <h2 className="text-lg font-semibold">Session closed</h2>
            <p className="text-sm text-zinc-500">
              Your north star is preserved. Carry-forward items will pre-load next time.
            </p>
            <button
              className="rounded bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
              onClick={onClose}
            >
              Start new session
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
