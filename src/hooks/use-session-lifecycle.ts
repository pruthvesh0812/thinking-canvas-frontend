"use client"

import { useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { sessionComplete, sessionStart } from "@/lib/api"
import { logger } from "@/lib/logger"
import { MOCK_OBSERVER_SUGGESTIONS } from "@/lib/mock-session-complete"
import { useCanvasStore, type CanvasNode } from "@/stores/canvas-store"
import { useSessionStore } from "@/stores/session-store"
import { useSessionCompleteStore, type UnresolvedThread } from "@/stores/session-complete-store"
import type { SessionLearning, SessionPhase } from "@/types"

const USE_MOCK_PERSISTENCE = process.env.NEXT_PUBLIC_USE_MOCK_PERSISTENCE === "true"

// The Observer pass has no completion signal on the wire — POST
// /api/session/complete only acks the enqueue (API-CONTRACT.md) — so this is
// a patience budget for polling session_learnings, not a real "done" check.
const POLL_INTERVAL_MS = 2000
const POLL_ATTEMPTS = 5

// Frontend-computed per SESSION-FLOWS.md screen 2: question edges with no
// follow-up at their target, and human nodes left empty. "Accepted
// contradiction nodes with no follow-up" is out of reach today — a
// materialized ghost doesn't retain its ContextNodeType on the resulting
// canvas node (ghost-interaction's materializeGhost is still a stub) — a
// flagged gap, not worked around with a guess.
function computeUnresolvedThreads(): UnresolvedThread[] {
  const { nodes, edges } = useCanvasStore.getState()
  const hasOutgoing = (nodeId: string) => edges.some((e) => e.source === nodeId)
  const threads: UnresolvedThread[] = []

  for (const edge of edges) {
    if (edge.edgeType !== "question" || hasOutgoing(edge.target)) continue
    const target = nodes.find((n) => n.id === edge.target)
    if (!target) continue
    threads.push({
      id: `q-${edge.id}`,
      kind: "question",
      content: target.data.content || "An unanswered question",
      nodeId: target.id,
    })
  }

  for (const node of nodes) {
    if (node.data.owner === "human" && !node.data.content.trim()) {
      threads.push({
        id: `e-${node.id}`,
        kind: "empty_node",
        content: "Empty node — nothing written yet",
        nodeId: node.id,
      })
    }
  }

  return threads
}

export function useSessionLifecycle() {
  // Diverging/converging is user control, always (CORE-CONCEPTS.md) —
  // optimistic locally via session-store.setPhase, then written straight to
  // Supabase here. Component call sites do both (see PhaseToggle.tsx).
  const persistPhase = useCallback((phase: SessionPhase) => {
    if (USE_MOCK_PERSISTENCE) {
      logger.debug("[session] phase changed (mock — no Supabase write)", { phase })
      return
    }
    const sessionId = useSessionStore.getState().sessionId
    if (!sessionId) {
      logger.error("[session] no active session — skipping phase write", { phase })
      return
    }
    void supabase
      .from("sessions")
      .update({ current_phase: phase })
      .eq("id", sessionId)
      .then(({ error }) => {
        if (error) logger.warn("[session] phase write failed", { phase, error })
        else logger.info("[session] phase persisted", { phase })
      })
  }, [])

  // "I'm done" — fires session/complete (async, ack-only) and opens the
  // modal on screen 1, then polls session_learnings for what the Observer
  // queues. Mock mode has no backend to run that pass, so it plays a canned
  // set instead of polling anything real.
  const beginSessionComplete = useCallback(async () => {
    const complete = useSessionCompleteStore.getState()
    complete.openModal()
    complete.setUnresolvedThreads(computeUnresolvedThreads())

    const { canvasId, sessionId } = useSessionStore.getState()

    if (USE_MOCK_PERSISTENCE || !canvasId || !sessionId) {
      await new Promise((r) => setTimeout(r, 1100))
      useSessionCompleteStore.getState().setObserverSuggestions(MOCK_OBSERVER_SUGGESTIONS)
      return
    }

    try {
      await sessionComplete({ session_id: sessionId, canvas_id: canvasId, carry_forward_ids: [] })
    } catch (err) {
      logger.error("[session] session/complete failed", { sessionId, error: err })
      // Still worth showing screen 1's empty state — "I'm done" shouldn't
      // dead-end the modal on a network blip.
      useSessionCompleteStore.getState().setObserverSuggestions([])
      return
    }

    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
      const { data, error } = await supabase
        .from("session_learnings")
        .select("id, canvas_id, session_id, content, type, created_at")
        .eq("session_id", sessionId)
      if (error) {
        logger.warn("[session] session_learnings poll failed", { sessionId, error })
        continue
      }
      if (data && data.length > 0) {
        useSessionCompleteStore.getState().setObserverSuggestions(data as SessionLearning[])
        return
      }
    }
    logger.info("[session] no observer learnings after polling — Observer offered nothing", { sessionId })
    useSessionCompleteStore.getState().setObserverSuggestions([])
  }, [])

  // "Accept to canvas" — the full anchor/DAG Observer-structure UI (per-edge
  // accept, anchors on existing nodes) is a later story (observer-structure-ui,
  // API-CONTRACT Known Gap #4 — no POST /api/observer-edge-status route
  // exists yet). v1 turns an accepted observation straight into a plain
  // editable node the human owns from the moment they accept it, so it
  // persists through the ordinary human-node write path with no invented
  // backend contract.
  const acceptObserverSuggestion = useCallback((item: SessionLearning) => {
    const alreadyAccepted = useSessionCompleteStore.getState().acceptedSuggestionIds.size
    const node: CanvasNode = {
      id: crypto.randomUUID(),
      position: { x: 140 + alreadyAccepted * 300, y: 480 },
      width: 260,
      data: {
        content: item.content,
        owner: "human",
        sessionNumber: useSessionStore.getState().sessionNumber,
        seedSource: "observer_suggestion",
      },
    }
    useCanvasStore.getState().addSeededNodes([node])
    useSessionCompleteStore.getState().markSuggestionAccepted(item.id)
  }, [])

  const skipAllSuggestions = useCallback(() => {
    const { observerSuggestions, acceptedSuggestionIds, markSuggestionDismissed, goToThreads } =
      useSessionCompleteStore.getState()
    for (const s of observerSuggestions ?? []) {
      if (!acceptedSuggestionIds.has(s.id)) markSuggestionDismissed(s.id)
    }
    goToThreads()
  }, [])

  // Screen 3's deliberate click (SESSION-FLOWS.md — "[Start New Session]
  // carries the selected items forward"). Writes the chosen carry-forwards
  // to session_learnings — the documented ordering-asymmetry workaround,
  // since carry_forward_ids is validated but ignored by the session/complete
  // pipeline (API-CONTRACT Known Gap #3) — opens a new session, and
  // pre-loads the carried items as editable badge-marked nodes.
  const startNewSession = useCallback(async () => {
    const { canvasId, sessionId, sessionNumber } = useSessionStore.getState()
    const { unresolvedThreads, choices, setStarting } = useSessionCompleteStore.getState()
    const carried = unresolvedThreads.filter((t) => choices[t.id] === "carry")

    setStarting(true)

    if (!USE_MOCK_PERSISTENCE && canvasId && sessionId && carried.length > 0) {
      const { error } = await supabase
        .from("session_learnings")
        .insert(carried.map((t) => ({ canvas_id: canvasId, session_id: sessionId, content: t.content, type: t.kind })))
      if (error) logger.warn("[session] failed to persist carry-forward learnings", { sessionId, error })
    }

    let newSessionId = crypto.randomUUID()
    if (!USE_MOCK_PERSISTENCE && canvasId) {
      try {
        const res = await sessionStart({ canvas_id: canvasId })
        newSessionId = res.session_id
      } catch (err) {
        logger.error("[session] session/start failed for new session", { canvasId, error: err })
      }
    }

    // A generous y-gap below the observer-suggestion drop zone (y:480) —
    // both areas hold variable-height cards, so this is a best-effort
    // separation, not a collision guarantee; either is freely draggable.
    const carriedNodes: CanvasNode[] = carried.map((t, i) => ({
      id: crypto.randomUUID(),
      position: { x: 140 + i * 300, y: 820 },
      width: 240,
      data: { content: t.content, owner: "human", sessionNumber: sessionNumber + 1, seedSource: "carried_forward" },
    }))

    useCanvasStore.getState().addSeededNodes(carriedNodes)
    useSessionStore.getState().advanceSession(newSessionId)
    logger.info("[session] new session started", { newSessionId, carried: carriedNodes.length })
    useSessionCompleteStore.getState().reset()
  }, [])

  return {
    persistPhase,
    beginSessionComplete,
    acceptObserverSuggestion,
    skipAllSuggestions,
    startNewSession,
  }
}
