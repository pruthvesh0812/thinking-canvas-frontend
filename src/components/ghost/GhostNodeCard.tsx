"use client"

import { useState } from "react"
import { useGhostStore, type GhostPairSlot } from "@/stores/ghost-store"
import { useCanvasPersistence } from "@/hooks/use-canvas-persistence"
import type { RejectionReason } from "@/types"
import { GhostControls } from "./GhostControls"
import { RejectionReasonSelector } from "./RejectionReasonSelector"

export interface GhostNodeCardProps {
  triggerNodeId: string
  slot: GhostPairSlot
  badge: string
  width: number
  minHeight: number
}

// Shared rendering for both ghost pair members — the lifecycle reads
// straight off the real store instead of a per-node status enum: drawing
// (empty dashed frame, before any chunk arrives) → streaming (token fill +
// caret) → pending (accept/reject on hover, once `streamed`) → decided
// (this slot's call is in, waiting on the sibling slot) → gone (the whole
// pair is resolved out of the store once BOTH slots are known — or the
// only one, when there's no question ghost; use-canvas-persistence.ts's
// decideGhost owns that coordination and the real Supabase/API calls).
export function GhostNodeCard({ triggerNodeId, slot, badge, width, minHeight }: GhostNodeCardProps) {
  const [hovered, setHovered] = useState(false)
  // Local: "about to reject, picking a reason" — a pre-decision step, not
  // itself a decision, so it stays out of the store.
  const [choosingReason, setChoosingReason] = useState(false)
  const pair = useGhostStore((s) => s.pairs[triggerNodeId])
  const { decideGhost } = useCanvasPersistence()
  const ghostOpacity = 0.47

  if (!pair) return null

  const text = slot === "context" ? pair.contextText : pair.questionText
  const streamed = pair.streamed
  const drawing = !streamed && text === ""
  // Set once this slot's own accept/reject call is in — the card keeps
  // rendering (read-only) until the sibling slot decides too, since only a
  // still-pending sibling is why the pair hasn't resolved out already.
  const ownDecision = slot === "context" ? pair.contextDecision : pair.questionDecision
  const decided = ownDecision !== undefined
  const rejected = ownDecision === "rejected" || choosingReason
  // Appreciation exception (CORE-CONCEPTS.md): full opacity, no reject
  // button — an observation to acknowledge, not a suggestion to own. Only
  // the context node carries node_type; a question node never exists
  // alongside an appreciation response.
  const appreciation = slot === "context" && pair.nodeType === "appreciation"

  function handleAccept() {
    decideGhost(triggerNodeId, slot, "accepted")
  }

  function handleChooseReason(reason: RejectionReason) {
    setChoosingReason(false)
    decideGhost(triggerNodeId, slot, "rejected", reason)
  }

  if (drawing) {
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
          fontStyle: appreciation ? "normal" : "italic",
          color: rejected ? "var(--tc-chrome)" : "var(--tc-ink)",
          background: appreciation ? "var(--tc-node)" : "rgba(255,253,247,.65)",
          border: appreciation ? "1px solid var(--tc-node-border)" : "1px dashed rgba(43,38,34,.5)",
          opacity: appreciation ? 1 : ghostOpacity,
          boxShadow: appreciation ? "0 1px 2px rgba(43,38,34,.07)" : undefined,
          textDecoration: rejected ? "line-through" : "none",
          transition: "opacity .32s ease, background-color .32s ease, box-shadow .32s ease",
        }}
      >
        {/* Articulator: 2-3 parsed readings inside this one context node —
            no separate question node exists for this agent role. */}
        {slot === "context" && pair.articulations ? (
          <ol className="m-0 flex flex-col gap-1.5 pl-4">
            {pair.articulations.map((reading, i) => (
              <li key={i}>{reading}</li>
            ))}
          </ol>
        ) : (
          text
        )}
        {!streamed && text !== "" && (
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
        {decided && (
          <div className="mt-[7px] text-[10.5px]" style={{ color: "var(--tc-chrome-quiet)" }}>
            {ownDecision} — waiting on the other side of the pair
          </div>
        )}
      </div>

      <div
        className="absolute -top-[22px] left-0 inline-flex items-center gap-1 rounded-full px-[9px] py-[2px] text-[10.5px]"
        style={{
          background: "var(--tc-surface)",
          border: `1px ${appreciation ? "solid" : "dashed"} rgba(43,38,34,.4)`,
          color: "var(--tc-chrome)",
          opacity: choosingReason ? 0 : 0.85,
          transition: "opacity .5s ease",
        }}
      >
        {badge}
      </div>

      {streamed && hovered && !decided && !choosingReason && (
        appreciation ? (
          <div className="absolute left-[2px] top-full mt-2">
            <button
              type="button"
              className="rounded-full px-3 py-1 text-xs"
              style={{ background: "var(--tc-node)", border: "1px solid rgba(43,38,34,.4)", color: "var(--tc-ink)" }}
              onClick={handleAccept}
            >
              ✓ Acknowledge
            </button>
          </div>
        ) : (
          <GhostControls onAccept={handleAccept} onReject={() => setChoosingReason(true)} />
        )
      )}
      {choosingReason && <RejectionReasonSelector onChoose={handleChooseReason} />}
    </div>
  )
}
