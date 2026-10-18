"use client"

import { draftKey, noteCount, useContextStore, type FocusTarget } from "@/stores/context-store"
import { openComposer, openPanel, seqLabel, toggleNotesFor } from "@/hooks/use-context-notes"
import { NoteIcon } from "./ContextComposer"

// On the canvas a component shows ONLY a small count badge — never note text
// (§5.5). A dot means an unsaved draft. Clicking opens the context panel on
// that component's notes (clicking again closes it). When the component is
// focused and has no notes yet, the same spot offers "Add context" (§5.2
// "On request").
export function ContextBadge({ target, style }: { target: FocusTarget; style?: React.CSSProperties }) {
  const count = useContextStore((s) => noteCount(s, target.kind, target.id))
  const hasDraft = useContextStore((s) => !!s.drafts[draftKey(target)]?.trim())
  const focused = useContextStore((s) => s.focus?.kind === target.kind && s.focus.id === target.id)
  const composerHere = useContextStore((s) => s.composer?.target.kind === target.kind && s.composer.target.id === target.id)
  const name = target.kind === "node" ? seqLabel(target.id) : "this edge"

  if (count === 0 && !hasDraft) {
    if (!focused || composerHere) return null
    return (
      <button
        type="button"
        className="nodrag nopan flex items-center gap-1 rounded-full px-2 py-[1px] text-[10.5px] font-semibold"
        style={{ border: "1px solid var(--tc-focus)", background: "var(--tc-node)", color: "var(--tc-focus-ink)", cursor: "pointer", ...style }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          openComposer(target, { autoFocus: true })
        }}
      >
        + Add context
      </button>
    )
  }

  return (
    <button
      type="button"
      className="nodrag nopan relative flex items-center gap-1 rounded-full px-1.5 py-[1px] text-[10.5px] font-semibold"
      aria-label={`${count} ${count === 1 ? "note" : "notes"} on ${name}${hasDraft ? ", unsaved draft" : ""} — open notes`}
      title={hasDraft ? "Notes — you have an unsaved draft here" : "Open notes"}
      style={{
        border: `1px solid ${focused ? "var(--tc-focus)" : "var(--tc-node-border)"}`,
        background: "var(--tc-node)",
        color: "#5F574C",
        cursor: "pointer",
        ...style,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        // A draft with no saved notes: reopen the composer to restore it.
        if (count === 0) openComposer(target, { autoFocus: true })
        else toggleNotesFor(target)
      }}
    >
      <NoteIcon size={10} />
      {count}
      {hasDraft && (
        <span
          aria-hidden
          className="absolute -right-[3px] -top-[3px] rounded-full"
          style={{ width: 7, height: 7, background: "var(--tc-focus)", border: "1.5px solid var(--tc-node)" }}
        />
      )}
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
