"use client"

import { useState } from "react"
import { useGhostStore, type GhostPairSlot } from "@/stores/ghost-store"
import { GhostControls } from "./GhostControls"
import { RejectionReasonSelector } from "./RejectionReasonSelector"

const REASON_LABEL: Record<string, string> = {
  too_abstract: "Too abstract",
  too_technical: "Too technical",
  skip_for_now: "Skip for now",
  cascaded: "grounding was rejected",
}

export interface GhostNodeCardProps {
  triggerNodeId: string
  slot: GhostPairSlot
  badge: string
  width: number
  minHeight: number
}

// Shared rendering for both ghost pair members — the ghost lifecycle states
// from CANVAS-RENDERING.md: drawing (empty dashed frame) → streaming (token
// fill + caret) → pending (accept/reject on hover) → accepted (settle,
// persistent marker) or rejected (strikethrough + reason).
export function GhostNodeCard({ triggerNodeId, slot, badge, width, minHeight }: GhostNodeCardProps) {
  const [hovered, setHovered] = useState(false)
  const node = useGhostStore((s) => s.pairs[triggerNodeId]?.[slot])
  const showRejected = useGhostStore((s) => s.showRejected)
  const ghostOpacity = 0.47

  if (!node || node.status === "hidden") return null
  if (node.status === "rejected-final" && !showRejected) return null

  if (node.status === "drawing") {
    return (
      <svg width={width} height={minHeight} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        <rect
          x={1}
          y={1}
          width={width - 2}
          height={minHeight - 2}
          rx={10}
          fill="none"
          stroke="rgba(43,38,34,.5)"
          strokeWidth={1.2}
          pathLength={100}
          strokeDasharray={100}
          style={{ animation: "tc-drawon 1.5s linear both" }}
        />
      </svg>
    )
  }

  const rejected = node.status === "rejected-pending-reason" || node.status === "rejected-final"
  const accepted = node.status === "accepted"
  const isPendingReview = node.status === "rejected-pending-reason"

  return (
    // The outer wrapper stays at full opacity — only the card face itself
    // (below) is translucent. Controls and the reason popover are chrome,
    // not AI content, and must never inherit the ghost's translucency
    // (opacity on a parent can't be undone by a child's own opacity).
    <div
      className="nodrag relative"
      style={{ width, minHeight }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="absolute inset-0 rounded-[10px] px-[15px] py-3 text-[14.5px] leading-[1.5]"
        style={{
          boxSizing: "border-box",
          fontStyle: accepted ? "normal" : "italic",
          color: rejected ? "var(--tc-chrome)" : "var(--tc-ink)",
          background: accepted ? "var(--tc-node)" : "rgba(255,253,247,.65)",
          border: accepted ? "1px solid var(--tc-node-border)" : "1px dashed rgba(43,38,34,.5)",
          opacity: accepted ? 1 : ghostOpacity,
          boxShadow: accepted ? "0 1px 2px rgba(43,38,34,.07)" : undefined,
          textDecoration: rejected ? "line-through" : "none",
          animation: accepted ? "tc-settle var(--tc-motion-settle) ease-out" : undefined,
          transition: "opacity .32s ease, background-color .32s ease, box-shadow .32s ease",
        }}
      >
        {node.displayedText}
        {node.status === "streaming" && (
          <span
            className="ml-[2px] inline-block"
            style={{
              width: 2,
              height: 14,
              background: "rgba(43,38,34,.55)",
              verticalAlign: -2,
              animation: "tc-caret 1s step-end infinite",
            }}
          />
        )}
        {node.status === "rejected-final" && showRejected && node.rejectionReason && (
          <div className="mt-[7px] text-[10.5px]" style={{ color: "var(--tc-chrome-quiet)" }}>
            rejected — {REASON_LABEL[node.rejectionReason]}
          </div>
        )}
      </div>

      <div
        className="absolute -top-[22px] left-0 inline-flex items-center gap-1 rounded-full px-[9px] py-[2px] text-[10.5px]"
        style={{
          background: "var(--tc-surface)",
          border: `1px ${accepted ? "solid" : "dashed"} rgba(43,38,34,.4)`,
          color: "var(--tc-chrome)",
          opacity: accepted ? 1 : rejected ? 0 : 0.85,
          textDecoration: rejected ? "line-through" : "none",
          transition: "opacity .5s ease",
        }}
      >
        {rejected ? `${badge} · rejected` : badge}
      </div>
      {accepted && (
        <span
          className="absolute right-[9px] top-[5px] text-xs"
          style={{ color: "var(--tc-chrome-quiet)" }}
          title="AI contribution — accepted"
        >
          ◌
        </span>
      )}

      {node.status === "pending" && hovered && <GhostControls triggerNodeId={triggerNodeId} slot={slot} />}
      {isPendingReview && <RejectionReasonSelector />}
    </div>
  )
}
