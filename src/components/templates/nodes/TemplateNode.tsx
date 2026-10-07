"use client"

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { useTemplateStore } from "@/stores/template-store"
import type { TemplateNodeModel } from "@/lib/template-types"

// A single node type drives both templates — the two-layer model lives here:
//   • Handle  (always visible): the short label, for scanning the structure.
//   • Depth   (revealed on click): the detail sentence, for understanding.
// Ghost nodes carry Accept / Dismiss; committed nodes carry an Expand
// affordance. `role` + `kind` carry the per-shape styling differences.
//
// Presentation + local interaction only (create-react-flow-node.md): detail
// toggle, accept, and dismiss go straight to the template store; Expand is a
// backend round-trip, so it's handed down as `onExpand` from the canvas.

export type TemplateFlowData = TemplateNodeModel & {
  /** This committed node is awaiting its expansion response (border pulse). */
  isExpanding: boolean
  onExpand: (id: string) => void
}
export type TemplateFlowNode = Node<TemplateFlowData, "templateNode">

const HANDLE_STYLE = { width: 7, height: 7, background: "var(--tc-node-border)", border: "none", opacity: 0 }

// Per-kind surface tint (longhand `backgroundColor` so it never mixes with the
// shorthand `border` on the node). example's teal left accent is drawn as a
// separate bar element below to avoid shorthand/longhand border conflicts.
function kindBackground(data: TemplateFlowData): string {
  if (data.role === "child" && data.kind === "question") return "#fbf4e6" // amber .06 over surface, pre-blended
  return "var(--tc-node)"
}

export function TemplateNode({ id, data }: NodeProps<TemplateFlowNode>) {
  const toggleDetail = useTemplateStore((s) => s.toggleDetail)
  const acceptNode = useTemplateStore((s) => s.acceptNode)
  const dismissNode = useTemplateStore((s) => s.dismissNode)

  const isGhost = data.isGhost
  const isRoot = data.role === "root"
  const isTitle = data.role === "title"
  const isStep = data.role === "step"
  const isQuestion = data.role === "child" && data.kind === "question"
  const detailOpen = data.isDetailOpen

  function onToggleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      toggleDetail(id)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={detailOpen}
      onClick={() => toggleDetail(id)}
      onKeyDown={onToggleKey}
      className="group relative box-border rounded-[10px] text-left transition-all"
      style={{
        width: 170,
        maxWidth: 180,
        padding: "10px 12px",
        backgroundColor: kindBackground(data),
        color: "var(--tc-ink)",
        overflow: "hidden",
        // Root reads stronger (1.5px); children/steps are quiet (0.5px). Ghosts
        // are dashed + reduced opacity until accepted.
        border: isGhost
          ? "2px dashed var(--tc-node-border)"
          : `${isRoot ? 1.5 : 0.5}px solid var(--tc-node-border)`,
        opacity: isGhost ? 0.65 : 1,
        cursor: "pointer",
        boxShadow: data.isExpanding ? "0 0 0 2px rgba(201,144,58,.5)" : "0 1px 2px rgba(43,38,34,.06)",
        animation: data.isExpanding
          ? "tc-qpulse var(--tc-motion-shimmer) ease-in-out infinite"
          : "tc-fadeup .2s ease-out both",
      }}
    >
      {/* example kind → a teal left-edge accent bar (drawn, not a border, to
          avoid shorthand/longhand border conflicts). */}
      {data.role === "child" && data.kind === "example" && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-0 h-full"
          style={{ width: 3, background: "#2f9e8f", borderTopLeftRadius: 9, borderBottomLeftRadius: 9 }}
        />
      )}
      {/* Deterministic handles (t/b/l/r) — edges name the pair they attach to
          (template-layout.ts). Invisible; they exist only to anchor edges and
          to let the user re-wire if desired. */}
      <Handle id="t" type="target" position={Position.Top} style={HANDLE_STYLE} />
      <Handle id="b" type="source" position={Position.Bottom} style={HANDLE_STYLE} />
      <Handle id="l" type="target" position={Position.Left} style={HANDLE_STYLE} />
      <Handle id="r" type="source" position={Position.Right} style={HANDLE_STYLE} />

      {/* Top-left marker: step number (sequence) — title and hierarchy get
          none. */}
      {isStep && data.order != null && (
        <span
          className="mb-1 inline-flex items-center justify-center rounded-full text-[10px] font-semibold"
          style={{ width: 17, height: 17, background: "var(--tc-ink)", color: "#f5f1e8" }}
        >
          {data.order}
        </span>
      )}

      {/* Handle layer — the label (max ~8 words). Title reads muted, as a label
          for the whole flow. */}
      <div
        className="leading-[1.35]"
        style={{
          fontSize: isRoot ? 15 : 14,
          fontWeight: 500,
          color: isTitle ? "var(--tc-chrome)" : "var(--tc-ink)",
          fontStyle: isTitle ? "italic" : "normal",
        }}
      >
        {data.label}
        {isQuestion && <span style={{ fontSize: 18, fontWeight: 600 }}> ?</span>}
      </div>

      {/* Depth layer — animated reveal of the detail sentence. grid-rows trick
          gives a smooth 0→auto height transition. */}
      <div
        className="grid transition-all duration-200 ease-out"
        style={{ gridTemplateRows: detailOpen ? "1fr" : "0fr", opacity: detailOpen ? 1 : 0 }}
      >
        <div className="overflow-hidden">
          <div className="my-2" style={{ height: 1, background: "var(--tc-hairline)" }} />
          <div className="text-[13px] leading-[1.45]" style={{ color: "var(--tc-chrome)" }}>
            {data.detail}
          </div>
        </div>
      </div>

      {/* Chevron toggle indicator — rotates with the open/closed state. */}
      <div className="mt-1 flex justify-end" aria-hidden="true">
        <svg
          width="11"
          height="11"
          viewBox="0 0 10 10"
          style={{ transform: detailOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .2s ease", opacity: 0.5 }}
        >
          <path d="M2 3.5 L5 6.5 L8 3.5" fill="none" stroke="var(--tc-chrome)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Ghost controls — per-node Accept / Dismiss. Clicks stop propagation so
          they don't also toggle the detail. */}
      {isGhost && (
        <div className="mt-1.5 flex gap-1.5 border-t pt-1.5" style={{ borderColor: "var(--tc-hairline)" }}>
          <button
            type="button"
            aria-label="Accept"
            onClick={(e) => {
              e.stopPropagation()
              acceptNode(id)
            }}
            className="nodrag flex flex-1 items-center justify-center gap-1 rounded-[6px] py-1 text-[11.5px] font-semibold hover:brightness-95"
            style={{ border: "none", background: "var(--tc-ink)", color: "#f5f1e8", cursor: "pointer" }}
          >
            ✓ Accept
          </button>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={(e) => {
              e.stopPropagation()
              dismissNode(id)
            }}
            className="nodrag flex items-center justify-center rounded-[6px] px-2 py-1 text-[11.5px] hover:bg-black/[.04]"
            style={{ border: "1px solid var(--tc-hairline-strong)", background: "transparent", color: "#6b6257", cursor: "pointer" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Expand affordance — committed nodes only, fades in on hover at the
          bottom-center. Sends this node's context to the backend. */}
      {!isGhost && (
        <button
          type="button"
          aria-label="Expand this node"
          onClick={(e) => {
            e.stopPropagation()
            data.onExpand(id)
          }}
          className="nodrag absolute left-1/2 flex items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100"
          style={{
            bottom: -11,
            transform: "translateX(-50%)",
            width: 22,
            height: 22,
            border: "1px solid var(--tc-node-border)",
            background: "var(--tc-node)",
            color: "var(--tc-chrome)",
            boxShadow: "0 1px 3px rgba(43,38,34,.12)",
            cursor: "pointer",
            fontSize: 15,
            lineHeight: 1,
          }}
        >
          +
        </button>
      )}
    </div>
  )
}
