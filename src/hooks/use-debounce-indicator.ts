'use client'

import { useEffect } from 'react'
import { useGhostStore } from '@/stores/ghost-store'
import { useSessionStore } from '@/stores/session-store'

// Clears the debounce indicator whenever a ghost pair appears — the moment
// the AI actually spawns, the "AI is reading" hint has served its purpose.
// The window is set in the persistence hook when a node/edge is written.
export function useDebounceIndicator() {
  const pairs = useGhostStore((s) => s.pairs)
  useEffect(() => {
    if (Object.keys(pairs).length > 0) {
      useSessionStore.getState().clearDebounce()
    }
  }, [pairs])
}
