"use client"

import { useState, useRef, useEffect } from "react"
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { useGhostStore } from "@/stores/ghost-store"
import { useCanvasPersistence } from "@/hooks/use-canvas-persistence"
import { useCanvasStore, type CanvasNodeData } from "@/stores/canvas-store"

export type HumanNodeData = CanvasNodeData & {
  width: number
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

// The most vivid thing on screen (design spine, tier 1): solid fill, solid
// border, 100% opacity. Ghost nodes are the only thing rendered quieter.
export function HumanNode({ id, data, selected }: NodeProps<HumanFlowNode>) {
  const [hovered, setHovered] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(data.content)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { persistNodeContent } = useCanvasPersistence()

  const pair = useGhostStore((s) => s.pairs[id])
  const revealPair = data.onRevealPair
  const readOnly = !!data.readOnly
  const showHalo = !readOnly && !!pair && !pair.revealed
  const highlighted = useCanvasStore((s) => s.highlightedNodeId === id)

  useEffect(() => {
    if (editing) textareaRef.current?.focus()
  }, [editing])

  function commit() {
    setEditing(false)
    if (draft.trim() !== data.content) persistNodeContent(id, draft)
  }

  const isEmpty = !data.content.trim() && !editing

  return (
    <div
      className="relative box-border rounded-[10px] border px-[15px] py-3 text-[14.5px] leading-[1.5] transition-shadow"
      style={{
        width: data.width,
        background: "var(--tc-node)",
        borderColor: "var(--tc-node-border)",
        color: "var(--tc-ink)",
        fontStyle: "normal",
        boxShadow: showHalo
          ? "0 0 0 1.5px rgba(201,144,58,.6), 0 0 14px 3px rgba(201,144,58,.4), 0 0 30px 8px rgba(201,144,58,.2)"
          : highlighted
            ? "0 0 0 1.5px rgba(43,38,34,.45)"
            : selected
              ? "0 0 0 1.5px rgba(43,38,34,.25)"
              : "0 1px 2px rgba(43,38,34,.07)",
        // Earlier sessions stay present as context but never compete with
        // the session actually being viewed.
        opacity: data.dimmed ? 0.25 : 1,
        cursor: readOnly ? "default" : editing ? "text" : "pointer",
        transition: "opacity .4s ease",
        animation: showHalo ? "tc-bloom .9s ease-out both" : highlighted ? "tc-fadeup .3s ease-out both" : undefined,
      }}
      onMouseEnter={() => {
        if (readOnly) return
        setHovered(true)
        if (showHalo) revealPair?.(id)
      }}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={() => {
        if (readOnly) return
        setDraft(data.content)
        setEditing(true)
      }}
    >
      {/* Handles stay mounted even in the read-only historical view —
          React Flow anchors edges to them, so unmounting them silently
          drops every edge on the canvas. Read-only just makes them inert. */}
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={!readOnly}
        style={{
          ...HANDLE_STYLE,
          opacity: !readOnly && hovered ? 1 : 0,
          pointerEvents: readOnly ? "none" : undefined,
          transition: "opacity .15s ease",
        }}
      />
      {editing ? (
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          rows={3}
          className="nodrag w-full resize-none border-none bg-transparent p-0 outline-none"
          style={{ font: "inherit", color: "inherit" }}
        />
      ) : isEmpty ? (
        <div style={{ width: 2, height: 16, background: "rgba(43,38,34,.3)" }} />
      ) : (
        data.content
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
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={!readOnly}
        style={{
          ...HANDLE_STYLE,
          opacity: !readOnly && hovered ? 1 : 0,
          pointerEvents: readOnly ? "none" : undefined,
          transition: "opacity .15s ease",
        }}
      />
    </div>
  )
}
