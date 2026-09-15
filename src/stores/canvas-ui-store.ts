import { create } from "zustand"
import type { HumanEdgeType } from "@/stores/canvas-store"

/** "paper" is the existing plain surface — the default, and the only option
 * ever used in history view regardless of what's picked here. */
export type CanvasBackdrop = "paper" | "grid" | "blackboard"

/** What the delete-undo toast is currently showing — a node, an edge, or a
 * batch of several nodes (a group delete), the toast doesn't care which.
 * use-canvas-persistence owns the commit timer (a side effect, not display
 * state) and hands this store just enough to render the toast and run Undo.
 * `id` is only used to tell whether a later delete has replaced this one —
 * a node/edge id for a single delete, a synthetic "batch:<uuid>" for a
 * group delete — it's never read for display. */
export interface PendingDelete {
  id: string
  label: string
  undo: () => void
}

/** A `relate` articulation whose leg the user just tried to delete. The two
 * legs (A→C, B→C) plus the AI note C are one unit, so deleting a single leg
 * would leave C claiming a relationship it only half-connects — instead
 * use-canvas-persistence.ts raises this prompt and Canvas.tsx offers the two
 * coherent outcomes (drop both legs, or set the whole note aside). */
export interface RelateLegPrompt {
  aiNodeId: string
  legEdgeIds: string[]
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
  /** Whether set-aside (soft-archived) AI nodes are shown on the live
   * canvas. Default false — set-aside nodes are hidden until the user opts
   * to see them (Canvas.tsx). View-only, never persisted; resets on reload
   * like every toggle here. */
  showSetAside: boolean
  toggleShowSetAside: () => void
  /** Set when a `relate` leg-delete needs the user to choose an outcome
   * (see RelateLegPrompt). Null when no such prompt is open. */
  relateLegPrompt: RelateLegPrompt | null
  setRelateLegPrompt: (prompt: RelateLegPrompt | null) => void
}

export const useCanvasUiStore = create<CanvasUiStore>()((set) => ({
  activePen: "logical",
  threadsRailOpen: false,
  pastSessionsExpanded: false,
  pendingDelete: null,
  canvasBackdrop: "paper",
  backdropColor: null,
  showSetAside: false,
  relateLegPrompt: null,
  setActivePen: (pen) => set({ activePen: pen }),
  toggleThreadsRail: () => set((s) => ({ threadsRailOpen: !s.threadsRailOpen })),
  setThreadsRailOpen: (open) => set({ threadsRailOpen: open }),
  togglePastSessions: () => set((s) => ({ pastSessionsExpanded: !s.pastSessionsExpanded })),
  openPastSessions: () => set({ threadsRailOpen: true, pastSessionsExpanded: true }),
  setPendingDelete: (pending) => set({ pendingDelete: pending }),
  setCanvasBackdrop: (backdrop) => set({ canvasBackdrop: backdrop }),
  setBackdropColor: (color) => set({ backdropColor: color }),
  toggleShowSetAside: () => set((s) => ({ showSetAside: !s.showSetAside })),
  setRelateLegPrompt: (prompt) => set({ relateLegPrompt: prompt }),
}))
