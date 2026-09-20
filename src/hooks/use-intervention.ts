import { useEffect, useRef, useState } from "react"
import { useInterventionStore } from "@/stores/intervention-store"
import { useGhostStore } from "@/stores/ghost-store"
import { useSessionStore } from "@/stores/session-store"
import { interventionProcess, interventionDismiss } from "@/lib/api"
import { logger } from "@/lib/logger"

export type InterventionPhase = "idle" | "waiting" | "generating"

const TICK_MS = 100

interface ProcessingOffer {
  offerId: string
  triggerNodeId: string
}

// Real presentation-gate wiring — replaces use-intervention-demo.ts's
// setTimeout choreography with the actual backend-driven timeline: `waiting`
// (intervention-store, real timer_ms) → the human lets it lapse, pulls it
// forward, or waves it off → POST /intervention/process|dismiss → the ghost
// stream's own spawn…chunk…offer…done sequence (ghost-store, unchanged)
// takes over once it actually starts arriving. DebounceIndicator is the same
// UI component the demo drives; only the state machine underneath changes.
// The demo hook stays available for manual QA alongside this one
// (ghost-streaming story precedent).
export function useIntervention() {
  // At most one offer is actionable through this UI at a time — the
  // backend's own pending-ghost guard keeps concurrent offers from piling up
  // in practice. If more than one somehow lands, the most recently created
  // one wins (defensive, not a real product path).
  const offerState = useInterventionStore((s) => {
    const all = Object.values(s.offers)
    if (all.length === 0) return undefined
    return all.reduce((a, b) => (b.offer.created_at > a.offer.created_at ? b : a))
  })

  const [remaining, setRemaining] = useState(0)
  const [paused, setPaused] = useState(false)
  // Set the instant /process is sent. There's no SSE message that confirms
  // "now generating" right away — per the spec, `offer` (the only
  // state-carrying message left in the protocol) arrives right before
  // `done`, near the END of the ghost stream, not at the start. So this is
  // locally optimistic ("we told the backend to go"), cleared once a real
  // outcome — a materializing ghost pair, or a `withdraw` — actually arrives.
  const [processing, setProcessing] = useState<ProcessingOffer | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pausedRef = useRef(paused)
  // Offer ids already sent to /process — guards a lapsing timer from racing
  // a manual processNow (or a dismiss) into sending it twice for one offer.
  const processedOfferIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  function sendProcess(offerId: string, triggerNodeId: string, reason: "lapse" | "manual") {
    if (processedOfferIds.current.has(offerId)) return
    processedOfferIds.current.add(offerId)
    if (tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
    setProcessing({ offerId, triggerNodeId })

    const { canvasId, sessionId } = useSessionStore.getState()
    if (!canvasId || !sessionId) {
      logger.error("[intervention] no canvas/session in context — skipping /process", { offerId })
      return
    }
    logger.info("[intervention] processing offer", { offerId, reason })
    // Fire-and-forget, same swallow-after-logging rule as canvasEvent —
    // api.ts's post() already logged a failure. Nothing to roll back: the
    // presentation gate has already closed on this side either way.
    void interventionProcess({ offer_id: offerId, session_id: sessionId, canvas_id: canvasId, reason }).catch(() => {})
  }

  // Starts/restarts the REAL countdown whenever a genuinely new waiting
  // offer appears — timer_ms is backend-tuned (receptivity-adjusted), never
  // hard-coded here.
  useEffect(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
    if (!offerState || offerState.phase !== "waiting" || offerState.timerMs === null) return
    if (processedOfferIds.current.has(offerState.offer.id)) return

    setPaused(false)
    setRemaining(offerState.timerMs / 1000)
    tickRef.current = setInterval(() => {
      if (pausedRef.current) return
      setRemaining((r) => {
        const next = r - TICK_MS / 1000
        if (next <= 0) {
          sendProcess(offerState.offer.id, offerState.offer.trigger_node_id, "lapse")
          return 0
        }
        return next
      })
    }, TICK_MS)

    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerState?.offer.id, offerState?.phase, offerState?.timerMs])

  // Clears the local "generating" placeholder once a real outcome lands: the
  // ghost pair this offer led to finished streaming (the acceptance-gate UI
  // takes over from here), or the offer itself was withdrawn (aborted on
  // re-judge, or expired) — whichever happens first. Both selectors are
  // called unconditionally (rules of hooks) with the conditional folded into
  // the selector body instead. Clearing happens directly in the render body
  // (React's "adjust state during render" pattern), not inside a useEffect —
  // the guard itself (`processing &&`) stops it from repeating once cleared,
  // so there's no cascading-render risk to route through an effect for.
  const pairStreamed = useGhostStore((s) => !!processing && !!s.pairs[processing.triggerNodeId]?.streamed)
  const offerStillPending = useInterventionStore((s) => (processing ? !!s.offers[processing.triggerNodeId] : true))
  if (processing && (pairStreamed || !offerStillPending)) {
    setProcessing(null)
  }

  function togglePause() {
    setPaused((p) => !p)
  }

  function processNow() {
    if (!offerState) return
    sendProcess(offerState.offer.id, offerState.offer.trigger_node_id, "manual")
  }

  // The user waves the offer off before its timer resolves — a receptivity
  // signal only, never routed through Rejection Insights (that's the
  // acceptance gate's job on a materialized ghost, unchanged).
  function dismiss() {
    if (!offerState) return
    const offerId = offerState.offer.id
    processedOfferIds.current.add(offerId)
    if (tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
    logger.info("[intervention] dismissed", { offerId })
    void interventionDismiss({ offer_id: offerId }).catch(() => {})
    useInterventionStore.getState().withdraw(offerId)
  }

  const phase: InterventionPhase = processing ? "generating" : offerState?.phase === "waiting" ? "waiting" : "idle"

  return { phase, remaining, paused, togglePause, processNow, dismiss }
}
