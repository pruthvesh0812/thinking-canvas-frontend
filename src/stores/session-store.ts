import { create } from "zustand"
import { canvasEvent, sessionComplete, sessionStart } from "@/lib/api"
import { logger } from "@/lib/logger"
import { supabase } from "@/lib/supabase"
import {
  computeUnresolvedThreads,
  type UnresolvedThread,
} from "@/lib/unresolved-threads"
import type { SessionLearning, SessionPhase } from "@/types"

// Owns the session arc: canvas meta (north star, title), the active session id,
// `current_phase`, the Session Complete modal, and what carries into the next
// session. Deliberately holds NO node/edge data — that is canvas-store's
// concern (STATE-MANAGEMENT.md store table); the graph reads this store makes
// are one-shot queries for screen 2, not canvas state.

export type ModalScreen = "observer" | "threads" | "closed"

export type ThreadChoice = "carry" | "resolve" | "discard"

export type ObservationChoice = "accepted" | "dismissed"

// A thread the previous session handed over. `origin` distinguishes a durable
// carry-forward (a session_learnings row) from a screen-2 "Resolve now" pick,
// which is an intent for the next few minutes and is intentionally not
// persisted — it dies with the tab.
export type CarriedItem = {
  id: string
  type: SessionLearning["type"]
  content: string
  origin: "carried" | "resolve_now"
}

type SessionStore = {
  // ── canvas + session meta ──
  canvasId: string | null
  title: string | null
  originalIntent: string | null
  sessionId: string | null
  phase: SessionPhase
  hydration: "idle" | "loading" | "ready" | "error"
  error: string | null

  // ── carry-forward ──
  carried: CarriedItem[]

  // ── Session Complete modal ──
  modalScreen: ModalScreen | null
  observations: SessionLearning[]
  observerState: "reading" | "ready"
  observationChoices: Record<string, ObservationChoice>
  unresolved: UnresolvedThread[]
  threadChoices: Record<string, ThreadChoice>
  carryForwardError: string | null

  // ── actions ──
  createCanvas(originalIntent: string): Promise<string | null>
  hydrate(canvasId: string): Promise<void>
  setPhase(phase: SessionPhase): Promise<void>
  completeSession(): Promise<void>
  refreshObservations(): Promise<void>
  markObserverReady(): void
  acceptObservation(learning: SessionLearning): Promise<void>
  dismissObservation(learningId: string): void
  goToThreads(): Promise<void>
  setThreadChoice(threadId: string, choice: ThreadChoice): void
  confirmThreads(): Promise<void>
  startNewSession(): Promise<void>
  closeModal(): void
}

const MODAL_RESET = {
  modalScreen: null,
  observations: [],
  observerState: "reading",
  observationChoices: {},
  unresolved: [],
  threadChoices: {},
  carryForwardError: null,
} satisfies Partial<SessionStore>

// `session_learnings.type` is a plain text column; keep the widening contained
// here rather than casting at every read site.
function asLearningType(value: string): SessionLearning["type"] {
  return value === "contradiction" || value === "empty_node" ? value : "question"
}

function asPhase(value: string): SessionPhase {
  return value === "converging" ? "converging" : "diverging"
}

/**
 * What the previous session left behind, minus anything already on the canvas.
 *
 * v1 scope is the single most recent non-active session — SESSION-FLOWS.md's
 * badge is literally "carried from last session", and `session_learnings` has
 * no resolved/consumed column to walk further back safely.
 */
async function loadCarried(
  canvasId: string,
  activeSessionId: string,
): Promise<CarriedItem[]> {
  const { data: priorSessions, error: sessionError } = await supabase
    .from("sessions")
    .select("id")
    .eq("canvas_id", canvasId)
    .neq("id", activeSessionId)
    .order("start_time", { ascending: false })
    .limit(1)

  if (sessionError) {
    logger.warn("[session] prior session lookup failed", {
      canvas_id: canvasId,
      error: sessionError.message,
    })
    return []
  }
  const priorSessionId = priorSessions?.[0]?.id
  if (!priorSessionId) return []

  const { data: learnings, error: learningError } = await supabase
    .from("session_learnings")
    .select("id, content, type")
    .eq("session_id", priorSessionId)
    .order("created_at", { ascending: true })

  if (learningError) {
    logger.warn("[session] carry-forward read failed", {
      session_id: priorSessionId,
      error: learningError.message,
    })
    return []
  }
  if (!learnings?.length) return []

  // An observation accepted on screen 1 was written as a node reusing the
  // learning's id (API-CONTRACT.md → accept flow), so an id match is an exact
  // "already on the canvas" test — no content comparison needed.
  const { data: materialized } = await supabase
    .from("nodes")
    .select("id")
    .in(
      "id",
      learnings.map((learning) => learning.id),
    )
  const onCanvas = new Set((materialized ?? []).map((node) => node.id))

  return learnings
    .filter((learning) => !onCanvas.has(learning.id))
    .map((learning) => ({
      id: learning.id,
      type: asLearningType(learning.type),
      content: learning.content,
      origin: "carried" as const,
    }))
}

export const useSessionStore = create<SessionStore>()((set, get) => ({
  canvasId: null,
  title: null,
  originalIntent: null,
  sessionId: null,
  phase: "diverging",
  hydration: "idle",
  error: null,
  carried: [],
  ...MODAL_RESET,

  /**
   * North star capture — the only place a `canvases` row is ever created.
   *
   * `original_intent` is INSERT-once: RLS's WITH CHECK rejects an UPDATE that
   * changes it, and there is no edit UI anywhere in this codebase by design
   * (CORE-CONCEPTS.md). Returns the new canvas id, or null if the write lost.
   */
  async createCanvas(originalIntent) {
    const intent = originalIntent.trim()
    if (!intent) return null

    const canvasId = crypto.randomUUID()

    // Anonymous-first auth is story 9; until it lands there may be no user and
    // `canvases.user_id` is nullable, so an unauthenticated canvas is allowed
    // through here rather than blocked.
    const { data: auth } = await supabase.auth.getUser()

    const { error } = await supabase.from("canvases").insert({
      id: canvasId,
      user_id: auth?.user?.id ?? null,
      title: intent.length > 60 ? `${intent.slice(0, 60)}…` : intent,
      original_intent: intent,
    })

    if (error) {
      logger.error("[session] canvas create failed", { error: error.message })
      set({ error: "Your canvas could not be created." })
      return null
    }

    try {
      await sessionStart({ canvas_id: canvasId })
    } catch (startError) {
      // The canvas exists and is durable; hydrate() opens a session on mount,
      // so a failed start here is recoverable, not fatal.
      logger.warn("[session] start after create failed", {
        canvas_id: canvasId,
        error: startError,
      })
    }

    logger.info("[session] canvas created", { canvas_id: canvasId })
    return canvasId
  },

  async hydrate(canvasId) {
    set({ canvasId, hydration: "loading", error: null })

    // 1. Canvas meta — the north star renders from here and never changes.
    const { data: canvas, error: canvasError } = await supabase
      .from("canvases")
      .select("title, original_intent")
      .eq("id", canvasId)
      .single()

    if (canvasError || !canvas) {
      logger.error("[session] canvas load failed", {
        canvas_id: canvasId,
        error: canvasError?.message,
      })
      set({ hydration: "error", error: "This canvas could not be loaded." })
      return
    }

    // 2. Resume the active session, or ask the BACKEND to open one — never
    //    insert a `sessions` row here (STATE-MANAGEMENT.md): only
    //    /api/session/start drops the session-boundary marker into the threads.
    const { data: active } = await supabase
      .from("sessions")
      .select("id, current_phase")
      .eq("canvas_id", canvasId)
      .eq("status", "active")
      .order("start_time", { ascending: false })
      .limit(1)

    let sessionId = active?.[0]?.id
    let phase = asPhase(active?.[0]?.current_phase ?? "diverging")

    if (!sessionId) {
      try {
        sessionId = (await sessionStart({ canvas_id: canvasId })).session_id
        phase = "diverging"
      } catch (error) {
        logger.error("[session] start failed", { canvas_id: canvasId, error })
        set({ hydration: "error", error: "Could not start a session." })
        return
      }
    }

    // 3. Carry-forward from the last session, rendered as pre-loaded nodes.
    const carried = await loadCarried(canvasId, sessionId)

    logger.info("[session] hydrated", {
      canvas_id: canvasId,
      session_id: sessionId,
      phase,
      carried: carried.length,
    })
    set({
      title: canvas.title,
      originalIntent: canvas.original_intent,
      sessionId,
      phase,
      carried,
      hydration: "ready",
    })
  },

  async setPhase(phase) {
    const { sessionId, phase: previous } = get()
    if (!sessionId || phase === previous) return

    // Optimistic — the toggle is the user's manual override and must feel
    // instant; Supabase is authoritative, so revert if the write loses.
    set({ phase })
    const { error } = await supabase
      .from("sessions")
      .update({ current_phase: phase })
      .eq("id", sessionId)

    if (error) {
      logger.warn("[session] phase write failed, reverting", {
        session_id: sessionId,
        phase,
        error: error.message,
      })
      set({ phase: previous })
      return
    }
    // No canvas-event: the backend reads `current_phase` when it routes.
    // Switching to converging is what makes the Stress-Tester eligible.
    logger.info("[session] phase changed", { session_id: sessionId, phase })
  },

  async completeSession() {
    const { canvasId, sessionId } = get()
    if (!canvasId || !sessionId) return

    set({ ...MODAL_RESET, modalScreen: "observer" })
    try {
      // carry_forward_ids is [] by contract-shape only: the user picks
      // carry-forwards on screen 2, which happens AFTER this call, and the
      // backend ignores the field today (API-CONTRACT.md Known Gap). The
      // screen-2 choices are written as session_learnings rows in
      // confirmThreads() instead — see SESSION-FLOWS.md's ordering note.
      await sessionComplete({
        session_id: sessionId,
        canvas_id: canvasId,
        carry_forward_ids: [],
      })
      logger.info("[session] complete enqueued", { session_id: sessionId })
    } catch (error) {
      logger.error("[session] complete failed", { session_id: sessionId, error })
      set({ observerState: "ready" })
    }
  },

  async refreshObservations() {
    const { sessionId } = get()
    if (!sessionId) return

    // The Observer runs async after the ack — there is nothing to stream and
    // nothing to await, so screen 1 polls its output table.
    const { data, error } = await supabase
      .from("session_learnings")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })

    if (error) {
      logger.warn("[session] observation poll failed", {
        session_id: sessionId,
        error: error.message,
      })
      return
    }
    if (!data?.length) return

    set({
      observations: data.map((row) => ({
        id: row.id,
        canvas_id: row.canvas_id,
        session_id: row.session_id,
        content: row.content,
        type: asLearningType(row.type),
        created_at: row.created_at,
      })),
      observerState: "ready",
    })
  },

  // Called when the poll window closes: the Observer is Pro-only and may
  // legitimately never write anything, so "no observations" is a normal
  // outcome, not an error state.
  markObserverReady() {
    set({ observerState: "ready" })
  },

  async acceptObservation(learning) {
    const { canvasId, sessionId } = get()
    if (!canvasId || !sessionId) return

    // The same materialization path a ghost accept uses: write the row
    // ourselves reusing the AI-assigned id, THEN notify with ids only so the
    // backend enriches it (write-then-notify, non-negotiable #1). When
    // ghost-interaction lands this should move into use-canvas-persistence and
    // be shared rather than duplicated.
    const { error } = await supabase.from("nodes").insert({
      id: learning.id,
      canvas_id: canvasId,
      session_id: sessionId,
      owner: "ai",
      content: learning.content,
    })

    if (error) {
      logger.warn("[session] observation accept failed", {
        learning_id: learning.id,
        error: error.message,
      })
      return
    }

    set((state) => ({
      observationChoices: { ...state.observationChoices, [learning.id]: "accepted" },
    }))

    try {
      await canvasEvent({
        canvas_id: canvasId,
        session_id: sessionId,
        event_type: "ghost.accepted",
        node_ids: [learning.id],
        agent_role: "observer",
      })
    } catch (notifyError) {
      // The node is durable either way; only the backend enrichment is lost.
      logger.warn("[session] observation notify failed", {
        learning_id: learning.id,
        error: notifyError,
      })
    }
  },

  dismissObservation(learningId) {
    set((state) => ({
      observationChoices: { ...state.observationChoices, [learningId]: "dismissed" },
    }))
  },

  async goToThreads() {
    const { canvasId, sessionId } = get()
    if (!canvasId || !sessionId) return

    set({ modalScreen: "threads" })

    // Adjacency needs the whole canvas graph; computeUnresolvedThreads scopes
    // the items themselves to the session being closed.
    const [{ data: nodes }, { data: edges }] = await Promise.all([
      supabase
        .from("nodes")
        .select("id, session_id, owner, content, direction_marker")
        .eq("canvas_id", canvasId),
      supabase
        .from("edges")
        .select("id, session_id, from_node_id, to_node_id, edge_type")
        .eq("canvas_id", canvasId),
    ])

    const unresolved = computeUnresolvedThreads(nodes ?? [], edges ?? [], sessionId)
    logger.info("[session] unresolved threads computed", {
      session_id: sessionId,
      count: unresolved.length,
    })
    set({
      unresolved,
      threadChoices: Object.fromEntries(
        unresolved.map((thread) => [thread.id, "carry" as ThreadChoice]),
      ),
    })
  },

  setThreadChoice(threadId, choice) {
    set((state) => ({
      threadChoices: { ...state.threadChoices, [threadId]: choice },
    }))
  },

  async confirmThreads() {
    const { canvasId, sessionId, unresolved, threadChoices } = get()
    if (!canvasId || !sessionId) return

    const carryForward = unresolved.filter((t) => threadChoices[t.id] === "carry")
    let carryForwardError: string | null = null

    if (carryForward.length) {
      // Writing session_learnings from the browser is the v1 half of the
      // ordering asymmetry flagged in SESSION-FLOWS.md. It is not in
      // API-CONTRACT.md's frontend-write list, so RLS may refuse it until the
      // backend accepts carry_forward_ids for real — fail loud in the UI
      // rather than silently losing the user's choices.
      const { error } = await supabase.from("session_learnings").insert(
        carryForward.map((thread) => ({
          id: crypto.randomUUID(),
          canvas_id: canvasId,
          session_id: sessionId,
          content: thread.content,
          type: thread.type,
        })),
      )
      if (error) {
        logger.error("[session] carry-forward write failed", {
          session_id: sessionId,
          count: carryForward.length,
          error: error.message,
        })
        carryForwardError = "These threads could not be saved for the next session."
      }
    }

    // "Resolve now" is deliberately in-memory: it says "surface this the moment
    // I'm back on the canvas", not "store it forever".
    const resolveNow: CarriedItem[] = unresolved
      .filter((thread) => threadChoices[thread.id] === "resolve")
      .map((thread) => ({
        id: thread.id,
        type: thread.type,
        content: thread.content,
        origin: "resolve_now" as const,
      }))

    logger.info("[session] threads confirmed", {
      session_id: sessionId,
      carried: carryForward.length,
      resolve_now: resolveNow.length,
    })
    set((state) => ({
      modalScreen: "closed",
      carryForwardError,
      carried: [...state.carried.filter((item) => item.origin === "carried"), ...resolveNow],
    }))
  },

  async startNewSession() {
    const { canvasId } = get()
    if (!canvasId) return

    const resolveNow = get().carried.filter((item) => item.origin === "resolve_now")
    try {
      const { session_id } = await sessionStart({ canvas_id: canvasId })
      const carried = await loadCarried(canvasId, session_id)
      logger.info("[session] new session started", {
        canvas_id: canvasId,
        session_id,
        carried: carried.length,
      })
      set({
        ...MODAL_RESET,
        sessionId: session_id,
        phase: "diverging",
        carried: [...carried, ...resolveNow],
      })
    } catch (error) {
      logger.error("[session] new session failed", { canvas_id: canvasId, error })
      set({ error: "Could not start a new session." })
    }
  },

  closeModal() {
    set({ ...MODAL_RESET })
  },
}))
