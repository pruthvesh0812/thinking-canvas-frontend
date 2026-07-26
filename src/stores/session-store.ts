import { create } from "zustand"
import type { SessionPhase } from "@/types/mock-contract"

interface SessionStore {
  originalIntent: string
  canvasTitle: string
  sessionNumber: number
  canvasPosition: string
  phase: SessionPhase
  setPhase: (phase: SessionPhase) => void
}

// original_intent is write-once at canvas creation (session-lifecycle story) —
// read-only here, never an edit affordance (CODING-STANDARDS.md non-negotiable #5).
export const useSessionStore = create<SessionStore>()((set) => ({
  originalIntent: "Why is our user retention dropping after week 2?",
  canvasTitle: "Retention",
  sessionNumber: 3,
  canvasPosition: "canvas 2 of 4",
  phase: "diverging",
  setPhase: (phase) => set({ phase }),
}))
