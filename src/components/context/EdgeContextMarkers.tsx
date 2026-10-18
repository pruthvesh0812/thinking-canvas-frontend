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

// The note-count chip sits on the edge's middle, between the bend dot and the
// delete button. It shows once the edge has notes (or a draft); while the
// edge's controls are showing it is there even with none, as "+", so the
// first note can be added. Question and relate edges already have their Q
// badge / diamond at the middle, so their chip is set just to the right.
export function EdgeContextMarkers({
  edgeId,
  x,
  y,
  readOnly,
  revealed,
  centered,
}: {
  edgeId: string
  x: number
  y: number
  readOnly?: boolean
  revealed?: boolean
  centered?: boolean
}) {
  if (readOnly) return null
  return (
    <EdgeLabelRenderer>
      <div
        className="nodrag nopan absolute"
        style={{
          transform: `translate(${centered ? "-50%" : "0"}, -50%) translate(${centered ? x : x + 14}px, ${y}px)`,
          pointerEvents: "all",
        }}
      >
        <ContextBadge target={{ kind: "edge", id: edgeId }} showEmpty={revealed} />
        <div className="absolute left-full top-1/2 ml-1.5 -translate-y-1/2">
          <EdgeQuestionMark edgeId={edgeId} />
        </div>
      </div>
    </EdgeLabelRenderer>
  )
}
