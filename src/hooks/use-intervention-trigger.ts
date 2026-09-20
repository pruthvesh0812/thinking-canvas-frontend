import { useEffect, useRef } from "react"
import { useCanvasStore } from "@/stores/canvas-store"
import { useSessionStore } from "@/stores/session-store"
import { useGhostStore } from "@/stores/ghost-store"
import { useInterventionStore } from "@/stores/intervention-store"
import { interventionTrigger } from "@/lib/api"
import { logger } from "@/lib/logger"

// How long a just-committed node must sit untouched before it's worth asking
// the backend judge about — this codebase has no raw cursor/pointer telemetry
// yet, so a real Supabase-synced content commit (use-canvas-persistence.ts's
// writeNodeContent) settling for this long is the cheapest available stand-in
// for "cursor/dwell" from the intervention spec. This is an action-class GATE
// only — it decides WHEN to ask, never WHETHER the backend should intervene.
// Maturity is deliberately excluded here; that judgment is the backend's
// alone (api.ts's interventionTrigger).
const DWELL_MS = 2_500

// The frontend's own trigger ruleset. If this hook never calls
// POST /intervention/trigger, the backend judge never runs and the proactive
// agents (Expander, Stress-Tester, ...) stay silent — by design (the product
// point the intervention spec calls out explicitly).
//
// `enabled` gates the whole hook off in read-only/history view, same as
// every other live-canvas-only effect (Canvas.tsx's `!isHistory` checks).
export function useInterventionTrigger(enabled: boolean) {
  const dwellTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dwellNodeId = useRef<string | null>(null)
  // Baseline content per node — lets a genuine edit be told apart from every
  // OTHER reason the store's `nodes` array reference changes (drag position,
  // resize, a different node's own edit). Seeded from the current snapshot
  // on mount so hydration itself is never mistaken for an edit.
  const lastContentByNode = useRef<Map<string, string>>(new Map())
  // Nodes already asked about — a settled commit gets at most one trigger
  // call; a later genuine edit clears this so it can be asked about again.
  const triggeredNodeIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!enabled) return

    for (const node of useCanvasStore.getState().nodes) {
      if (node.data.synced) lastContentByNode.current.set(node.id, node.data.content)
    }

    function clearDwell() {
      if (dwellTimer.current) {
        clearTimeout(dwellTimer.current)
        dwellTimer.current = null
      }
      dwellNodeId.current = null
    }

    function fire(nodeId: string) {
      const { canvasId, sessionId } = useSessionStore.getState()
      if (!canvasId || !sessionId) return
      // One pending ask per node — never pile a trigger onto a node that
      // already has a pending ghost pair or a pending intervention offer
      // (GHOST-STREAMING.md's "one pair per node" rule, extended to offers).
      if (triggeredNodeIds.current.has(nodeId)) return
      if (useGhostStore.getState().pairs[nodeId]) return
      if (useInterventionStore.getState().offers[nodeId]) return

      triggeredNodeIds.current.add(nodeId)
      logger.info("[intervention-trigger] dwell settled — firing trigger", { nodeId })
      void interventionTrigger({ canvas_id: canvasId, session_id: sessionId, node_id: nodeId }).catch(() => {
        // Fire-and-forget, same swallow-after-logging rule as canvasEvent —
        // api.ts's post() already logged the failure. Un-mark it so a later
        // edit (or just leaving the node alone again) can retry.
        triggeredNodeIds.current.delete(nodeId)
      })
    }

    // Whole-state subscribe, not a selector — canvas-store has no
    // subscribeWithSelector middleware. Runs on every store update
    // (including drag/resize, which change `nodes`' reference too), but the
    // per-node content comparison below is a cheap map lookup and `continue`s
    // immediately for anything that isn't a real content change, so this
    // stays negligible at the node counts a canvas actually has.
    const unsubscribe = useCanvasStore.subscribe((state, prevState) => {
      if (state.nodes === prevState.nodes) return
      for (const node of state.nodes) {
        if (node.data.owner !== "human" || !node.data.synced) continue
        const prevContent = lastContentByNode.current.get(node.id)
        if (prevContent === node.data.content) continue
        lastContentByNode.current.set(node.id, node.data.content)

        // A genuine edit — restart the dwell window for THIS node. A timer
        // already running for a different node is abandoned: the human
        // moved on before it settled, so that one never gets asked about.
        triggeredNodeIds.current.delete(node.id)
        clearDwell()
        dwellNodeId.current = node.id
        dwellTimer.current = setTimeout(() => {
          if (dwellNodeId.current === node.id) fire(node.id)
        }, DWELL_MS)
      }
    })

    return () => {
      unsubscribe()
      clearDwell()
    }
  }, [enabled])
}
