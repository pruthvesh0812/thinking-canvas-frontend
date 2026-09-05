import type { Node } from "@xyflow/react"

export interface RelateAnchorNodeData extends Record<string, unknown> {
  triggerNodeId: string
}
export type RelateAnchorFlowNode = Node<RelateAnchorNodeData, "relateAnchor">

// A zero-footprint React Flow node planted at a `relate` edge's midpoint
// (ghost-layout.ts's relateAnchorPosition) — purely decorative once a ghost
// is pending: it marks where the rest-state diamond sat, but the ghost's own
// drop-lines (Canvas.tsx's edges memo) run straight from BOTH endpoint nodes
// to the ghost card, not from this node — "both nodes point at the ghost"
// is the actual spec, not "the midpoint points at the ghost". Never
// draggable, selectable, or deletable; exists only while a pair is anchored
// to that edge (Canvas.tsx only plants one when pair.triggerEdgeId is set).
//
// Renders the same solid-amber diamond RelateEdge.tsx shows in its
// "anchoring" state — RelateEdge hides its own diamond whenever this node
// is present for the same edge, so there's exactly one diamond on screen,
// positioned by the one calculation both the ghost and this node share.
export function RelateAnchorNode() {
  return (
    <div
      style={{
        width: 14,
        height: 14,
        transform: "rotate(45deg)",
        background: "rgba(201,144,58,.85)",
        border: "1.2px solid rgba(201,144,58,.9)",
        boxShadow: "0 0 10px rgba(201,144,58,.55)",
        pointerEvents: "none",
      }}
    />
  )
}
