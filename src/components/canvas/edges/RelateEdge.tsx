import { useEffect, useRef, useState } from "react"
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react"
import { useCanvasStore } from "@/stores/canvas-store"
import { useGhostStore } from "@/stores/ghost-store"
import { useCanvasPersistence } from "@/hooks/use-canvas-persistence"
import { EdgeDeleteButton } from "./EdgeDeleteButton"
import { EdgeBendHandle } from "./EdgeBendHandle"
import { bendPath, unitNormal, type Point } from "./bend-path"

// Dashed line with a midpoint ◇ at rest — "how are these two related?" Once
// a pair is pending on this edge (triggerEdgeId matches this edge's id),
// this component's OWN diamond hides: Canvas.tsx plants a RelateAnchorNode
// at the edge's geometric midpoint instead, rendering a larger solid amber
// diamond there and giving the ghost's drop-line an actual node to connect
// FROM at that exact point (both endpoint nodes also halo, via ghost-store's
// anchorNodeIds). Splitting it this way keeps the ghost card, its drop-line,
// and the diamond all positioned by the one shared calculation
// (ghost-layout.ts's relateAnchorPosition) instead of two independent ones
// that could drift apart pixel-by-pixel.
//
// Click-to-reveal delete + drag-to-bend affordances are shared with
// LogicalEdge/QuestionEdge — mounted once the invisible hit-path is
// clicked, dismissed on outside click.
export function RelateEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps) {
  const [clicked, setClicked] = useState(false)
  const hitPathRef = useRef<SVGPathElement>(null)
  const readOnly = !!(data as { readOnly?: boolean } | undefined)?.readOnly
  const { requestEdgeDelete, persistEdgeBend } = useCanvasPersistence()
  const updateEdgeBend = useCanvasStore((s) => s.updateEdgeBend)
  const bend = useCanvasStore((s) => s.edges.find((e) => e.id === id)?.bend)
  // True when some pending pair is anchored to this edge — the diamond
  // fills solid amber and grows. Selector returns a primitive so
  // shallow-compare settles without a wrapping object.
  const anchoring = useGhostStore((s) => {
    for (const pair of Object.values(s.pairs)) {
      if (pair.triggerEdgeId === id) return true
    }
    return false
  })
  const [defaultPath, defaultLabelX, defaultLabelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const source: Point = { x: sourceX, y: sourceY }
  const target: Point = { x: targetX, y: targetY }
  const path = bend ? bendPath(source, target, bend) : defaultPath
  const midX = bend ? bend.x : defaultLabelX
  const midY = bend ? bend.y : defaultLabelY
  const normal = unitNormal(source, target)

  useEffect(() => {
    if (!clicked) return
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Element | null
      if (target === hitPathRef.current || target?.closest("[data-edge-delete]")) return
      setClicked(false)
    }
    window.addEventListener("pointerdown", onPointerDown)
    return () => window.removeEventListener("pointerdown", onPointerDown)
  }, [clicked])

  const revealed = !readOnly && clicked
  // Rest-state diamond only — small, outlined. The anchoring visual (larger,
  // solid amber, glowing) lives on RelateAnchorNode now, not here; see the
  // render guard below.
  const diamondSize = 10
  const diamondFill = "transparent"
  const diamondStroke = "rgba(43,38,34,.55)"

  return (
    <>
      <BaseEdge
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: revealed ? "#2b2622" : "#6A6154",
          strokeWidth: revealed ? 2 : 1.5,
          strokeDasharray: "6 4",
          filter: revealed ? "drop-shadow(0 0 3px rgba(43,38,34,.45))" : undefined,
          transition: "stroke .15s ease, stroke-width .15s ease, filter .15s ease",
        }}
      />
      {!readOnly && (
        <path
          ref={hitPathRef}
          d={path}
          fill="none"
          stroke="transparent"
          strokeWidth={20}
          style={{ pointerEvents: "stroke", cursor: "pointer" }}
          onClick={() => setClicked(true)}
        />
      )}
      {revealed && (
        <>
          <EdgeBendHandle
            x={midX}
            y={midY}
            normal={normal}
            onDragStart={() => setClicked(true)}
            onDrag={(point) => updateEdgeBend(id, point)}
            onDragEnd={() => persistEdgeBend(id)}
          />
          <EdgeDeleteButton x={midX} y={midY} normal={normal} onDelete={() => requestEdgeDelete(id)} />
        </>
      )}
      <EdgeLabelRenderer>
        {/* While anchoring a pending pair, Canvas.tsx plants a
            RelateAnchorNode at the edge's geometric midpoint (ghost-layout's
            relateAnchorPosition) and the ghost's drop-line connects FROM it
            — that node renders the solid diamond instead, positioned by the
            same calculation the ghost card itself uses. Rendering both here
            AND there would double up (and the two midpoints aren't
            guaranteed pixel-identical: this one is React Flow's bezier
            path midpoint, that one is the simple node-center average), so
            this edge's own diamond only shows at rest. */}
        {!anchoring && (
          <div
            className="nodrag nopan absolute"
            style={{
              // Rotated square — reads as ◇ / ◆. The wrapper doesn't rotate
              // (kept axis-aligned for the box shadow to feel right); the
              // inner shape does.
              transform: `translate(-50%, -50%) translate(${midX}px, ${midY}px)`,
              width: diamondSize,
              height: diamondSize,
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                transform: "rotate(45deg)",
                background: diamondFill,
                border: `1.2px solid ${diamondStroke}`,
                transition: "background .32s ease, border-color .32s ease",
              }}
            />
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  )
}
