"use client"

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react"
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
  /** True only when this node is the ONE selected node on the canvas
   * (Canvas.tsx: selectedNodeIds.size === 1 && selectedNodeIds.has(id)).
   * Gates this node's own inline Backspace-to-delete confirm — with 2+
   * selected, Canvas.tsx's own listener owns the shared group-delete
   * confirm instead. */
  soloSelected?: boolean
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
  // "menu" = Duplicate/Delete list, "confirm" = the delete guard's Cancel/
  // Delete step. Two distinct modes (not a boolean) because the confirm
  // step must survive a hover-leave that would otherwise close "menu".
  const [popover, setPopover] = useState<"closed" | "menu" | "confirm">("closed")
  const [draft, setDraft] = useState(data.content)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { persistNodeContent, persistNodeLayout, requestNodeDelete, duplicateNode } = useCanvasPersistence()
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

  // Backspace/Delete while this node is the SOLE selected node opens the
  // same confirm step the kebab menu's Delete goes through — React Flow's
  // own instant delete-on-Backspace is turned off in Canvas.tsx
  // specifically so this guard is the only path. With 2+ nodes selected,
  // data.soloSelected is false for all of them and Canvas.tsx's own
  // listener handles Backspace/Delete instead (one shared group-delete
  // confirm, not one popover per selected node — see Canvas.tsx). Escape
  // still closes whatever's open here regardless of selection count
  // (matches the kebab menu's own hover-close reach).
  const soloSelected = !!data.soloSelected
  useEffect(() => {
    if (readOnly || data.owner !== "human") return
    if (!selected && popover === "closed") return
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return
      if (soloSelected && (e.key === "Backspace" || e.key === "Delete")) {
        e.preventDefault()
        setPopover("confirm")
      } else if (e.key === "Escape") {
        setPopover("closed")
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [readOnly, data.owner, selected, popover, soloSelected])

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
    // Modifier keys are selection gestures (Shift = additive toggle;
    // Cmd/Ctrl = marquee, which the .tc-marquee-mode CSS in globals.css
    // usually intercepts before this handler fires, but the state flip
    // is async so a fast Cmd-click can still reach here) — never edit
    // gestures. Bow out and let React Flow handle the selection instead
    // of hijacking the click into beginEdit.
    if (e.shiftKey || e.metaKey || e.ctrlKey) return
    if ((e.target as HTMLElement).closest(".react-flow__handle, .react-flow__resize-control, .tc-node-menu")) return

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
      {/* Node actions (Node Delete UI) — delete/duplicate only ever target
          human-owned elements (CANVAS-RENDERING.md), so this doesn't render
          for AI-owned or read-only nodes. The kebab sits just outside the
          card, matching the resize fold's fade-in-on-hover convention; the
          popover opens on hovering that same outside area, not a click —
          click is still wired as a fallback for touch. */}
      {!readOnly && data.owner === "human" && (
        <div
          className="tc-node-menu nodrag absolute"
          style={{
            right: -30,
            top: 6,
            opacity: hovered || popover !== "closed" || selected ? 1 : 0,
            transition: "opacity .15s ease",
          }}
          onMouseEnter={() => setPopover((p) => (p === "closed" ? "menu" : p))}
          onMouseLeave={() => setPopover((p) => (p === "menu" ? "closed" : p))}
        >
          <button
            type="button"
            aria-label="Node actions"
            aria-expanded={popover !== "closed"}
            onClick={(e) => {
              e.stopPropagation()
              setPopover((p) => (p === "closed" ? "menu" : "closed"))
            }}
            className="flex items-center justify-center rounded-md"
            style={{
              width: 22,
              height: 26,
              border: "1px solid var(--tc-node-border)",
              background: "var(--tc-node)",
              boxShadow: "0 1px 2px rgba(43,38,34,.08)",
              cursor: "pointer",
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="var(--tc-chrome)">
              <circle cx="5" cy="1.5" r="1.1" />
              <circle cx="5" cy="5" r="1.1" />
              <circle cx="5" cy="8.5" r="1.1" />
            </svg>
          </button>

          {popover !== "closed" && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute rounded-[10px]"
              style={{
                left: 0,
                top: 26,
                width: 208,
                background: "var(--tc-node)",
                border: "1px solid var(--tc-node-border)",
                boxShadow: "0 8px 24px rgba(43,38,34,.18)",
                zIndex: 20,
              }}
            >
              {/* Speech-bubble arrow pointing back up at the kebab — the
                  anchoring cue the old floating card lacked. */}
              <div
                className="absolute"
                style={{
                  left: 8,
                  top: -5,
                  width: 9,
                  height: 9,
                  background: "var(--tc-node)",
                  borderLeft: "1px solid var(--tc-node-border)",
                  borderTop: "1px solid var(--tc-node-border)",
                  transform: "rotate(45deg)",
                }}
              />

              {popover === "menu" && (
                <div className="relative p-[5px]">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setPopover("closed")
                      duplicateNode(id)
                    }}
                    className="flex w-full items-center justify-between rounded-md px-[9px] py-[7px] text-left text-[13px] hover:bg-black/5"
                    style={{ border: "none", background: "transparent", color: "var(--tc-ink)", cursor: "pointer" }}
                  >
                    <span>Duplicate</span>
                    <span className="text-[11px]" style={{ color: "var(--tc-chrome-quiet)" }}>⌘D</span>
                  </button>
                  <div style={{ height: 1, background: "var(--tc-hairline)", margin: "4px 6px" }} />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setPopover("confirm")
                    }}
                    className="flex w-full items-center justify-between rounded-md px-[9px] py-[7px] text-left text-[13px] hover:bg-[rgba(168,66,46,.08)]"
                    style={{ border: "none", background: "transparent", color: "#a8422e", cursor: "pointer" }}
                  >
                    <span>Delete</span>
                    <span className="text-[11px]" style={{ color: "#c99b8f" }}>⌫</span>
                  </button>
                </div>
              )}

              {popover === "confirm" && (
                <div className="relative p-3.5">
                  <div className="mb-1 text-[13px] font-semibold" style={{ color: "var(--tc-ink)" }}>
                    Delete this node?
                  </div>
                  <div className="mb-3 text-[11.5px] leading-[1.5]" style={{ color: "var(--tc-chrome)" }}>
                    You can undo for a few seconds after.
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setPopover("closed")
                      }}
                      className="rounded-[7px] px-3 py-1.5 text-[12.5px] hover:bg-black/[.04]"
                      style={{ border: "1px solid var(--tc-hairline-strong)", background: "transparent", color: "#6b6257", cursor: "pointer" }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setPopover("closed")
                        requestNodeDelete(id)
                      }}
                      className="rounded-[7px] px-3 py-1.5 text-[12.5px] font-semibold hover:bg-[#8f3925]"
                      style={{ border: "none", background: "#a8422e", color: "#fff", cursor: "pointer" }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
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
    </div>
  )
}
