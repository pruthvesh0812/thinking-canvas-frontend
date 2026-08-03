import { create } from "zustand"
import type { HumanEdgeType } from "@/types/mock-contract"

// Ephemeral view state for the canvas chrome — never persisted, never
// touches Supabase. Kept separate from canvas-store (real graph data) and
// session-store (canvas/session meta) per STATE-MANAGEMENT.md's one-store-
// per-concern layout.
interface CanvasUiStore {
  activePen: HumanEdgeType
  threadsRailOpen: boolean
  pastSessionsExpanded: boolean
  setActivePen: (pen: HumanEdgeType) => void
  toggleThreadsRail: () => void
  setThreadsRailOpen: (open: boolean) => void
  togglePastSessions: () => void
  /** The "Session N ▾" header label is a shortcut into session history —
   * it opens the rail already scrolled to the past-sessions section. */
  openPastSessions: () => void
}

export const useCanvasUiStore = create<CanvasUiStore>()((set) => ({
  activePen: "logical",
  threadsRailOpen: false,
  pastSessionsExpanded: false,
  setActivePen: (pen) => set({ activePen: pen }),
  toggleThreadsRail: () => set((s) => ({ threadsRailOpen: !s.threadsRailOpen })),
  setThreadsRailOpen: (open) => set({ threadsRailOpen: open }),
  togglePastSessions: () => set((s) => ({ pastSessionsExpanded: !s.pastSessionsExpanded })),
  openPastSessions: () => set({ threadsRailOpen: true, pastSessionsExpanded: true }),
}))
