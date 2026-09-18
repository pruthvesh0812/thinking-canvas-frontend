import { useCallback, useEffect, useRef, useState } from "react"
import { useGhostStore } from "@/stores/ghost-store"
import { MOCK_INTERVENTION, MOCK_INTERVENTION_TEXT } from "@/lib/mock-intervention-scenario"
import { logger } from "@/lib/logger"

export type InterventionPhase = "idle" | "shimmer" | "waiting" | "generating"

const WAITING_SECONDS = 10
const SHIMMER_MS = 1450
const GENERATING_MS = 2300
// Matches the backend's own spawn→chunk sleep (`step.sleep('ghost-animation',
// '1500ms')`, GHOST-STREAMING.md) — the entrance-animation budget before
// text starts arriving, kept identical here so the demo choreography still
// reads true to the real protocol.
const DRAW_MS = 1500
const WORD_STEP_MS = 60
const GAP_BETWEEN_GHOSTS_MS = 450

// Stands in for the real trigger (a debounced node-create pause, or an
// immediate question-edge draw) for manual QA of the visual sequence
// without a live backend. Drives ghost-store through the SAME actions the
// real use-ghost-stream.ts hook does — spawn, then appendChunk word-by-word,
// then markDone — so it is a second path feeding the store, not the only
// one, and the two can run side by side.
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

  // Streams one ghost id's text word-by-word via appendChunk — the exact
  // store action a real `chunk` message drives, just paced locally instead
  // of arriving over SSE.
  const streamGhost = useCallback(
    (ghostId: string, text: string, onDone: () => void) => {
      const words = text.split(" ")
      let i = 0
      const step = () => {
        useGhostStore.getState().appendChunk(ghostId, (i === 0 ? "" : " ") + words[i])
        i++
        if (i < words.length) {
          after(WORD_STEP_MS, step)
        } else {
          onDone()
        }
      }
      step()
    },
    [after],
  )

  const generate = useCallback(() => {
    setPhase("generating")
    after(GENERATING_MS, () => {
      const { trigger_node_id, context_node, question_node } = MOCK_INTERVENTION
      useGhostStore.getState().spawn(MOCK_INTERVENTION)
      logger.info("[intervention-demo] spawned", { triggerNodeId: trigger_node_id })
      after(DRAW_MS, () => {
        streamGhost(context_node.ghost_id, MOCK_INTERVENTION_TEXT.context, () => {
          after(GAP_BETWEEN_GHOSTS_MS, () => {
            streamGhost(question_node!.ghost_id, MOCK_INTERVENTION_TEXT.question, () => {
              // Real `done` carries thread_id/turn_index from Supabase —
              // the demo has no thread, so these are inert placeholders,
              // just enough to satisfy markDone's attribution shape.
              useGhostStore.getState().markDone({
                type: "done",
                thread_id: "mock-thread",
                turn_index: 0,
                trigger_node_id,
                context_ghost_id: context_node.ghost_id,
                question_ghost_id: question_node!.ghost_id,
              })
            })
          })
        })
      })
      setPhase("idle")
    })
  }, [after, streamGhost])

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

  return {
    phase,
    remaining,
    paused,
    trigger,
    reset,
    togglePause,
    processNow,
  }
}
