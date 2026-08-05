import { useEffect } from "react"
import { useSessionStore } from "@/stores/session-store"

// Mount-time orchestration for the session arc. The work lives in
// session-store actions; these hooks only own the React lifecycle — one
// hydration per canvas, one polling loop with a real cleanup.

export function useSessionLifecycle(canvasId: string) {
  const hydrate = useSessionStore((s) => s.hydrate)

  useEffect(() => {
    void hydrate(canvasId)
  }, [canvasId, hydrate])

  return useSessionStore((s) => s.hydration)
}

const POLL_INTERVAL_MS = 2000
const POLL_ATTEMPTS = 15 // ~30s, then screen 1 stops waiting and says so

/**
 * POST /api/session/complete is an ack — the Observer writes its observations
 * to `session_learnings` some seconds later and nothing is pushed to us
 * (API-CONTRACT.md). Screen 1 polls that table until rows land or we give up.
 */
export function useObserverPolling(active: boolean) {
  const refreshObservations = useSessionStore((s) => s.refreshObservations)
  const markObserverReady = useSessionStore((s) => s.markObserverReady)
  const observerState = useSessionStore((s) => s.observerState)

  useEffect(() => {
    if (!active || observerState === "ready") return

    let attempts = 0
    const timer = setInterval(() => {
      attempts += 1
      if (attempts > POLL_ATTEMPTS) {
        clearInterval(timer)
        markObserverReady()
        return
      }
      void refreshObservations()
    }, POLL_INTERVAL_MS)

    return () => clearInterval(timer)
  }, [active, observerState, refreshObservations, markObserverReady])
}
