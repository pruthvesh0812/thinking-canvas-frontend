import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { useGhostStore } from "@/stores/ghost-store"
import type { ContextNodeType } from "@/types"
import { GhostNodeCard } from "./GhostNodeCard"

const BADGE_BY_TYPE: Record<ContextNodeType, string> = {
  reframe: "↺ reframing",
  mirror: "☍ mirror",
  pattern: "≈ pattern",
  reference: "§ refers to",
  contradiction: "⇄ contradicts with",
  appreciation: "✓ appreciating",
}

export interface GhostContextNodeData extends Record<string, unknown> {
  triggerNodeId: string
}
export type GhostContextFlowNode = Node<GhostContextNodeData, "ghostContext">

// The grounding half of a ghost pair — always revealed before its downstream
// question ("ground before nudge, never question-first" — CORE-CONCEPTS.md).
export function GhostContextNode({ data }: NodeProps<GhostContextFlowNode>) {
  // `nodeType` is the store's own field, not the descriptor's default — a
  // `node_type` message overrides it mid-stream (GHOST-STREAMING.md).
  const nodeType = useGhostStore((s) => s.pairs[data.triggerNodeId]?.nodeType)
  return (
    <>
      {/* A ghost card is never user-connectable, but it IS a drop-line
          target — GhostEdge (and, for a `relate` pair, TWO of them at once,
          one per endpoint) connects here without naming a handle id. With
          zero handles React Flow can resolve a single incoming edge by
          falling back to the node's center, but a second concurrent edge to
          the same handle-less target fails to resolve ("Couldn't create
          edge for target handle id: null") and never renders. One inert
          target handle gives every drop-line a real handle to resolve,
          however many there are. */}
      <Handle type="target" position={Position.Top} style={{ opacity: 0, pointerEvents: "none" }} />
      <GhostNodeCard
        triggerNodeId={data.triggerNodeId}
        slot="context"
        badge={BADGE_BY_TYPE[nodeType ?? "reframe"]}
        width={280}
        minHeight={90}
      />
    </>
  )
}
