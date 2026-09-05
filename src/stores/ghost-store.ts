import { create } from "zustand"
import type { ContextNodeType, RedisMessage, RejectionReason, SpawnDescriptor } from "@/types"
import { logger } from "@/lib/logger"

export type GhostPairSlot = "context" | "question"
export type GhostSlotDecision = "accepted" | "rejected"

type DoneMessage = Extract<RedisMessage, { type: "done" }>

// Real shape (GHOST-STREAMING.md § Ghost Store Shape) — content arrives
// incrementally by ghost id via SSE `chunk` messages, never up front. One
// entry per trigger node (the one-pair-per-node rule falls out of the map
// key instead of being checked imperatively): a new `spawn` for the same
// trigger simply overwrites the old entry.
export interface GhostPairState {
  descriptor: SpawnDescriptor
  /** Starts = descriptor's default, overridden by a `node_type` message. */
  nodeType: ContextNodeType
  /** Accumulated `chunk.data` for context_node.ghost_id. */
  contextText: string
  /** Accumulated `chunk.data` for question_node.ghost_id, if any. */
  questionText: string
  /** Articulator only — parsed out of contextText as it accumulates (its
   * body has no separate question node; 2-3 readings live inside this one
   * context node instead — GHOST-STREAMING.md § Content Delivery). */
  articulations?: string[]
  /** Set true by `done` — gates accept/reject controls. */
  streamed: boolean
  /** Set by `done` — thread_id/turn_index, what POST /api/ghost-status needs. */
  attribution?: { thread_id: string; turn_index: number }
  /** ghost-interaction: the human's per-node call, recorded independently so
   * a mixed outcome (context accepted, question rejected) can wait for both
   * before use-canvas-persistence.ts fires the single ghost-status call that
   * carries both statuses. Undefined = not decided yet. */
  contextDecision?: GhostSlotDecision
  questionDecision?: GhostSlotDecision
  /** Whichever reason was last chosen on a reject — GhostStatusPayload has
   * one `rejection_reason` field for the whole pair, not per slot. */
  rejectionReason?: RejectionReason
  /** Real nodes this pair visually anchors to — driving `HumanNode`'s halo.
   * Straight off the descriptor's `anchor_node_ids`: `[trigger_node_id]` for
   * a node-triggered spawn (Expander/Stress-Tester/Outer-Sub), the edge's
   * two endpoints for a `relate`-triggered Articulator run — so BOTH nodes
   * halo simultaneously. Always populated, so HumanNode.tsx's halo lookup
   * is one code path, never a branch on which agent fired. */
  anchorNodeIds: string[]
  /** The `relate` edge that spawned this pair, straight off the
   * descriptor's `trigger_edge_id` — undefined for node-triggered spawns.
   * Canvas.tsx uses it to position the ghost at the edge's midpoint (via
   * `ghost-layout.ts`'s `ghostPositionsFromEdge`) instead of next to a
   * single trigger node; `RelateEdge.tsx` uses it to fill/pulse the
   * midpoint diamond for the edge with a matching id. */
  triggerEdgeId?: string
}

interface GhostStore {
  pairs: Record<string, GhostPairState>
  spawn: (descriptor: SpawnDescriptor) => void
  appendChunk: (ghostId: string, data: string) => void
  setNodeType: (ghostId: string, nodeType: ContextNodeType) => void
  markDone: (msg: DoneMessage) => void
  /** Records one slot's accept/reject call (ghost-interaction) — does not
   * remove anything by itself; use-canvas-persistence.ts reads the pair
   * back afterward to see whether both decisions (or the only one, when
   * there's no question ghost) are now in. */
  recordDecision: (triggerNodeId: string, slot: GhostPairSlot, decision: GhostSlotDecision, reason?: RejectionReason) => void
  /** Removes the pair once its accept/reject decision(s) are complete — the
   * ghost layer's only job after that is to stop rendering it (the real
   * node, if any, now lives in canvas-store). Also used for cleanup when a
   * pair's trigger node is deleted (use-canvas-persistence.ts). */
  resolve: (triggerNodeId: string) => void
  /** Clears every pending pair — used when leaving for a fresh canvas
   * (canvas/new/page.tsx) so nothing from the previous canvas lingers. */
  reset: () => void
}

// A question ghost is pre-created in the descriptor for Expander/
// Stress-Tester/Outer-Sub, but an `appreciation` response never emits
// [QUESTION] — so it never receives a chunk. Once the pair is fully
// streamed with nothing accumulated for it, it counts as absent, same as an
// Articulator's descriptor never having one at all: no card ever renders
// for it, so nothing will ever decide it (GHOST-STREAMING.md § Content
// Delivery — "empty question ghost").
export function hasQuestionGhost(pair: GhostPairState): boolean {
  return !!pair.descriptor.question_node && !(pair.streamed && pair.questionText === "")
}

// True when this node is any pending pair's anchor — HumanNode's halo. The
// selector iterates every pair (small — one entry per triggering node) and
// checks anchorNodeIds, so a `relate`-triggered pair whose anchors are the
// two endpoints of an edge halos both simultaneously. For today's
// node-triggered spawns, anchorNodeIds is `[trigger_node_id]` and the
// result matches the old `!!pairs[id]` check exactly. Keep this pure so
// zustand's shallow-compare (via useGhostStore) settles.
export function isHaloAnchor(state: { pairs: Record<string, GhostPairState> }, nodeId: string): boolean {
  for (const pair of Object.values(state.pairs)) {
    if (pair.anchorNodeIds.includes(nodeId)) return true
  }
  return false
}

// Sub-structure of ONE context node's text, not a pair split (the
// Articulator has no question node) — GHOST-STREAMING.md § Content Delivery.
const ARTICULATION_MARKER = /\[ARTICULATION \d+\]\s*/g

function parseArticulations(contextText: string): string[] | undefined {
  if (!contextText.includes("[ARTICULATION")) return undefined
  const readings = contextText
    .split(ARTICULATION_MARKER)
    .map((s) => s.trim())
    .filter(Boolean)
  return readings.length > 0 ? readings : undefined
}

// Finds which pair + slot a ghost id belongs to — chunk/node_type messages
// carry only the ghost id, never the trigger node id, so every route needs
// this reverse lookup across the pending pairs.
function findByGhostId(
  pairs: Record<string, GhostPairState>,
  ghostId: string,
): { triggerNodeId: string; slot: GhostPairSlot } | undefined {
  for (const [triggerNodeId, pair] of Object.entries(pairs)) {
    if (pair.descriptor.context_node.ghost_id === ghostId) return { triggerNodeId, slot: "context" }
    if (pair.descriptor.question_node?.ghost_id === ghostId) return { triggerNodeId, slot: "question" }
  }
  return undefined
}

export const useGhostStore = create<GhostStore>()((set) => ({
  pairs: {},

  spawn: (descriptor) =>
    set((s) => {
      // A new spawn for the same trigger node replaces the pending pair
      // (GHOST-STREAMING.md — one ghost pair per real node, maximum).
      // anchor_node_ids is always populated by the backend (node-triggered:
      // [trigger_node_id]; relate-triggered: the edge's two endpoints) — the
      // `??` fallback only guards a stream still mid-flight from before this
      // field existed.
      return {
        pairs: {
          ...s.pairs,
          [descriptor.trigger_node_id]: {
            descriptor,
            nodeType: descriptor.context_node.node_type,
            contextText: "",
            questionText: "",
            streamed: false,
            anchorNodeIds: descriptor.anchor_node_ids ?? [descriptor.trigger_node_id],
            ...(descriptor.trigger_edge_id ? { triggerEdgeId: descriptor.trigger_edge_id } : {}),
          },
        },
      }
    }),

  appendChunk: (ghostId, data) =>
    set((s) => {
      const hit = findByGhostId(s.pairs, ghostId)
      if (!hit) {
        // A chunk whose target has no spawned frame is a protocol error —
        // log it, drop it (GHOST-STREAMING.md § What NOT to Do). Never let
        // a stray chunk create a node.
        logger.warn("[ghost-store] chunk targets unknown ghost id — dropping", { ghostId })
        return s
      }
      const pair = s.pairs[hit.triggerNodeId]
      if (hit.slot === "context") {
        const contextText = pair.contextText + data
        return {
          pairs: {
            ...s.pairs,
            [hit.triggerNodeId]: { ...pair, contextText, articulations: parseArticulations(contextText) },
          },
        }
      }
      return {
        pairs: {
          ...s.pairs,
          [hit.triggerNodeId]: { ...pair, questionText: pair.questionText + data },
        },
      }
    }),

  setNodeType: (ghostId, nodeType) =>
    set((s) => {
      const hit = findByGhostId(s.pairs, ghostId)
      // node_type only ever targets the context ghost (GHOST-STREAMING.md) —
      // a match on the question slot would itself be a protocol error.
      if (!hit || hit.slot !== "context") {
        logger.warn("[ghost-store] node_type targets unknown or non-context ghost id — dropping", { ghostId })
        return s
      }
      const pair = s.pairs[hit.triggerNodeId]
      return { pairs: { ...s.pairs, [hit.triggerNodeId]: { ...pair, nodeType } } }
    }),

  markDone: (msg) =>
    set((s) => {
      const pair = s.pairs[msg.trigger_node_id]
      if (!pair) return s
      // Multiple generations can interleave on one connection (a debounced
      // run and an immediate one) — a `done` only finalizes the pair it
      // names via context_ghost_id, never "whichever pair is pending" for
      // that trigger node. A mismatch means a later spawn already replaced
      // this generation; the stale `done` is dropped.
      if (pair.descriptor.context_node.ghost_id !== msg.context_ghost_id) return s
      return {
        pairs: {
          ...s.pairs,
          [msg.trigger_node_id]: {
            ...pair,
            streamed: true,
            attribution: { thread_id: msg.thread_id, turn_index: msg.turn_index },
          },
        },
      }
    }),

  recordDecision: (triggerNodeId, slot, decision, reason) =>
    set((s) => {
      const pair = s.pairs[triggerNodeId]
      if (!pair) return s
      const field = slot === "context" ? "contextDecision" : "questionDecision"
      return {
        pairs: {
          ...s.pairs,
          [triggerNodeId]: {
            ...pair,
            [field]: decision,
            ...(reason ? { rejectionReason: reason } : {}),
          },
        },
      }
    }),

  resolve: (triggerNodeId) =>
    set((s) => {
      if (!(triggerNodeId in s.pairs)) return s
      const pairs = { ...s.pairs }
      delete pairs[triggerNodeId]
      return { pairs }
    }),

  reset: () => set({ pairs: {} }),
}))
