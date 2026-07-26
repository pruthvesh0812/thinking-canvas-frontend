import type { Node, NodeProps } from "@xyflow/react"
import { GhostNodeCard } from "./GhostNodeCard"

export interface GhostQuestionNodeData extends Record<string, unknown> {
  triggerNodeId: string
}
export type GhostQuestionFlowNode = Node<GhostQuestionNodeData, "ghostQuestion">

// The downstream nudge — the question the AI never asks before it has
// grounded itself (CORE-CONCEPTS.md).
export function GhostQuestionNode({ data }: NodeProps<GhostQuestionFlowNode>) {
  return (
    <GhostNodeCard triggerNodeId={data.triggerNodeId} slot="question" badge="? nudge" width={250} minHeight={68} />
  )
}
