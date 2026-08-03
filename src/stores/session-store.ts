import { create } from "zustand"
import type { SessionPhase } from "@/types/mock-contract"
import { CURRENT_SESSION_NUMBER } from "@/lib/mock-sessions"

/** How the session insights surface is presented. The same content renders
 * docked beside the historical canvas ('sidebar') or expanded over it
 * ('full') — one surface, two densities, animated between. */
export type InsightsMode = "sidebar" | "full"

interface SessionStore {
  originalIntent: string
  canvasTitle: string
  sessionNumber: number
  canvasPosition: string
  phase: SessionPhase
  /** null = the live session. A number puts the canvas into read-only
   * time-travel for that past session (design brief §Session History). */
  viewedSession: number | null
  insightsMode: InsightsMode
  setPhase: (phase: SessionPhase) => void
  viewSession: (sessionNumber: number) => void
  setInsightsMode: (mode: InsightsMode) => void
  returnToLive: () => void
  /** North-star capture (2b) — write-once at canvas creation. Starts a
   * brand-new canvas's session at 1; the canvas surface pairs this with
   * canvas-store.resetToEmpty() so a fresh canvas never shows seeded nodes. */
  startNewCanvas: (originalIntent: string) => void
}

// original_intent is write-once at canvas creation (session-lifecycle story) —
// read-only here, never an edit affordance (CODING-STANDARDS.md non-negotiable #5).
export const useSessionStore = create<SessionStore>()((set) => ({
  originalIntent: "Why is our user retention dropping after week 2?",
  canvasTitle: "Retention",
  sessionNumber: CURRENT_SESSION_NUMBER,
  canvasPosition: "canvas 2 of 4",
  phase: "diverging",
  viewedSession: null,
  insightsMode: "sidebar",
  setPhase: (phase) => set({ phase }),
  // Opening a past session always starts docked — the full view is
  // something the human deliberately expands into, never the default.
  viewSession: (sessionNumber) => set({ viewedSession: sessionNumber, insightsMode: "sidebar" }),
  setInsightsMode: (mode) => set({ insightsMode: mode }),
  returnToLive: () => set({ viewedSession: null, insightsMode: "sidebar" }),
  startNewCanvas: (originalIntent) =>
    set({
      originalIntent,
      canvasTitle: "Untitled",
      sessionNumber: 1,
      canvasPosition: "canvas 5 of 5",
      phase: "diverging",
      viewedSession: null,
      insightsMode: "sidebar",
    }),
}))
