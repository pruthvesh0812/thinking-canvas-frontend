"use client"

import { useEffect, useRef, useState } from "react"
import { draftKey, noteCount, notesFor, useContextStore, type FocusTarget } from "@/stores/context-store"
import { closeComposer, openComposer, openPanel, seqLabel, toggleNotesFor } from "@/hooks/use-context-notes"
import { NoteIcon } from "./ContextComposer"

// On the canvas a component shows ONLY a small count badge — never note text
// (§5.5): the note icon and the number. A dot means an unsaved draft. Clicking
// opens the context panel on that component's notes (clicking again closes
// it). The badge is filled while the panel shows this component's notes.
// On an edge's chip only, hovering (or keyboard-focusing) it shows the latest
// note in a small bubble — a peek, never a place to read or edit; the panel is
// for that. A node's badge stays text-free (§5.5).
export function ContextBadge({ target, style, showEmpty }: { target: FocusTarget; style?: React.CSSProperties; showEmpty?: boolean }) {
  const count = useContextStore((s) => noteCount(s, target.kind, target.id))
  const hasDraft = useContextStore((s) => !!s.drafts[draftKey(target)]?.trim())
  const open = useContextStore(
    (s) => s.panel.open && s.panel.tab === "notes" && s.panel.view === "focus" && s.focus?.kind === target.kind && s.focus.id === target.id,
  )
  const name = target.kind === "node" ? seqLabel(target.id) : "this edge"
  const isEdge = target.kind === "edge"
  const latest = useContextStore((s) => notesFor(s, target.kind, target.id)[0]?.content ?? "")
  const [peek, setPeek] = useState(false)
  // Pops when a note is added, not on first render.
  const prevCount = useRef(count)
  const [pop, setPop] = useState(false)
  useEffect(() => {
    if (count > prevCount.current) {
      setPop(true)
      const t = window.setTimeout(() => setPop(false), 400)
      prevCount.current = count
      return () => window.clearTimeout(t)
    }
    prevCount.current = count
  }, [count])

  if (count === 0 && !hasDraft && !showEmpty) return null

  return (
    <button
      type="button"
      data-edge-chip
      onMouseEnter={() => setPeek(isEdge)}
      onMouseLeave={() => setPeek(false)}
      onFocus={() => setPeek(isEdge)}
      onBlur={() => setPeek(false)}
      title={isEdge ? undefined : hasDraft ? "Notes — you have an unsaved draft here" : "Open notes"}
      className={`nodrag nopan relative flex items-center gap-[5px] rounded-full text-[12px] font-bold ${pop ? "tc-pop" : ""}`}
      aria-label={
        count === 0 && !hasDraft
          ? `Add context to ${name}`
          : `${count} ${count === 1 ? "note" : "notes"} on ${name}${hasDraft ? ", unsaved draft" : ""} — open notes`
      }
      aria-pressed={open}
      style={{
        height: 22,
        padding: "0 9px 0 7px",
        border: `1px solid ${open ? "var(--tc-focus)" : "var(--tc-node-border)"}`,
        background: open ? "var(--tc-focus)" : "var(--tc-node)",
        color: open ? "#fff" : "#5F574C",
        boxShadow: "0 1px 2px rgba(43,38,34,.08)",
        cursor: "pointer",
        ...style,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        // The panel has its own note box (sharing the draft), so any box
        // under the component steps away — never two inputs at once.
        closeComposer()
        setPeek(false)
        toggleNotesFor(target)
      }}
    >
      {isEdge && peek && !open && latest && <LatestBubble text={latest} more={count - 1} />}
      {count === 0 && !hasDraft ? (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      ) : (
        <>
          <NoteIcon size={11} />
          {count}
        </>
      )}
      {hasDraft && (
        <span aria-hidden className="rounded-full" style={{ width: 6, height: 6, background: "var(--tc-amber)" }} />
      )}
    </button>
  )
}

/** The bare "+" at a node's bottom-right edge: grows into "Add context" on
 * hover or keyboard focus and opens the note box under the node. Clicking it
 * again closes the box. */
export function AddContextButton({ target }: { target: FocusTarget }) {
  const active = useContextStore((s) => s.composer?.target.kind === target.kind && s.composer.target.id === target.id)
  return (
    <button
      type="button"
      className="tc-add nodrag nopan"
      data-active={active}
      aria-label={`Add context to ${target.kind === "node" ? seqLabel(target.id) : "this edge"}`}
      aria-expanded={active}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        if (active) closeComposer()
        else openComposer(target, { autoFocus: true })
      }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden style={{ flex: "none", marginLeft: -1 }}>
        <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
      <span className="tc-add-label">Add context</span>
    </button>
  )
}

/** The small "?" on an unexplained new edge (§5.6) — opens "Needs you". */
export function EdgeQuestionMark({ edgeId, style }: { edgeId: string; style?: React.CSSProperties }) {
  const queued = useContextStore((s) => s.edgePromptQueue.includes(edgeId))
  if (!queued) return null
  return (
    <button
      type="button"
      aria-label="Why do these connect? Open Needs you"
      title="Why do these connect?"
      className="nodrag nopan flex items-center justify-center rounded-full text-[10.5px] font-bold"
      style={{ width: 16, height: 16, border: "1px solid var(--tc-node-border)", background: "var(--tc-node)", color: "#6A6154", cursor: "pointer", ...style }}
      onClick={(e) => {
        e.stopPropagation()
        openPanel("needs")
      }}
    >
      ?
    </button>
  )
}

// The latest note, in a small rectangular bubble with a caret toward the
// badge. Under a node's corner badge; to the right of an edge's chip (above
// and below it sit the delete button and the bend dot). Never takes the pointer.
function LatestBubble({ text, more }: { text: string; more: number }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute z-30 block text-left"
      style={{
        width: 232,
        padding: "8px 11px",
        borderRadius: 8,
        background: "var(--tc-node)",
        border: "1px solid var(--tc-node-border)",
        boxShadow: "0 6px 18px rgba(43,38,34,.16)",
        color: "var(--tc-ink)",
        fontSize: 12.5,
        fontWeight: 400,
        lineHeight: 1.45,
        left: "calc(100% + 10px)",
        top: "50%",
        transform: "translateY(-50%)",
      }}
    >
      <span
        aria-hidden
        className="absolute"
        style={{
          width: 9,
          height: 9,
          background: "var(--tc-node)",
          transform: "rotate(45deg)",
          left: -5,
          top: "calc(50% - 4px)",
          borderLeft: "1px solid var(--tc-node-border)",
          borderBottom: "1px solid var(--tc-node-border)",
        }}
      />
      <span className="block whitespace-pre-wrap break-words" style={{ display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
        {text}
      </span>
      {more > 0 && (
        <span className="mt-1 block text-[11px]" style={{ color: "var(--tc-chrome-quiet)" }}>
          +{more} more
        </span>
      )}
    </span>
  )
}
