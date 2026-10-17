"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ViewportPortal, useInternalNode, useReactFlow, useViewport } from "@xyflow/react"
import { useCanvasStore } from "@/stores/canvas-store"
import { draftKey, useContextStore, type FocusTarget } from "@/stores/context-store"
import {
  aimAtNode,
  aimAtSeq,
  closeComposer,
  composerBack,
  enterAllMode,
  saveNote,
  shortcutExplained,
  shortTargetLabel,
  targetLabel,
} from "@/hooks/use-context-notes"
import { useNoteInput } from "@/hooks/use-note-input"
import { useMediaQuery } from "@/hooks/use-media-query"
import { CONTEXT_SETTINGS, SMALL_SCREEN_QUERY } from "@/lib/context-settings"
import { NodeMatchList } from "./NodeMatchList"

// The anchored composer (§5.1): one note input, directly below the focused
// node or at the middle of the focused edge. It lives in flow coordinates
// (ViewportPortal) so it rides along when its component is dragged, and is
// counter-scaled so it stays a readable size at any zoom. It never slides —
// a focus change unmounts it here and mounts it fresh at the new place.
// On a small screen it docks above the on-screen keyboard instead.

const COMPOSER_WIDTH = 300
const POINTER = 7
const GAP_BELOW_NODE = 10
const LINE_PX = 20

export function ContextComposer() {
  const composer = useContextStore((s) => s.composer)
  const small = useMediaQuery(SMALL_SCREEN_QUERY)
  if (!composer) return null
  // key: a new target is a new composer — closes at the old place, opens at
  // the new one; never an animated slide between them.
  return small ? (
    <DockedComposer key={`${composer.target.kind}:${composer.target.id}`} />
  ) : (
    <AnchoredComposer key={`${composer.target.kind}:${composer.target.id}`} target={composer.target} />
  )
}

/** Flow-space point the composer's pointer touches: bottom-centre of a node,
 * the middle of an edge (its bend point if it has one). */
function useAnchor(target: FocusTarget): { x: number; y: number } | null {
  const edge = useCanvasStore((s) => (target.kind === "edge" ? s.edges.find((e) => e.id === target.id) : undefined))
  const node = useInternalNode(target.kind === "node" ? target.id : edge?.source ?? "")
  const other = useInternalNode(edge?.target ?? "")
  if (target.kind === "node") {
    if (!node) return null
    const { x, y } = node.internals.positionAbsolute
    return { x: x + (node.measured.width ?? 0) / 2, y: y + (node.measured.height ?? 0) + GAP_BELOW_NODE }
  }
  if (!edge || !node || !other) return null
  if (edge.bend) return { x: edge.bend.x, y: edge.bend.y + 12 }
  const center = (n: typeof node) => ({
    x: n.internals.positionAbsolute.x + (n.measured.width ?? 0) / 2,
    y: n.internals.positionAbsolute.y + (n.measured.height ?? 0) / 2,
  })
  const a = center(node)
  const b = center(other)
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 12 }
}

function AnchoredComposer({ target }: { target: FocusTarget }) {
  const anchor = useAnchor(target)
  const { zoom } = useViewport()
  const { getViewport, setViewport } = useReactFlow()
  const boxRef = useRef<HTMLDivElement>(null)
  const [shiftX, setShiftX] = useState(0)
  const setComposerSize = useContextStore((s) => s.setComposerSize)
  const openedAt = useContextStore((s) => s.composer?.openedAt)

  // Report the box's screen size — Canvas uses it to move components that
  // would be covered out of the way ("making room").
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setComposerSize({ width: el.offsetWidth, height: el.offsetHeight }))
    ro.observe(el)
    setComposerSize({ width: el.offsetWidth, height: el.offsetHeight })
    return () => ro.disconnect()
  }, [setComposerSize])

  // Staying in view (§5.1): near a side edge the box shifts sideways (its
  // pointer stays on the component); if it would fall below/above the
  // visible area the view scrolls just enough — never a zoom change.
  useLayoutEffect(() => {
    const el = boxRef.current
    const pane = el?.closest(".react-flow")
    if (!el || !pane || !anchor) return
    const r = el.getBoundingClientRect()
    const p = pane.getBoundingClientRect()
    const margin = 12
    const left = r.left - shiftX
    const right = r.right - shiftX
    let nextShift = 0
    if (left < p.left + margin) nextShift = p.left + margin - left
    else if (right > p.right - margin) nextShift = p.right - margin - right
    // Keep the pointer on the box.
    nextShift = Math.max(-(r.width / 2 - 24), Math.min(r.width / 2 - 24, nextShift))
    if (Math.abs(nextShift - shiftX) > 0.5) setShiftX(nextShift)
  }, [anchor, shiftX])

  useEffect(() => {
    // Wait a frame so the box has its real height.
    const raf = requestAnimationFrame(() => {
      const el = boxRef.current
      const pane = el?.closest(".react-flow")
      if (!el || !pane) return
      const r = el.getBoundingClientRect()
      const p = pane.getBoundingClientRect()
      const margin = 16
      let dy = 0
      if (r.bottom > p.bottom - margin) dy = p.bottom - margin - r.bottom
      // The component (above the box) must stay visible too.
      const topNeeded = r.top - 80
      if (topNeeded + dy < p.top + margin) dy = p.top + margin - topNeeded
      let dx = 0
      if (r.left < p.left) dx = p.left + margin - r.left
      else if (r.right > p.right) dx = p.right - margin - r.right
      if (dy !== 0 || dx !== 0) {
        const vp = getViewport()
        void setViewport({ x: vp.x + dx, y: vp.y + dy, zoom: vp.zoom }, { duration: 220 })
      }
    })
    return () => cancelAnimationFrame(raf)
    // Only on open / retarget — not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openedAt, anchor === null])

  if (!anchor) return null
  return (
    <ViewportPortal>
      <div
        className="nodrag nopan nowheel"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: `translate(${anchor.x}px, ${anchor.y}px) scale(${1 / zoom})`,
          transformOrigin: "0 0",
          zIndex: 1000,
          pointerEvents: "all",
        }}
      >
        {/* Pointer toward the component — colour is never the only cue. */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: -POINTER,
            top: 0,
            width: 0,
            height: 0,
            borderLeft: `${POINTER}px solid transparent`,
            borderRight: `${POINTER}px solid transparent`,
            borderBottom: `${POINTER}px solid var(--tc-focus)`,
          }}
        />
        <div
          ref={boxRef}
          style={{
            position: "absolute",
            top: POINTER,
            left: 0,
            width: COMPOSER_WIDTH,
            transform: `translateX(calc(-50% + ${shiftX}px))`,
          }}
        >
          <ComposerBody target={target} />
        </div>
      </div>
    </ViewportPortal>
  )
}

/** Small screens / on-screen keyboard: docked just above the keyboard. The
 * target stays outlined on the canvas and named in the chip (§5.1). */
function DockedComposer() {
  const target = useContextStore((s) => s.composer?.target)
  const [bottom, setBottom] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => setBottom(Math.max(0, window.innerHeight - (vv.height + vv.offsetTop)))
    update()
    vv.addEventListener("resize", update)
    vv.addEventListener("scroll", update)
    return () => {
      vv.removeEventListener("resize", update)
      vv.removeEventListener("scroll", update)
    }
  }, [])
  if (!target) return null
  return createPortal(
    <div className="tc-scope fixed inset-x-0 z-[60] px-3 pb-3" style={{ bottom }}>
      <ComposerBody target={target} />
    </div>,
    document.body,
  )
}

function ComposerBody({ target }: { target: FocusTarget }) {
  const key = draftKey(target)
  const text = useContextStore((s) => s.drafts[key] ?? "")
  const setDraft = useContextStore((s) => s.setDraft)
  const composer = useContextStore((s) => s.composer)
  // Re-render the chip when the node's text or number changes.
  useCanvasStore((s) => (target.kind === "node" ? s.nodes.find((n) => n.id === target.id)?.data.content : s.edges.length))
  useContextStore((s) => s.seqByNode)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const label = targetLabel(target)
  const hasPrevious = composer?.previous !== undefined
  const tooLong = text.trim().length > CONTEXT_SETTINGS.noteMaxChars

  async function save() {
    if (saving || !text.trim()) return
    setSaving(true)
    const result = await saveNote(text, [{ kind: target.kind, id: target.id }], shortTargetLabel(target))
    setSaving(false)
    if (!result.ok) {
      // The draft is kept; offer a retry (§8 "Failure").
      setFailed(true)
      return
    }
    setFailed(false)
    setDraft(key, result.remainder)
    if (!result.remainder) closeComposer()
  }

  const input = useNoteInput({
    text,
    setText: (t) => setDraft(key, t),
    onAimSeq: (seq, rest) => aimAtSeq(seq, rest, { kind: "composer", target }),
    onPickNode: (m, rest) => aimAtNode(m.id, rest, { kind: "composer", target }),
    onAll: (rest) => enterAllMode(rest, target),
    onSave: () => void save(),
    onEscape: () => (hasPrevious ? composerBack() : closeComposer()),
    onBackspaceEmpty: hasPrevious ? composerBack : undefined,
  })

  // Cursor-bearing openings take the caret; following focus on a click
  // doesn't (ComposerState.autoFocus).
  useEffect(() => {
    if (!composer?.autoFocus) return
    const el = textareaRef.current
    if (!el) return
    el.focus({ preventScroll: true })
    el.setSelectionRange(el.value.length, el.value.length)
  }, [composer?.autoFocus, composer?.openedAt])

  // Grows with the text up to [5] lines, then scrolls (§5.1).
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, CONTEXT_SETTINGS.composerMaxLines * LINE_PX + 4)}px`
  }, [text])

  return (
    <div
      role="group"
      aria-label={`Note for ${label}`}
      className="rounded-[10px]"
      style={{
        background: "var(--tc-node)",
        border: "2px solid var(--tc-focus)",
        boxShadow: "0 8px 24px rgba(43,38,34,.16)",
        fontFamily: "var(--font-tc-content)",
      }}
    >
      {/* Screen readers hear where the note will go whenever it changes. */}
      <div aria-live="polite" className="sr-only">
        Writing a note for {label}
      </div>
      <div className="flex items-center gap-2 px-2.5 pt-2">
        <span
          className="inline-flex min-w-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold"
          style={{ background: "var(--tc-focus-soft)", color: "var(--tc-focus-ink)" }}
          title={`This note goes to ${label}`}
        >
          <NoteIcon />
          <span className="truncate">{label}</span>
        </span>
        {hasPrevious && (
          <button
            type="button"
            onClick={composerBack}
            className="text-[11.5px] underline-offset-2 hover:underline"
            style={{ border: "none", background: "none", color: "var(--tc-chrome)", cursor: "pointer" }}
          >
            ← back
          </button>
        )}
        <button
          type="button"
          aria-label="Close note (keeps the draft)"
          onClick={closeComposer}
          className="ml-auto px-1 text-[14px] leading-none"
          style={{ border: "none", background: "none", color: "var(--tc-chrome-quiet)", cursor: "pointer" }}
        >
          ×
        </button>
      </div>
      <div className="relative px-2.5 pt-1.5">
        <textarea
          ref={textareaRef}
          value={text}
          rows={1}
          onChange={input.onChange}
          onKeyDown={input.onKeyDown}
          onSelect={input.onSelect}
          aria-label={`Note for ${label}`}
          aria-describedby="tc-composer-hint"
          placeholder={target.kind === "edge" ? "Why do these connect?" : "Add the why behind this…"}
          className="w-full resize-none border-none bg-transparent p-0 text-[13.5px] outline-none"
          style={{ lineHeight: `${LINE_PX}px`, color: "var(--tc-ink)", overflowY: "auto" }}
        />
        {input.hashOpen && (
          <div className="absolute inset-x-2.5 top-full z-10 mt-1">
            <NodeMatchList matches={input.matches} activeIndex={input.hashIndex} onPick={input.pick} />
          </div>
        )}
      </div>
      {tooLong && (
        <div className="px-2.5 pt-1 text-[11px]" style={{ color: "#a8422e" }}>
          {text.trim().length.toLocaleString()} / {CONTEXT_SETTINGS.noteMaxChars.toLocaleString()} — saving keeps the first{" "}
          {CONTEXT_SETTINGS.noteMaxChars.toLocaleString()} characters; the rest stays here for another note.
        </div>
      )}
      {failed && (
        <div className="flex items-center gap-2 px-2.5 pt-1 text-[11.5px]" style={{ color: "#a8422e" }}>
          Couldn&rsquo;t save. Your note is still here.
          <button
            type="button"
            onClick={() => void save()}
            className="font-semibold underline"
            style={{ border: "none", background: "none", color: "inherit", cursor: "pointer" }}
          >
            Retry
          </button>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 px-2.5 pb-2 pt-1">
        <span id="tc-composer-hint" className="truncate text-[10.5px]" style={{ color: "var(--tc-chrome-quiet)" }}>
          {shortcutExplained() ? "@n2 · #text · /all — Enter saves · Shift+Enter new line · Esc closes" : "Start with @n2 to aim at node 2, #text to find a node, /all for every node"}
        </span>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!text.trim() || saving}
          className="flex-none rounded-md px-2 py-0.5 text-[11.5px] font-semibold"
          style={{
            border: "none",
            background: text.trim() ? "var(--tc-focus)" : "var(--tc-hairline)",
            color: text.trim() ? "#fff" : "var(--tc-chrome-quiet)",
            cursor: text.trim() ? "pointer" : "default",
          }}
        >
          Save note
        </button>
      </div>
    </div>
  )
}

export function NoteIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden>
      <rect x="1.5" y="1.5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3.5 4.5h5M3.5 6.5h5M3.5 8.5h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
}
