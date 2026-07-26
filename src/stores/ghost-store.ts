import { create } from "zustand"
import type { MockSpawnDescriptor, RejectionReason } from "@/types/mock-contract"

export type GhostNodeStatus =
  | "hidden"
  | "drawing"
  | "streaming"
  | "pending"
  | "accepted"
  | "rejected-pending-reason"
  | "rejected-final"

export type GhostPairSlot = "context" | "question"

/** "cascaded" is a system-applied rejection (the nudge lost its grounding) —
 * distinct from the three human-chosen reasons in RejectionReasonSelector. */
export type NodeRejectionReason = RejectionReason | "cascaded"

export interface GhostNodeState {
  ghostId: string
  text: string
  displayedText: string
  status: GhostNodeStatus
  rejectionReason?: NodeRejectionReason
}

export interface GhostPairState {
  descriptor: MockSpawnDescriptor
  /** Glow-first delivery: the pair exists but stays unrendered until the
   * human hovers the halo on the trigger node (CORE-CONCEPTS.md — "nothing
   * the AI produces ever enters the real canvas without a deliberate human
   * click"; the halo is the one sanctioned pre-click signal). */
  revealed: boolean
  context: GhostNodeState
  question?: GhostNodeState
}

interface GhostStore {
  // Keyed by trigger_node_id — the one-pair-per-node rule falls out of the
  // data structure instead of being checked imperatively (GHOST-STREAMING.md).
  pairs: Record<string, GhostPairState>
  showRejected: boolean
  pendingRejection: { triggerNodeId: string; slot: GhostPairSlot } | null

  spawn: (descriptor: MockSpawnDescriptor) => void
  reveal: (triggerNodeId: string) => void
  setStatus: (triggerNodeId: string, slot: GhostPairSlot, status: GhostNodeStatus) => void
  setDisplayedText: (triggerNodeId: string, slot: GhostPairSlot, text: string) => void
  accept: (triggerNodeId: string, slot: GhostPairSlot) => void
  requestReject: (triggerNodeId: string, slot: GhostPairSlot) => void
  chooseRejectionReason: (reason: RejectionReason) => void
  toggleShowRejected: () => void
  reset: () => void
}

const ACTIVE_STATUSES: GhostNodeStatus[] = ["drawing", "streaming", "pending"]

export const useGhostStore = create<GhostStore>()((set, get) => ({
  pairs: {},
  showRejected: false,
  pendingRejection: null,

  spawn: (descriptor) =>
    set((s) => ({
      // A new spawn for the same trigger node replaces the pending pair
      // (GHOST-STREAMING.md — one ghost pair per real node, maximum).
      pairs: {
        ...s.pairs,
        [descriptor.trigger_node_id]: {
          descriptor,
          revealed: false,
          context: {
            ghostId: descriptor.context_node.ghost_id,
            text: descriptor.context_node.text,
            displayedText: "",
            status: "hidden",
          },
          question: descriptor.question_node
            ? {
                ghostId: descriptor.question_node.ghost_id,
                text: descriptor.question_node.text,
                displayedText: "",
                status: "hidden",
              }
            : undefined,
        },
      },
    })),

  reveal: (triggerNodeId) =>
    set((s) => {
      const pair = s.pairs[triggerNodeId]
      if (!pair) return s
      return { pairs: { ...s.pairs, [triggerNodeId]: { ...pair, revealed: true } } }
    }),

  setStatus: (triggerNodeId, slot, status) =>
    set((s) => {
      const pair = s.pairs[triggerNodeId]
      const node = pair?.[slot]
      if (!pair || !node) return s
      return {
        pairs: { ...s.pairs, [triggerNodeId]: { ...pair, [slot]: { ...node, status } } },
      }
    }),

  setDisplayedText: (triggerNodeId, slot, text) =>
    set((s) => {
      const pair = s.pairs[triggerNodeId]
      const node = pair?.[slot]
      if (!pair || !node) return s
      return {
        pairs: { ...s.pairs, [triggerNodeId]: { ...pair, [slot]: { ...node, displayedText: text } } },
      }
    }),

  accept: (triggerNodeId, slot) => get().setStatus(triggerNodeId, slot, "accepted"),

  requestReject: (triggerNodeId, slot) => {
    get().setStatus(triggerNodeId, slot, "rejected-pending-reason")
    set({ pendingRejection: { triggerNodeId, slot } })
  },

  chooseRejectionReason: (reason) =>
    set((s) => {
      const pending = s.pendingRejection
      if (!pending) return s
      const pair = s.pairs[pending.triggerNodeId]
      if (!pair) return { pendingRejection: null }

      const updated: GhostPairState = {
        ...pair,
        [pending.slot]: { ...pair[pending.slot]!, status: "rejected-final", rejectionReason: reason },
      }

      // Rejecting the grounding (context) node cascades to its downstream
      // nudge (question) — "ground before nudge" means the nudge cannot
      // outlive the grounding it depended on. Rejecting the question alone
      // never touches the context node.
      if (pending.slot === "context" && updated.question && ACTIVE_STATUSES.includes(updated.question.status)) {
        updated.question = { ...updated.question, status: "rejected-final", rejectionReason: "cascaded" }
      }

      return {
        pairs: { ...s.pairs, [pending.triggerNodeId]: updated },
        pendingRejection: null,
      }
    }),

  toggleShowRejected: () => set((s) => ({ showRejected: !s.showRejected })),

  reset: () => set({ pairs: {}, showRejected: false, pendingRejection: null }),
}))
