import { EdgeLabelRenderer } from "@xyflow/react"
import type { Point } from "./bend-path"

// Lifts the button clear of the stroke instead of sitting on top of it.
const ABOVE_LINE_OFFSET = 30

// Shared by LogicalEdge/QuestionEdge — the midpoint delete affordance that
// appears while the edge is hovered or clicked, floating a little above the
// line rather than directly on it. `normal` (bend-path.ts's unitNormal) is
// the "above" direction perpendicular to the edge at this point, so the
// offset stays perpendicular to the actual line instead of a fixed vertical
// shift that only looks right on near-horizontal edges. The wrapping
// EdgeLabelRenderer div is pointer-events:none by default (it overlays the
// whole pane), so this is the one element on that layer that opts itself
// back in.
export function EdgeDeleteButton({ x, y, normal, onDelete }: { x: number; y: number; normal: Point; onDelete: () => void }) {
  const ox = x + normal.x * ABOVE_LINE_OFFSET
  const oy = y + normal.y * ABOVE_LINE_OFFSET
  return (
    <EdgeLabelRenderer>
      <button
        type="button"
        data-edge-delete
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        title="Delete connection"
        aria-label="Delete connection"
        className="nodrag nopan absolute flex cursor-pointer items-center justify-center rounded-full"
        style={{
          pointerEvents: "auto",
          transform: `translate(-50%, -50%) translate(${ox}px, ${oy}px)`,
          width: 32,
          height: 32,
          border: "1px solid var(--tc-node-border)",
          background: "var(--tc-node)",
          boxShadow: "0 1px 3px rgba(43,38,34,.15)",
        }}
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="#a8422e" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 3H9M4 3V2A1 1 0 0 1 5 1H6A1 1 0 0 1 7 2V3M3.5 3V9A1 1 0 0 0 4.5 10H6.5A1 1 0 0 0 7.5 9V3" />
        </svg>
      </button>
    </EdgeLabelRenderer>
  )
}
