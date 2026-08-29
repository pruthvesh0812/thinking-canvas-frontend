"use client"

import { useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { sessionComplete, sessionStart } from "@/lib/api"
import { logger } from "@/lib/logger"
import { MOCK_OBSERVER_SUGGESTIONS } from "@/lib/mock-session-complete"
import { fetchSessionHistory } from "@/lib/session-history"
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
        // Only reachable from a live session (ObserverSuggestions renders
        // inside the modal Canvas.tsx only mounts once one exists), so this
        // is always real — the fallback is defensive, not expected to fire.
        sessionNumber: useSessionStore.getState().sessionNumber ?? 1,
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
  // carries the selected items forward"). Persists the chosen carry-forwards
  // to session_learnings (the documented ordering-asymmetry workaround,
  // since carry_forward_ids is validated but ignored by the session/complete
  // pipeline — API-CONTRACT Known Gap #3), THEN hands off to SessionLanding
  // instead of opening the next session itself — that's a separate,
  // deliberate click on SessionLanding's "Continue" (continueToNewSession
  // below), same principle as reopening a canvas with closed history.
  //
  // Mock mode keeps its original, un-deferred behavior — no real backend to
  // round-trip a SessionLanding redirect through, so it swaps straight into
  // a new local session exactly as this action always did.
  const startNewSession = useCallback(async () => {
    const { canvasId, sessionId, sessionNumber } = useSessionStore.getState()
    const { unresolvedThreads, choices, setStarting, reset } = useSessionCompleteStore.getState()
    const carried = unresolvedThreads.filter((t) => choices[t.id] === "carry")

    setStarting(true)

    if (USE_MOCK_PERSISTENCE) {
      // A generous y-gap below the observer-suggestion drop zone (y:480) —
      // both areas hold variable-height cards, so this is a best-effort
      // separation, not a collision guarantee; either is freely draggable.
      const carriedNodes: CanvasNode[] = carried.map((t, i) => ({
        id: crypto.randomUUID(),
        position: { x: 140 + i * 300, y: 820 },
        width: 240,
        data: {
          content: t.content,
          owner: "human",
          sessionNumber: (sessionNumber ?? 0) + 1,
          seedSource: "carried_forward",
        },
      }))
      useCanvasStore.getState().addSeededNodes(carriedNodes)
      useSessionStore.getState().activateSession(crypto.randomUUID(), (sessionNumber ?? 0) + 1)
      logger.info("[session] new session started (mock)", { carried: carriedNodes.length })
      reset()
      return
    }

    if (canvasId && sessionId && carried.length > 0) {
      const { error } = await supabase
        .from("session_learnings")
        .insert(carried.map((t) => ({ canvas_id: canvasId, session_id: sessionId, content: t.content, type: t.kind })))
      if (error) logger.warn("[session] failed to persist carry-forward learnings", { sessionId, error })
    }

    const pastSessions = canvasId ? (await fetchSessionHistory(canvasId))?.pastSessions ?? [] : []
    useSessionStore.getState().returnToSessionLanding(pastSessions)
    logger.info("[session] session closed — handed off to session landing", { canvasId })
    reset()
  }, [])

  // SessionLanding's "Continue thinking" — and, before entering a chosen
  // past session's read-only view, "view a past session" too, since a live
  // session always sits underneath history mode (CanvasShell calls this,
  // then viewSession). The one place POST /api/session/start actually gets
  // called for a deferred (showSessionLanding) canvas — see session-store's
  // showSessionLanding doc. Re-reads session_learnings from Supabase rather
  // than trusting any in-memory carry-forward choices, since this also has
  // to work for a cold reopen days later with no such state in memory
  // (same reasoning use-canvas-hydration.ts used to apply here directly).
  const continueToNewSession = useCallback(async () => {
    const canvasId = useSessionStore.getState().canvasId
    if (!canvasId) {
      logger.error("[session] continueToNewSession called with no canvas in context")
      return
    }

    let newSessionId: string
    let newSessionNumber: number
    try {
      const res = await sessionStart({ canvas_id: canvasId })
      newSessionId = res.session_id
      newSessionNumber = res.session_number
    } catch (err) {
      logger.error("[session] session/start failed", { canvasId, error: err })
      return
    }

    const { data: learningRows, error: learningsError } = await supabase
      .from("session_learnings")
      .select("id, content, type")
      .eq("canvas_id", canvasId)
    if (learningsError) {
      logger.warn("[session] failed to load carried-forward learnings", { canvasId, error: learningsError })
    } else if (learningRows && learningRows.length > 0) {
      const carriedNodes: CanvasNode[] = learningRows.map((row, i) => ({
        id: crypto.randomUUID(),
        position: { x: 140 + i * 300, y: 820 },
        width: 240,
        data: {
          content: row.content,
          owner: "human" as const,
          sessionNumber: newSessionNumber,
          seedSource: "carried_forward" as const,
        },
      }))
      useCanvasStore.getState().addSeededNodes(carriedNodes)
    }

    useSessionStore.getState().activateSession(newSessionId, newSessionNumber)
    logger.info("[session] new session started", { newSessionId, newSessionNumber })
    useSessionCompleteStore.getState().reset()
  }, [])

  return {
    persistPhase,
    beginSessionComplete,
    acceptObserverSuggestion,
    skipAllSuggestions,
    startNewSession,
    continueToNewSession,
  }
}
