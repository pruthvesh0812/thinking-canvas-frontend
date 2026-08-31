import { create } from "zustand"
import type { SessionPhase } from "@/types"

/** How the session insights surface is presented. The same content renders
 * docked beside the historical canvas ('sidebar') or expanded over it
 * ('full') — one surface, two densities, animated between. */
export type InsightsMode = "sidebar" | "full"

/** One row for SessionLanding's list and HistoryBar's "viewing Session N"
 * label — computed by use-canvas-hydration.ts / session-history.ts from
 * real `sessions` rows, never mock-sessions.ts, for a real canvas. `number`
 * uses the same 1-indexed-by-start_time derivation POST /api/session/start
 * uses server-side (see API-CONTRACT.md), so it never disagrees with the
 * live session's own number. Closed sessions only — the live/active one has
 * its own session-store fields, it's never also a row here. */
export interface PastSessionSummary {
  id: string
  number: number
  /** Pre-formatted for display (e.g. "Jun 28, 2026") — the fetcher's job,
   * not the component's, same as every other derived label in this store. */
  date: string
  /** null on the rare closed-but-no-end_time row (shouldn't happen, but
   * `end_time` is nullable in the schema) — render as "unknown length". */
  durationMin: number | null
  nodeCount: number
}

interface SessionStore {
  /** The real Supabase ids of the canvas currently open and its active
   * session. canvasId is null until a real canvas is hydrated
   * (use-canvas-hydration.ts). sessionId/sessionNumber are ALSO null
   * whenever showSessionLanding is true — a live session is only ever
   * established by SessionLanding's "Continue" (use-session-lifecycle.ts's
   * continueToNewSession), never eagerly. The persistence hook reads
   * sessionId to hang node/edge writes off it (falls back to dev env vars);
   * null there correctly means "nothing to write against yet" — Canvas.tsx
   * isn't even rendered while it's null, so nothing tries. */
  canvasId: string | null
  sessionId: string | null
  originalIntent: string
  canvasTitle: string
  sessionNumber: number | null
  phase: SessionPhase
  /** null = the live session. A number puts the canvas into read-only
   * time-travel for that past session (design brief §Session History). */
  viewedSession: number | null
  /** This canvas's closed session history. Set on hydration (real canvas,
   * possibly empty) or startNewCanvas (empty, mock/fresh), and refreshed by
   * returnToSessionLanding once a session closes. SessionLanding's list and
   * HistoryBar's real-mode label both read this. */
  pastSessions: PastSessionSummary[]
  /** True whenever there's history to decide about but no live session
   * established yet — CanvasShell renders SessionLanding instead of
   * <Canvas /> while this holds. Set by loadCanvas (reopening a canvas with
   * closed-but-no-active history) and returnToSessionLanding (a session
   * was just closed via Session Complete); cleared by activateSession (the
   * one deliberate action that actually starts/resumes a session). */
  showSessionLanding: boolean
  insightsMode: InsightsMode
  setPhase: (phase: SessionPhase) => void
  /** Local, optimistic rename — unlike original_intent this is ordinary
   * editable metadata (canvas card / CanvasFooter). The caller is
   * responsible for persisting it (use-session-lifecycle.ts's
   * persistCanvasTitle), same split as setPhase/persistPhase. */
  setCanvasTitle: (title: string) => void
  viewSession: (sessionNumber: number) => void
  setInsightsMode: (mode: InsightsMode) => void
  returnToLive: () => void
  /** Sets the real canvas context after hydrating from Supabase
   * (use-canvas-hydration.ts). original_intent stays write-once — this only
   * ever loads it, never offers an edit (non-negotiable #5). sessionId/
   * sessionNumber are null (and showSessionLanding true) when hydration
   * found closed history but nothing active — see activateSession. */
  loadCanvas: (meta: {
    canvasId: string
    sessionId: string | null
    originalIntent: string
    title: string
    sessionNumber: number | null
    pastSessions: PastSessionSummary[]
    showSessionLanding: boolean
  }) => void
  /** North-star capture (2b) — write-once at canvas creation. A brand-new
   * canvas has no session yet either (mirrors the real path's deferred
   * start) — the canvas surface pairs this with canvas-store.resetToEmpty()
   * so a fresh canvas never shows seeded nodes, and CanvasShell's own mount
   * flow (continueToNewSession, mock-branched) establishes session 1.
   * `title` is the canvas name (/canvas/new's name field) — unlike
   * original_intent it's ordinary, editable metadata, not write-once;
   * blank/omitted falls back to "Untitled", same as the real insert path. */
  startNewCanvas: (originalIntent: string, title?: string) => void
  /** Session Complete's "Done" (screen 3, use-session-lifecycle.ts's
   * startNewSession) — the session that was just closed is gone from
   * canvasId/sessionId's live meaning, pastSessions is the freshly
   * refetched history (now including it), and SessionLanding takes over
   * again exactly like reopening a closed canvas would. */
  returnToSessionLanding: (pastSessions: PastSessionSummary[]) => void
  /** The one action that actually puts a session live — SessionLanding's
   * "Continue" / "view a past session", via continueToNewSession
   * (use-session-lifecycle.ts). Never called eagerly; see showSessionLanding. */
  activateSession: (sessionId: string, sessionNumber: number) => void
}

// original_intent is write-once at canvas creation (session-lifecycle story) —
// read-only here, never an edit affordance (CODING-STANDARDS.md non-negotiable #5).
export const useSessionStore = create<SessionStore>()((set) => ({
  canvasId: null,
  sessionId: null,
  originalIntent: "Why is our user retention dropping after week 2?",
  canvasTitle: "Retention",
  sessionNumber: null,
  phase: "diverging",
  viewedSession: null,
  pastSessions: [],
  showSessionLanding: false,
  insightsMode: "sidebar",
  setPhase: (phase) => set({ phase }),
  setCanvasTitle: (title) => set({ canvasTitle: title }),
  // Opening a past session always starts docked — the full view is
  // something the human deliberately expands into, never the default.
  viewSession: (sessionNumber) => set({ viewedSession: sessionNumber, insightsMode: "sidebar" }),
  setInsightsMode: (mode) => set({ insightsMode: mode }),
  returnToLive: () => set({ viewedSession: null, insightsMode: "sidebar" }),
  loadCanvas: ({ canvasId, sessionId, originalIntent, title, sessionNumber, pastSessions, showSessionLanding }) =>
    set({
      canvasId,
      sessionId,
      originalIntent,
      canvasTitle: title,
      sessionNumber,
      pastSessions,
      showSessionLanding,
      viewedSession: null,
      insightsMode: "sidebar",
      phase: "diverging",
    }),
  startNewCanvas: (originalIntent, title) =>
    set({
      originalIntent,
      canvasTitle: title?.trim() || "Untitled",
      // Mock mode's canvas is immediately "live" — no hydration ever runs
      // for it (use-canvas-hydration.ts no-ops entirely under
      // NEXT_PUBLIC_USE_MOCK_PERSISTENCE), so unlike the real path there's
      // no deferred-session step to mirror; session 1 starts right here.
      sessionNumber: 1,
      phase: "diverging",
      viewedSession: null,
      pastSessions: [],
      showSessionLanding: false,
      insightsMode: "sidebar",
    }),
  returnToSessionLanding: (pastSessions) =>
    set({
      sessionId: null,
      sessionNumber: null,
      pastSessions,
      showSessionLanding: true,
      viewedSession: null,
      insightsMode: "sidebar",
    }),
  activateSession: (sessionId, sessionNumber) =>
    set({
      sessionId,
      sessionNumber,
      showSessionLanding: false,
      phase: "diverging",
    }),
}))
