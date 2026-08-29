import { create } from "zustand"
import type { SessionPhase } from "@/types"
import { CURRENT_SESSION_NUMBER } from "@/lib/mock-sessions"

/** How the session insights surface is presented. The same content renders
 * docked beside the historical canvas ('sidebar') or expanded over it
 * ('full') — one surface, two densities, animated between. */
export type InsightsMode = "sidebar" | "full"

/** One row for SessionLanding's list and HistoryBar's "viewing Session N"
 * label — computed by use-canvas-hydration.ts from real `sessions` rows,
 * never mock-sessions.ts, for a real canvas. `number` uses the same
 * 1-indexed-by-start_time derivation POST /api/session/start uses
 * server-side (see API-CONTRACT.md), so it never disagrees with the live
 * session's own number. Closed sessions only — the live/active one has its
 * own session-store fields, it's never also a row here. */
export interface PastSessionSummary {
  id: string
  number: number
  /** Pre-formatted for display (e.g. "Jun 28, 2026") — hydration's job,
   * not the component's, same as every other derived label in this store. */
  date: string
  /** null on the rare closed-but-no-end_time row (shouldn't happen, but
   * `end_time` is nullable in the schema) — render as "unknown length". */
  durationMin: number | null
  nodeCount: number
}

interface SessionStore {
  /** The real Supabase ids of the canvas currently open and its active
   * session. null until a real canvas is hydrated (use-canvas-hydration.ts);
   * the persistence hook reads these to hang node/edge writes off the actual
   * canvas/session instead of dev env vars. */
  canvasId: string | null
  sessionId: string | null
  originalIntent: string
  canvasTitle: string
  sessionNumber: number
  canvasPosition: string
  phase: SessionPhase
  /** null = the live session. A number puts the canvas into read-only
   * time-travel for that past session (design brief §Session History). */
  viewedSession: number | null
  /** This canvas's closed session history — set on hydration (real canvas)
   * or startNewCanvas (empty, mock/fresh). SessionLanding's list and
   * HistoryBar's real-mode label both read this; it's never mutated after
   * hydration (closed sessions don't change). */
  pastSessions: PastSessionSummary[]
  insightsMode: InsightsMode
  setPhase: (phase: SessionPhase) => void
  viewSession: (sessionNumber: number) => void
  setInsightsMode: (mode: InsightsMode) => void
  returnToLive: () => void
  /** Sets the real canvas/session context after hydrating a canvas from
   * Supabase (use-canvas-hydration.ts). original_intent stays write-once —
   * this only ever loads it, never offers an edit (non-negotiable #5).
   * sessionNumber is the hydration hook's computed 1-indexed ordinal among
   * every session this canvas has ever had — must be passed explicitly, or
   * a freshly created canvas keeps showing the leftover mock default
   * (CURRENT_SESSION_NUMBER) in the header instead of "Session 1". */
  loadCanvas: (meta: {
    canvasId: string
    sessionId: string
    originalIntent: string
    title: string
    sessionNumber: number
    pastSessions: PastSessionSummary[]
  }) => void
  /** North-star capture (2b) — write-once at canvas creation. Starts a
   * brand-new canvas's session at 1; the canvas surface pairs this with
   * canvas-store.resetToEmpty() so a fresh canvas never shows seeded nodes. */
  startNewCanvas: (originalIntent: string) => void
  /** Session Complete's "Start New Session" (session-lifecycle story) —
   * swaps in the freshly opened session and bumps the display session
   * number. Note: canvas-store.addNode still stamps new nodes with the
   * hardcoded CURRENT_SESSION_NUMBER mock constant (auth story's flagged
   * gap), so this only drives header/footer labels until that's wired
   * through to the store. */
  advanceSession: (sessionId: string) => void
}

// original_intent is write-once at canvas creation (session-lifecycle story) —
// read-only here, never an edit affordance (CODING-STANDARDS.md non-negotiable #5).
export const useSessionStore = create<SessionStore>()((set) => ({
  canvasId: null,
  sessionId: null,
  originalIntent: "Why is our user retention dropping after week 2?",
  canvasTitle: "Retention",
  sessionNumber: CURRENT_SESSION_NUMBER,
  canvasPosition: "canvas 2 of 4",
  phase: "diverging",
  viewedSession: null,
  pastSessions: [],
  insightsMode: "sidebar",
  setPhase: (phase) => set({ phase }),
  // Opening a past session always starts docked — the full view is
  // something the human deliberately expands into, never the default.
  viewSession: (sessionNumber) => set({ viewedSession: sessionNumber, insightsMode: "sidebar" }),
  setInsightsMode: (mode) => set({ insightsMode: mode }),
  returnToLive: () => set({ viewedSession: null, insightsMode: "sidebar" }),
  loadCanvas: ({ canvasId, sessionId, originalIntent, title, sessionNumber, pastSessions }) =>
    set({
      canvasId,
      sessionId,
      originalIntent,
      canvasTitle: title,
      sessionNumber,
      pastSessions,
      viewedSession: null,
      insightsMode: "sidebar",
      phase: "diverging",
    }),
  startNewCanvas: (originalIntent) =>
    set({
      originalIntent,
      canvasTitle: "Untitled",
      sessionNumber: 1,
      canvasPosition: "canvas 5 of 5",
      phase: "diverging",
      viewedSession: null,
      pastSessions: [],
      insightsMode: "sidebar",
    }),
  advanceSession: (sessionId) =>
    set((s) => ({
      sessionId,
      sessionNumber: s.sessionNumber + 1,
      phase: "diverging",
      viewedSession: null,
      insightsMode: "sidebar",
    })),
}))
