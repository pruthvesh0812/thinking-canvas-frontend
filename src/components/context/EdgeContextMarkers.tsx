"use client"

import { EdgeLabelRenderer } from "@xyflow/react"
import { useContextStore } from "@/stores/context-store"
import { ContextBadge, EdgeQuestionMark } from "./ContextBadge"

/** True while this edge is the focused component — edges draw their stroke
 * in the shared focus colour, same as the composer's outline (§5.1). */
export function useEdgeFocused(edgeId: string): boolean {
  return useContextStore((s) => s.focus?.kind === "edge" && s.focus.id === edgeId)
}

/** True while this edge's note box is open. The edge keeps its delete and
 * bend controls showing meanwhile — clicking into the box must not hide them. */
export function useEdgeComposerOpen(edgeId: string): boolean {
  return useContextStore((s) => s.composer?.target.kind === "edge" && s.composer.target.id === edgeId)
}

// Note-count badge + "?" for an edge, set just to the right of its midpoint
// so they never sit on the Q badge / relate diamond / bend dot at the middle.
export function EdgeContextMarkers({ edgeId, x, y, readOnly }: { edgeId: string; x: number; y: number; readOnly?: boolean }) {
  if (readOnly) return null
  return (
    <EdgeLabelRenderer>
      <div
        className="nodrag nopan absolute flex items-center gap-1"
        style={{ transform: `translate(0, -50%) translate(${x + 14}px, ${y}px)`, pointerEvents: "all" }}
      >
        <ContextBadge target={{ kind: "edge", id: edgeId }} />
        <EdgeQuestionMark edgeId={edgeId} />
      </div>
    </EdgeLabelRenderer>
  )
}
