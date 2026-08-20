import { useRef } from "react"
import { EdgeLabelRenderer, useReactFlow } from "@xyflow/react"
import type { Point } from "./bend-path"

// Rests a little clear of the line instead of sitting on top of it — the
// mirror image of EdgeDeleteButton's ABOVE_LINE_OFFSET, offset along the
// opposite side of `normal` so the two controls never overlap and the
// corner (or the Q badge, on QuestionEdge) stays uncluttered.
const BELOW_LINE_OFFSET = 18

// Shared by LogicalEdge/QuestionEdge — a small dot floating just under the
// line that doubles as a drag handle: grabbing it and moving the pointer
// bends the edge through wherever it's dropped, elongating the path instead
// of leaving it a plain straight/default curve. Shown only while the edge is
// revealed (clicked), same gate as the delete button. `normal` (bend-path.ts's
// unitNormal) keeps the offset perpendicular to the actual edge instead of a
// fixed vertical shift, matching EdgeDeleteButton.
export function EdgeBendHandle({ x, y, normal, onDragStart, onDrag, onDragEnd }: {
  x: number
  y: number
  normal: Point
  onDragStart: () => void
  onDrag: (point: Point) => void
  onDragEnd: () => void
}) {
  const { screenToFlowPosition } = useReactFlow()
  const draggingRef = useRef(false)
  const ox = x - normal.x * BELOW_LINE_OFFSET
  const oy = y - normal.y * BELOW_LINE_OFFSET

  function handlePointerDown(e: React.PointerEvent) {
    e.stopPropagation()
    draggingRef.current = true
    onDragStart()

    function onMove(ev: PointerEvent) {
      if (!draggingRef.current) return
      onDrag(screenToFlowPosition({ x: ev.clientX, y: ev.clientY }))
    }
    function onUp() {
      draggingRef.current = false
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      onDragEnd()
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }

  return (
    <EdgeLabelRenderer>
      <div
        role="button"
        aria-label="Drag to bend connection"
        title="Drag to bend"
        onPointerDown={handlePointerDown}
        className="nodrag nopan absolute rounded-full"
        style={{
          pointerEvents: "auto",
          cursor: "grab",
          transform: `translate(-50%, -50%) translate(${ox}px, ${oy}px)`,
          width: 10,
          height: 10,
          background: "#2b2622",
          border: "1.5px solid var(--tc-surface)",
          boxShadow: "0 0 0 1px rgba(43,38,34,.35)",
        }}
      />
    </EdgeLabelRenderer>
  )
}
