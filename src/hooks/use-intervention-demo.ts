import { useCallback, useEffect, useRef, useState } from "react"
import { useGhostStore } from "@/stores/ghost-store"
import { MOCK_INTERVENTION } from "@/lib/mock-intervention-scenario"
import { logger } from "@/lib/logger"

export type InterventionPhase = "idle" | "shimmer" | "waiting" | "generating"

const WAITING_SECONDS = 10
const SHIMMER_MS = 1450
const GENERATING_MS = 2300
const DRAW_MS = 1500
const WORD_STEP_MS = 60
const GAP_BETWEEN_GHOSTS_MS = 450

// Stands in for the real trigger (a debounced node-create pause, or an
// immediate question-edge draw) that will fire the SSE stream once
// ghost-streaming lands (GHOST-STREAMING.md). The phase machine and timings
// below (shimmer → waiting → generating) reproduce
// ThinkingCanvas.dc.html's demo choreography exactly so the felt experience
// can be reviewed before any backend wiring exists.
export function useInterventionDemo() {
  const [phase, setPhase] = useState<InterventionPhase>("idle")
  const [remaining, setRemaining] = useState(WAITING_SECONDS)
  const [paused, setPaused] = useState(false)

  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const interval = useRef<ReturnType<typeof setInterval> | null>(null)
  const pausedRef = useRef(paused)
  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  const after = useCallback((ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms))
  }, [])

  const clearAll = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    if (interval.current) {
      clearInterval(interval.current)
      interval.current = null
    }
  }, [])

  useEffect(() => clearAll, [clearAll])

  const generate = useCallback(() => {
    setPhase("generating")
    after(GENERATING_MS, () => {
      // The contribution now exists but stays unrendered until the human
      // hovers the halo (glow-first delivery) — ghost-store tracks that via
      // `revealed`, not this phase machine.
      useGhostStore.getState().spawn(MOCK_INTERVENTION)
      setPhase("idle")
    })
  }, [after])

  const startWaiting = useCallback(() => {
    setPhase("waiting")
    setRemaining(WAITING_SECONDS)
    setPaused(false)
    interval.current = setInterval(() => {
      if (pausedRef.current) return
      setRemaining((r) => {
        const next = r - 0.1
        if (next <= 0) {
          if (interval.current) clearInterval(interval.current)
          interval.current = null
          generate()
          return 0
        }
        return next
      })
    }, 100)
  }, [generate])

  const trigger = useCallback(() => {
    clearAll()
    useGhostStore.getState().reset()
    setPhase("shimmer")
    after(SHIMMER_MS, startWaiting)
  }, [after, clearAll, startWaiting])

  const reset = useCallback(() => {
    clearAll()
    useGhostStore.getState().reset()
    setPhase("idle")
    setRemaining(WAITING_SECONDS)
    setPaused(false)
  }, [clearAll])

  const togglePause = useCallback(() => setPaused((p) => !p), [])

  const processNow = useCallback(() => {
    if (interval.current) {
      clearInterval(interval.current)
      interval.current = null
    }
    generate()
  }, [generate])

  // Streams one ghost node's text word-by-word (drawing → streaming →
  // pending), matching the 1.5s spawn-animation window from
  // GHOST-STREAMING.md before content starts arriving.
  const streamSlot = useCallback(
    (triggerNodeId: string, slot: "context" | "question", onDone?: () => void) => {
      const store = useGhostStore.getState()
      const pair = store.pairs[triggerNodeId]
      const node = pair?.[slot]
      if (!node) return
      store.setStatus(triggerNodeId, slot, "drawing")
      after(DRAW_MS, () => {
        store.setStatus(triggerNodeId, slot, "streaming")
        const words = node.text.split(" ")
        let i = 0
        const step = () => {
          i++
          store.setDisplayedText(triggerNodeId, slot, words.slice(0, i).join(" "))
          if (i < words.length) {
            after(WORD_STEP_MS, step)
          } else {
            store.setStatus(triggerNodeId, slot, "pending")
            onDone?.()
          }
        }
        step()
      })
    },
    [after],
  )

  // Called when the human hovers the halo — unfolds the ghost pair with the
  // standard spawn→stream choreography: grounding context first, its
  // question downstream (CORE-CONCEPTS.md — "ground before nudge").
  const revealPair = useCallback(
    (triggerNodeId: string) => {
      const pair = useGhostStore.getState().pairs[triggerNodeId]
      if (!pair || pair.revealed) return
      useGhostStore.getState().reveal(triggerNodeId)
      logger.info("[intervention-demo] halo revealed", { triggerNodeId })
      streamSlot(triggerNodeId, "context", () => {
        if (pair.question) {
          after(GAP_BETWEEN_GHOSTS_MS, () => streamSlot(triggerNodeId, "question"))
        }
      })
    },
    [after, streamSlot],
  )

  return {
    phase,
    remaining,
    paused,
    trigger,
    reset,
    togglePause,
    processNow,
    revealPair,
  }
}
