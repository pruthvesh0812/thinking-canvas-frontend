"use client"

import { useLayoutEffect, type KeyboardEvent, type ChangeEvent, type ReactNode, type RefObject, type SyntheticEvent } from "react"
import { EDGE_BADGES } from "@/lib/edge-badges"

const LINE_PX = 20
const MIN_LINES = 2

// The note input shared by the note box under a node/edge and the side
// panel: one text area with "Save" tucked inside its bottom-right corner (so
// there is no footer row), growing with the text up to `maxLines`, then
// scrolling. It never reads as a chat — no send icon, no reply area.
export function NoteBox({
  textareaRef,
  value,
  onChange,
  onKeyDown,
  onSelect,
  label,
  placeholder,
  describedBy,
  onSave,
  canSave,
  maxLines,
  roomy,
  children,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>
  value: string
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void
  onSelect?: (e: SyntheticEvent<HTMLTextAreaElement>) => void
  label: string
  placeholder: string
  describedBy?: string
  onSave: () => void
  canSave: boolean
  maxLines: number
  /** The side panel's slightly larger variant. */
  roomy?: boolean
  /** Overlays anchored to the box (the #node autocomplete list). */
  children?: ReactNode
}) {
  const padTop = roomy ? 12 : 9
  const padBottom = roomy ? 48 : 40
  const chrome = padTop + padBottom + 2

  // Grows with the text up to the cap, then scrolls (§5.1).
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight + 2, maxLines * LINE_PX + chrome)}px`
  }, [value, maxLines, chrome, textareaRef])

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        rows={1}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onSelect={onSelect}
        aria-label={label}
        aria-describedby={describedBy}
        placeholder={placeholder}
        className="block w-full resize-none rounded-lg text-[13.5px] outline-none"
        style={{
          boxSizing: "border-box",
          minHeight: MIN_LINES * LINE_PX + chrome,
          lineHeight: `${LINE_PX}px`,
          padding: `${padTop}px ${roomy ? 14 : 11}px ${padBottom}px`,
          background: "var(--tc-node)",
          border: "1px solid var(--tc-hairline-strong)",
          color: "var(--tc-ink)",
          overflowY: "auto",
        }}
      />
      <button
        type="button"
        onClick={onSave}
        disabled={!canSave}
        className="absolute rounded-lg text-[12.5px] font-semibold"
        style={{
          right: roomy ? 10 : 8,
          bottom: roomy ? 10 : 8,
          height: roomy ? 30 : 28,
          padding: "0 14px",
          border: "none",
          background: canSave ? "var(--tc-ink)" : "var(--tc-hairline)",
          color: canSave ? "#fffefa" : "var(--tc-chrome-quiet)",
          cursor: canSave ? "pointer" : "default",
          transition: "background .16s ease",
        }}
      >
        Save
      </button>
      {children}
    </div>
  )
}

/** One-tap reasons for an edge. Tapping the picked one again clears it. */
export function BadgeRow({ picked, onPick }: { picked: string | null; onPick: (badge: string | null) => void }) {
  return (
    <div role="group" aria-label="Quick reasons" className="flex flex-wrap gap-1.5">
      {EDGE_BADGES.map((b) => {
        const on = picked === b
        return (
          <button
            key={b}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(on ? null : b)}
            className="rounded-full px-[11px] text-[12.5px] font-semibold"
            style={{
              height: 26,
              border: `1px solid ${on ? "#9DB6DC" : "var(--tc-hairline-strong)"}`,
              background: on ? "var(--tc-focus-soft)" : "var(--tc-node)",
              color: on ? "var(--tc-focus-ink)" : "#5F574C",
              cursor: "pointer",
              transition: "background .14s ease, color .14s ease, border-color .14s ease",
            }}
          >
            {b}
          </button>
        )
      })}
    </div>
  )
}
