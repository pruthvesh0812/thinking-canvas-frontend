import { useEffect, useRef, useState } from "react"
import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react"
import { useCanvasStore } from "@/stores/canvas-store"
import { useCanvasPersistence } from "@/hooks/use-canvas-persistence"
import { EdgeDeleteButton } from "./EdgeDeleteButton"
import { EdgeBendHandle } from "./EdgeBendHandle"
import { bendPath, unitNormal, type Point } from "./bend-path"

// Solid line, arrowhead — "this follows from that" (CANVAS-RENDERING.md).
// Clicking anywhere along the line — a wide invisible hit-path underneath
// the thin visible stroke, not just the stroke itself — reveals a delete
// button a little above the midpoint and a small drag-to-bend dot a little
// below it, and pins both open until the user clicks elsewhere or deletes
// it. The dot bends the edge through wherever it's dragged, elongating the
// path, persisted the same way node layout is (use-canvas-persistence.ts's
// persistEdgeBend). One click on the button removes the edge immediately,
// with a few seconds to undo (requestEdgeDelete — same undo-toast pattern as
// node delete).
export function LogicalEdge({
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
  const [defaultPath, defaultLabelX, defaultLabelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })

  const source: Point = { x: sourceX, y: sourceY }
  const target: Point = { x: targetX, y: targetY }
  const path = bend ? bendPath(source, target, bend) : defaultPath
  const midX = bend ? bend.x : defaultLabelX
  const midY = bend ? bend.y : defaultLabelY
  const normal = unitNormal(source, target)

  // Clicking the edge pins the button open; clicking anywhere else (another
  // edge, a node, empty canvas) closes it again.
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

  return (
    <>
      <BaseEdge
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: revealed ? "#2b2622" : "#6A6154",
          strokeWidth: revealed ? 2 : 1.5,
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
    </>
  )
}
