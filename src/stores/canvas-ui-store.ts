import { create } from "zustand"
import type { HumanEdgeType } from "@/stores/canvas-store"

/** "paper" is the existing plain surface — the default, and the only option
 * ever used in history view regardless of what's picked here. */
export type CanvasBackdrop = "paper" | "grid" | "blackboard"

/** What the delete-undo toast is currently showing — a node OR an edge, the
 * toast doesn't care which. use-canvas-persistence owns the commit timer (a
 * side effect, not display state) and hands this store just enough to
 * render the toast and run Undo. `id` is only used to tell whether a later
 * delete has replaced this one; it's never read for display. */
export interface PendingDelete {
  id: string
  label: string
  undo: () => void
}

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
  /** The one delete currently showing its undo toast. A second delete
   * while one is already in flight replaces this — it does NOT cancel the
   * first node's own commit timer, which keeps running in the background
   * (use-canvas-persistence.ts). */
  pendingDelete: PendingDelete | null
  setPendingDelete: (pending: PendingDelete | null) => void
  /** Cosmetic ReactFlow-pane preference (Canvas.tsx) — never persisted,
   * resets to "paper" on reload like every other view-only toggle here. */
  canvasBackdrop: CanvasBackdrop
  setCanvasBackdrop: (backdrop: CanvasBackdrop) => void
  /** Optional hex tint layered on top of whichever backdrop mode is active
   * (lib/canvas-backdrop.ts) — null means "use that mode's own default
   * color". One tint for all three modes, not one per mode. */
  backdropColor: string | null
  setBackdropColor: (color: string | null) => void
}

export const useCanvasUiStore = create<CanvasUiStore>()((set) => ({
  activePen: "logical",
  threadsRailOpen: false,
  pastSessionsExpanded: false,
  pendingDelete: null,
  canvasBackdrop: "paper",
  backdropColor: null,
  setActivePen: (pen) => set({ activePen: pen }),
  toggleThreadsRail: () => set((s) => ({ threadsRailOpen: !s.threadsRailOpen })),
  setThreadsRailOpen: (open) => set({ threadsRailOpen: open }),
  togglePastSessions: () => set((s) => ({ pastSessionsExpanded: !s.pastSessionsExpanded })),
  openPastSessions: () => set({ threadsRailOpen: true, pastSessionsExpanded: true }),
  setPendingDelete: (pending) => set({ pendingDelete: pending }),
  setCanvasBackdrop: (backdrop) => set({ canvasBackdrop: backdrop }),
  setBackdropColor: (color) => set({ backdropColor: color }),
}))
