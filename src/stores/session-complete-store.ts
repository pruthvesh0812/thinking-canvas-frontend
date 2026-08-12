import { create } from "zustand"
import type { SessionLearning } from "@/types"

export type SessionCompleteScreen = "observer" | "threads" | "closed"

// The two categories computable from canvas-store today (use-session-lifecycle.ts
// — "accepted contradiction nodes" needs a materialized ghost's ContextNodeType,
// which nothing persists onto a real node yet).
export type UnresolvedThreadKind = "question" | "empty_node"

export interface UnresolvedThread {
  id: string
  kind: UnresolvedThreadKind
  content: string
  nodeId: string
}

export type CarryChoice = "carry" | "resolve" | "discard"

// Ephemeral flow state for the Session Complete modal (SESSION-FLOWS.md's
// 3-screen shell) — its own concern, separate from session-store's
// canvas/session identity and canvas-ui-store's chrome toggles.
interface SessionCompleteStore {
  open: boolean
  screen: SessionCompleteScreen
  /** null = still loading/polling (screen 1's "Observer is reading your
   * canvas" state); [] = polled and the Observer offered nothing. */
  observerSuggestions: SessionLearning[] | null
  acceptedSuggestionIds: Set<string>
  dismissedSuggestionIds: Set<string>
  unresolvedThreads: UnresolvedThread[]
  choices: Record<string, CarryChoice>
  /** True while "Start New Session" is opening the next session. */
  starting: boolean

  openModal: () => void
  setObserverSuggestions: (items: SessionLearning[]) => void
  markSuggestionAccepted: (id: string) => void
  markSuggestionDismissed: (id: string) => void
  setUnresolvedThreads: (threads: UnresolvedThread[]) => void
  setChoice: (id: string, choice: CarryChoice) => void
  goToThreads: () => void
  goToClosed: () => void
  setStarting: (starting: boolean) => void
  /** Closes the modal and clears every field — both a deliberate "×" close
   * and the terminal step of starting the next session. */
  reset: () => void
}

const CLOSED: Pick<
  SessionCompleteStore,
  "open" | "screen" | "observerSuggestions" | "acceptedSuggestionIds" | "dismissedSuggestionIds" | "unresolvedThreads" | "choices" | "starting"
> = {
  open: false,
  screen: "observer",
  observerSuggestions: null,
  acceptedSuggestionIds: new Set(),
  dismissedSuggestionIds: new Set(),
  unresolvedThreads: [],
  choices: {},
  starting: false,
}

export const useSessionCompleteStore = create<SessionCompleteStore>()((set) => ({
  ...CLOSED,
  openModal: () => set({ ...CLOSED, open: true }),
  setObserverSuggestions: (items) => set({ observerSuggestions: items }),
  markSuggestionAccepted: (id) =>
    set((s) => ({ acceptedSuggestionIds: new Set(s.acceptedSuggestionIds).add(id) })),
  markSuggestionDismissed: (id) =>
    set((s) => ({ dismissedSuggestionIds: new Set(s.dismissedSuggestionIds).add(id) })),
  setUnresolvedThreads: (threads) => set({ unresolvedThreads: threads }),
  setChoice: (id, choice) => set((s) => ({ choices: { ...s.choices, [id]: choice } })),
  goToThreads: () => set({ screen: "threads" }),
  goToClosed: () => set({ screen: "closed" }),
  setStarting: (starting) => set({ starting }),
  reset: () => set({ ...CLOSED }),
}))
