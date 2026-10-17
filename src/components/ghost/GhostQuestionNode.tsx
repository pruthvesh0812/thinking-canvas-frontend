import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { GhostNodeCard } from "./GhostNodeCard"

export interface GhostQuestionNodeData extends Record<string, unknown> {
  triggerNodeId: string
}
export type GhostQuestionFlowNode = Node<GhostQuestionNodeData, "ghostQuestion">

// The downstream nudge — the question the AI never asks before it has
// grounded itself (CORE-CONCEPTS.md).
export function GhostQuestionNode({ data }: NodeProps<GhostQuestionFlowNode>) {
  return (
    <>
      {/* Sits to the context ghost's right (ghost-layout.ts) — its drop-line
          (GhostEdge, Canvas.tsx) always targets this named handle, entering
          from the left. */}
      <Handle type="target" id="left-target" position={Position.Left} style={{ opacity: 0, pointerEvents: "none" }} />
      <GhostNodeCard triggerNodeId={data.triggerNodeId} slot="question" badge="? nudge" width={250} minHeight={68} />
    </>
  )
}
