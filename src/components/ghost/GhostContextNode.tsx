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
          one per endpoint) always targets this one named handle
          ("left-target"). A node-triggered spawn sits to the trigger's
          right, so its drop-line enters here from the left; a `relate`
          pair's two drop-lines share it too (Canvas.tsx passes the same id
          for both). Naming it (rather than leaving it handle-less) is also
          what makes a SECOND concurrent edge to this node resolve at all —
          two edges to an unnamed target fail ("Couldn't create edge for
          target handle id: null") and never render. */}
      <Handle type="target" id="left-target" position={Position.Left} style={{ opacity: 0, pointerEvents: "none" }} />
      {/* The context ghost is also the SOURCE of the drop-line to its own
          question card, sitting to ITS right — a named source handle here is
          required for that edge to resolve at all (this node had no source
          handle of any kind before, so that edge silently failed to render). */}
      <Handle type="source" id="right-source" position={Position.Right} style={{ opacity: 0, pointerEvents: "none" }} />
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
