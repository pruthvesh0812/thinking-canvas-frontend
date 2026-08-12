"use client"

import { Fragment, useLayoutEffect, useRef, useState } from "react"
import {
  Handle,
  NodeResizeControl,
  Position,
  ResizeControlVariant,
  type Node,
  type NodeProps,
  type ResizeParamsWithDirection,
} from "@xyflow/react"
import { useGhostStore } from "@/stores/ghost-store"
import { useCanvasPersistence } from "@/hooks/use-canvas-persistence"
import { useCanvasStore, type CanvasNodeData } from "@/stores/canvas-store"

export type HumanNodeData = CanvasNodeData & {
  width: number
  /** Manual height from the corner resize handle. Undefined = auto-fit
   * content (the default until the user drags the corner). */
  height?: number
  onRevealPair?: (triggerNodeId: string) => void
  /** Historical view: an earlier session's node, present as context only. */
  dimmed?: boolean
  /** Historical view: no editing, no handles, no ghost interaction. */
  readOnly?: boolean
}
export type HumanFlowNode = Node<HumanNodeData, "humanNode">

const HANDLE_STYLE = {
  width: 8,
  height: 8,
  background: "var(--tc-node)",
  border: "1px solid var(--tc-chrome)",
}

const HANDLE_SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left]
const DRAG_THRESHOLD_PX = 4

const MIN_WIDTH = 160
const MAX_WIDTH = 640
// Baseline node height — enough room for ~3 lines so a fresh node has real
// presence and clicking to edit never changes its size.
const MIN_HEIGHT = "4.5em"
// Pixel equivalent of MIN_HEIGHT (4.5em × 14.5px font ≈ 66) plus the
// node's vertical padding (py-3 = 24) — the floor for the corner handle.
const MIN_NODE_HEIGHT_PX = 90

// Invisible drag strip along the full edge — cursor is the only affordance
// until hovered, matching the handles' fade-in convention below.
const RESIZE_LINE_STYLE = { border: "none", background: "transparent" }

// The most vivid thing on screen (design spine, tier 1): solid fill, solid
// border, 100% opacity. Ghost nodes are the only thing rendered quieter.
export function HumanNode({ id, data, selected }: NodeProps<HumanFlowNode>) {
  const [hovered, setHovered] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(data.content)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { persistNodeContent, persistNodeLayout } = useCanvasPersistence()
  const updateNodeWidth = useCanvasStore((s) => s.updateNodeWidth)
  const updateNodeSize = useCanvasStore((s) => s.updateNodeSize)

  const pair = useGhostStore((s) => s.pairs[id])
  const revealPair = data.onRevealPair
  const readOnly = !!data.readOnly
  const showHalo = !readOnly && !!pair && !pair.revealed
  const highlighted = useCanvasStore((s) => s.highlightedNodeId === id)

  useLayoutEffect(() => {
    if (editing) textareaRef.current?.focus()
  }, [editing])

  // Auto-grow the textarea to fit its content — never a fixed row count.
  // Runs unconditionally so typing past the manual height still expands
  // the node (data.height is a floor, not a cap — applied as min-height
  // on the wrapper below).
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [editing, draft, data.content, data.width])

  function commit() {
    setEditing(false)
    if (draft.trim() !== data.content) persistNodeContent(id, draft)
  }

  function beginEdit() {
    if (readOnly || editing) return
    setDraft(data.content)
    setEditing(true)
  }

  function onPointerDown(e: React.PointerEvent) {
    if (readOnly || editing) return
    if ((e.target as HTMLElement).closest(".react-flow__handle, .react-flow__resize-control")) return

    const origin = { x: e.clientX, y: e.clientY }
    let dragged = false

    function onWindowMove(ev: PointerEvent) {
      const dx = ev.clientX - origin.x
      const dy = ev.clientY - origin.y
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) dragged = true
    }

    function cleanup() {
      window.removeEventListener("pointermove", onWindowMove)
      window.removeEventListener("pointerup", onWindowUp)
      window.removeEventListener("pointercancel", cleanup)
    }

    function onWindowUp() {
      cleanup()
      if (!dragged) beginEdit()
    }

    window.addEventListener("pointermove", onWindowMove)
    window.addEventListener("pointerup", onWindowUp)
    window.addEventListener("pointercancel", cleanup)
  }

  function onResize(_: unknown, params: ResizeParamsWithDirection) {
    updateNodeWidth(id, params.width)
  }

  function onCornerResize(_: unknown, params: ResizeParamsWithDirection) {
    // Corner handle drives both axes in one store write — see updateNodeSize.
    updateNodeSize(id, params.width, params.height)
  }

  // Persist once the drag ends, not per frame — mirrors the move-commit
  // rule in Canvas.tsx's onNodesChange (spatial-only, no backend notify).
  function onResizeEnd() {
    persistNodeLayout(id)
  }

  const isEmpty = !data.content.trim() && !editing

  return (
    <div
      className="relative box-border rounded-[10px] border px-[15px] py-3 text-[14.5px] leading-[1.5] transition-shadow"
      style={{
        width: data.width,
        // Manual height acts as a floor: the node never shrinks below it,
        // but typing past it still lets the textarea push the wrapper taller.
        minHeight: data.height,
        background: "var(--tc-node)",
        borderColor: hovered && !readOnly && !selected && !showHalo ? "rgba(43,38,34,.4)" : "var(--tc-node-border)",
        color: "var(--tc-ink)",
        fontStyle: "normal",
        boxShadow: showHalo
          ? "0 0 0 1.5px rgba(201,144,58,.6), 0 0 14px 3px rgba(201,144,58,.4), 0 0 30px 8px rgba(201,144,58,.2)"
          : selected
            ? "0 0 0 1.5px rgba(43,38,34,.45)"
            : highlighted
              ? "0 0 0 1.5px rgba(43,38,34,.45)"
              : hovered && !readOnly
                ? "0 0 0 1px rgba(43,38,34,.18), 0 2px 6px rgba(43,38,34,.1)"
                : "0 1px 2px rgba(43,38,34,.07)",
        // Earlier sessions stay present as context but never compete with
        // the session actually being viewed.
        opacity: data.dimmed ? 0.25 : 1,
        cursor: readOnly ? "default" : editing ? "text" : "pointer",
        transition: "opacity .4s ease, box-shadow .15s ease, border-color .15s ease",
        animation: showHalo ? "tc-bloom .9s ease-out both" : highlighted ? "tc-fadeup .3s ease-out both" : undefined,
      }}
      onMouseEnter={() => {
        if (readOnly) return
        setHovered(true)
        if (showHalo) revealPair?.(id)
      }}
      onMouseLeave={() => setHovered(false)}
      onPointerDown={onPointerDown}
    >
      {/* One visible dot per side: source + target stacked at the same spot
          so Strict mode routes connections to the handle you actually used. */}
      {HANDLE_SIDES.map((position) => (
        <Fragment key={position}>
          <Handle
            type="target"
            id={`${position}-target`}
            position={position}
            isConnectable={!readOnly}
            style={{
              ...HANDLE_STYLE,
              opacity: !readOnly && hovered ? 1 : 0,
              pointerEvents: readOnly ? "none" : undefined,
              transition: "opacity .15s ease",
            }}
          />
          <Handle
            type="source"
            id={`${position}-source`}
            position={position}
            isConnectable={!readOnly}
            style={{
              ...HANDLE_STYLE,
              opacity: !readOnly && hovered ? 1 : 0,
              pointerEvents: readOnly ? "none" : undefined,
              transition: "opacity .15s ease",
            }}
          />
        </Fragment>
      ))}

      {/* Horizontal-only resize — height is never manually set, it always
          auto-fits content at whatever width this leaves it with. */}
      {!readOnly && (
        <>
          <NodeResizeControl
            nodeId={id}
            position="left"
            resizeDirection="horizontal"
            variant={ResizeControlVariant.Line}
            minWidth={MIN_WIDTH}
            maxWidth={MAX_WIDTH}
            style={{ ...RESIZE_LINE_STYLE, cursor: "ew-resize" }}
            onResize={onResize}
            onResizeEnd={onResizeEnd}
          />
          <NodeResizeControl
            nodeId={id}
            position="right"
            resizeDirection="horizontal"
            variant={ResizeControlVariant.Line}
            minWidth={MIN_WIDTH}
            maxWidth={MAX_WIDTH}
            style={{ ...RESIZE_LINE_STYLE, cursor: "ew-resize" }}
            onResize={onResize}
            onResizeEnd={onResizeEnd}
          />
          {/* Bottom-right corner — the only two-axis handle. Drawn as a
              small dog-ear fold that sits at the card corner and fades in
              on hover, matching the edge-handle convention. */}
          <NodeResizeControl
            nodeId={id}
            position="bottom-right"
            minWidth={MIN_WIDTH}
            maxWidth={MAX_WIDTH}
            minHeight={MIN_NODE_HEIGHT_PX}
            style={{
              width: 14,
              height: 14,
              border: "none",
              background: "transparent",
              cursor: "nwse-resize",
              // Nudge the fold so its outer edges align with the node's
              // rounded corner rather than sitting just inside it.
              transform: "translate(2px, 2px)",
            }}
            onResize={onCornerResize}
            onResizeEnd={onResizeEnd}
          >
            <svg
              viewBox="0 0 10 10"
              width="10"
              height="10"
              fill="none"
              stroke="var(--tc-chrome)"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                opacity: hovered ? 1 : 0,
                transition: "opacity .15s ease",
                pointerEvents: "none",
              }}
            >
              {/* L-corner + diagonal — reads as a folded-up page corner. */}
              <path d="M 1 9 L 9 9 L 9 1" />
              <path d="M 1 9 L 9 1" />
            </svg>
          </NodeResizeControl>
        </>
      )}

      {/* Always render the textarea (readOnly when not editing) so clicking
          the node only flips a flag — no element swap, no remeasure, no
          size jump. The auto-grow effect already sized it correctly. */}
      <textarea
        ref={textareaRef}
        value={editing ? draft : data.content}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        readOnly={!editing}
        tabIndex={editing ? 0 : -1}
        placeholder=""
        className="nodrag w-full resize-none overflow-hidden border-none bg-transparent p-0 outline-none"
        style={{
          font: "inherit",
          color: "inherit",
          minHeight: MIN_HEIGHT,
          cursor: editing ? "text" : readOnly ? "default" : "pointer",
          // The textarea sits under the node's click surface when not editing
          // so onPointerDown on the wrapper drives the click-to-edit gesture.
          pointerEvents: editing ? "auto" : "none",
        }}
      />
      {isEmpty && (
        <div
          className="pointer-events-none absolute"
          style={{ left: 15, top: 12, width: 2, height: 16, background: "rgba(43,38,34,.3)" }}
        />
      )}
      {data.aiMarker && (
        <span
          className="absolute right-2 top-1 text-xs"
          style={{ color: "var(--tc-chrome-quiet)" }}
          title="AI contribution — accepted"
        >
          ◌
        </span>
      )}
      {data.seedSource && (
        <span
          className="pointer-events-none absolute left-0 whitespace-nowrap text-[11.5px]"
          style={{ top: -20, fontFamily: "var(--font-tc-hand)", color: "var(--tc-chrome-quiet)" }}
          title={
            data.seedSource === "carried_forward"
              ? "Carried forward from your last session"
              : "Accepted from the Observer's session summary"
          }
        >
          {data.seedSource === "carried_forward" ? "↩ carried from last session" : "◈ from the Observer"}
        </span>
      )}
    </div>
  )
}
