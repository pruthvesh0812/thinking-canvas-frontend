import { useEffect, useRef, useState } from "react"
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react"
import { useCanvasStore } from "@/stores/canvas-store"
import { useCanvasPersistence } from "@/hooks/use-canvas-persistence"
import { EdgeDeleteButton } from "./EdgeDeleteButton"
import { EdgeBendHandle } from "./EdgeBendHandle"
import { bendPath, unitNormal, type Point } from "./bend-path"

// Solid line + arrowhead like LogicalEdge, differentiated only by a small
// pulsing "Q" badge at the midpoint — the highest-signal human mark: an open
// question that summons the AI's cross-domain association
// (CORE-CONCEPTS.md). The pulse is the product's one ambient, non-attention-
// seeking motion; prefers-reduced-motion freezes it without losing the mark.
//
// The Q badge stays put always — clicking anywhere along the line reveals a
// delete button a little above it and a drag-to-bend dot a little below it,
// alongside the badge rather than swapping it out, and pins both open until
// the user clicks elsewhere. The dot bends the edge through wherever it's
// dragged, elongating the path, persisted the same way node layout is
// (use-canvas-persistence.ts's persistEdgeBend). One click on the button
// removes the edge immediately, with a few seconds to undo (requestEdgeDelete,
// shared with LogicalEdge).
export function QuestionEdge({
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
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan absolute flex items-center justify-center rounded-[7px] text-[10px] font-bold"
          style={{
            transform: `translate(-50%, -50%) translate(${midX}px, ${midY}px)`,
            width: 17,
            height: 15,
            background: "var(--tc-surface)",
            color: "var(--tc-ink)",
            animation: "tc-qpulse var(--tc-motion-pulse) ease-in-out infinite",
          }}
        >
          Q
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
