'use client'

import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'
import { useSessionStore, type SessionPhase } from '@/stores/session-store'

// Visible switch — the user always knows which mode the AI is in.
// Writes sessions.current_phase to Supabase directly; no canvas-event
// (the backend reads phase when routing agents).
export function PhaseToggle() {
  const phase = useSessionStore((s) => s.current_phase)
  const sessionId = useSessionStore((s) => s.session_id)
  const setPhase = useSessionStore((s) => s.setPhase)

  async function flip(next: SessionPhase) {
    if (!sessionId) return
    // Free-tier heuristic: converging would fire the Stress-Tester, which is
    // Pro-only. Signal the UpgradePrompt (v1 approach — backend doesn't yet
    // emit an "agent skipped for tier" event; billing story flags the gap).
    const tier = useSessionStore.getState().tier
    if (next === 'converging' && tier === 'free') {
      window.dispatchEvent(new CustomEvent('tc:upgrade-prompt'))
    }
    setPhase(next)
    const { error } = await supabase
      .from('sessions')
      .update({ current_phase: next })
      .eq('id', sessionId)
    if (error) logger.warn('[session] phase update failed', { sessionId, error })
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white p-1 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      {(['diverging', 'converging'] as SessionPhase[]).map((p) => (
        <button
          key={p}
          className={
            'rounded-full px-3 py-1 font-medium ' +
            (phase === p
              ? 'bg-black text-white dark:bg-white dark:text-black'
              : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200')
          }
          onClick={() => flip(p)}
        >
          {p}
        </button>
      ))}
    </div>
  )
}
