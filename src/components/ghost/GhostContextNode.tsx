import type { Node, NodeProps } from "@xyflow/react"
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
  const nodeType = useGhostStore((s) => s.pairs[data.triggerNodeId]?.descriptor.context_node.node_type)
  return (
    <GhostNodeCard
      triggerNodeId={data.triggerNodeId}
      slot="context"
      badge={BADGE_BY_TYPE[nodeType ?? "reframe"]}
      width={280}
      minHeight={90}
    />
  )
}
