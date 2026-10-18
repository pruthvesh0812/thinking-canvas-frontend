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
  openPanel,
  targetLabel,
} from "@/hooks/use-context-notes"
import { useNoteInput } from "@/hooks/use-note-input"
import { useTargetNote } from "@/hooks/use-target-note"
import { useMediaQuery } from "@/hooks/use-media-query"
import { CONTEXT_SETTINGS, SMALL_SCREEN_QUERY } from "@/lib/context-settings"
import { NodeMatchList } from "./NodeMatchList"
import { BadgeRow, NoteBox } from "./NoteBox"
import { edgeCardOffset, handleAnchor } from "@/components/canvas/edges/bend-path"

// The anchored composer (§5.1): one note box. Under a node it is a drawer
// attached to the node's bottom edge, a few px narrower than the node; on an
// edge it is a card with a pointer, just below the edge's middle. It lives in
// flow coordinates (ViewportPortal) so it rides along when its component is
// dragged. A node's drawer scales with the canvas (so it always matches its
// node's width); an edge's card is counter-scaled to stay readable. It
// never slides — a focus change closes it here (a click elsewhere closes it;
// the draft is kept). On a small screen it docks above the on-screen keyboard.

const EDGE_COMPOSER_WIDTH = 300
const NODE_DRAWER_INSET = 4
const POINTER = 7

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

/** Flow-space point the composer hangs from: the bottom-centre of a node
 * (the drawer starts exactly at its bottom edge), the middle of an edge (its
 * bend point if it has one). `nodeWidth` is the node's flow width. */
function useAnchor(target: FocusTarget): { x: number; y: number; nodeWidth: number | null } | null {
  const edge = useCanvasStore((s) => (target.kind === "edge" ? s.edges.find((e) => e.id === target.id) : undefined))
  const node = useInternalNode(target.kind === "node" ? target.id : edge?.source ?? "")
  const other = useInternalNode(edge?.target ?? "")
  if (target.kind === "node") {
    if (!node) return null
    const { x, y } = node.internals.positionAbsolute
    const width = node.measured.width ?? 0
    return { x: x + width / 2, y: y + (node.measured.height ?? 0), nodeWidth: width }
  }
  if (!edge || !node || !other) return null
  const rectOf = (n: typeof node) => ({
    x: n.internals.positionAbsolute.x,
    y: n.internals.positionAbsolute.y,
    width: n.measured.width ?? 0,
    height: n.measured.height ?? 0,
  })
  const a = handleAnchor(rectOf(node), edge.sourceHandle)
  const b = handleAnchor(rectOf(other), edge.targetHandle)
  // Below the edge's delete and bend controls, never on top of them.
  const gap = edgeCardOffset(a, b)
  if (edge.bend) return { x: edge.bend.x, y: edge.bend.y + gap, nodeWidth: null }
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + gap, nodeWidth: null }
}

function AnchoredComposer({ target }: { target: FocusTarget }) {
  const anchor = useAnchor(target)
  const { zoom } = useViewport()
  // A node's drawer is part of the node: it lives in flow space and scales and
  // pans with it, so its width and place stay relative to the node at any
  // zoom. An edge's card is counter-scaled to stay readable.
  const isNode = target.kind === "node"
  const { getViewport, setViewport } = useReactFlow()
  const boxRef = useRef<HTMLDivElement>(null)
  const [shiftX, setShiftX] = useState(0)
  const setComposerSize = useContextStore((s) => s.setComposerSize)
  const openedAt = useContextStore((s) => s.composer?.openedAt)

  // Report the box's screen size — Canvas uses it to move components that
  // would be covered out of the way ("making room"). A node's drawer is laid
  // out in flow px, so it is scaled to screen px here.
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const k = isNode ? zoom : 1
    const report = () => setComposerSize({ width: el.offsetWidth * k, height: el.offsetHeight * k })
    const ro = new ResizeObserver(report)
    ro.observe(el)
    report()
    return () => ro.disconnect()
  }, [setComposerSize, isNode, zoom])

  // Staying in view (§5.1): near a side edge the box shifts sideways (its
  // pointer stays on the component); if it would fall below/above the
  // visible area the view scrolls just enough — never a zoom change.
  useLayoutEffect(() => {
    const el = boxRef.current
    const pane = el?.closest(".react-flow")
    // A node's drawer stays exactly under its node — no sideways shift.
    if (!el || !pane || !anchor || isNode) return
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
  }, [anchor, shiftX, isNode])

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
  const pointer = isNode ? 0 : POINTER
  // Under a node: always the node's own width minus a few px, at any zoom.
  const width = isNode ? Math.max(0, (anchor.nodeWidth ?? 0) - NODE_DRAWER_INSET) : EDGE_COMPOSER_WIDTH
  return (
    <ViewportPortal>
      <div
        className="nodrag nopan nowheel"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: `translate(${anchor.x}px, ${anchor.y}px) scale(${isNode ? 1 : 1 / zoom})`,
          transformOrigin: "0 0",
          zIndex: 1000,
          pointerEvents: "all",
        }}
      >
        {/* Edge only: a pointer toward the edge — colour is never the only
            cue. A node's drawer is attached to it, so it needs none. */}
        {!isNode && (
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
        )}
        <div
          ref={boxRef}
          style={{
            position: "absolute",
            top: pointer,
            left: 0,
            width,
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
  const composer = useContextStore((s) => s.composer)
  // Re-render the label when the node's text or number changes.
  useCanvasStore((s) => (target.kind === "node" ? s.nodes.find((n) => n.id === target.id)?.data.content : s.edges.length))
  useContextStore((s) => s.seqByNode)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const note = useTargetNote(target)
  const isEdge = target.kind === "edge"
  const label = targetLabel(target)
  const hasPrevious = composer?.previous !== undefined

  async function save() {
    if (!(await note.save())) return
    // Only an overflow keeps the box open (the rest is still in it).
    if (useContextStore.getState().drafts[draftKey(target)]) return
    closeComposer()
    // An edge's first note opens its panel — that is where more are added to
    // and read from; clicking the edge again reopens this box.
    if (isEdge) openPanel("notes", "focus")
  }

  const input = useNoteInput({
    text: note.text,
    setText: note.setText,
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

  return (
    <div
      role="group"
      aria-label={`Note for ${label}`}
      className="tc-unfold flex flex-col gap-1"
      style={{
        padding: 4,
        background: "var(--tc-panel)",
        border: "1px solid var(--tc-focus)",
        // Under a node the drawer shares the node's bottom edge, so no top
        // border; an edge's card is closed all round.
        borderTop: isEdge ? "1px solid var(--tc-focus)" : "none",
        borderRadius: isEdge ? 12 : "0 0 11px 11px",
        boxShadow: "0 12px 28px rgba(43,38,34,.12)",
        fontFamily: "var(--font-tc-content)",
      }}
    >
      {/* Screen readers hear where the note will go whenever it changes. */}
      <div aria-live="polite" className="sr-only">
        Writing a note for {label}
      </div>
      <span id="tc-composer-hint" className="sr-only">
        Start with @n2 to aim at node 2, #text to find a node, /all for every node. Enter saves, Shift+Enter starts a new line, Escape closes.
      </span>
      {/* Only when a shortcut aimed the note somewhere else: say where it
          goes, and offer the way back. */}
      {hasPrevious && (
        <div className="flex items-center gap-2 px-1.5 pt-1">
          <span
            className="inline-flex min-w-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold"
            style={{ background: "var(--tc-focus-soft)", color: "var(--tc-focus-ink)" }}
            title={`This note goes to ${label}`}
          >
            <NoteIcon />
            <span className="truncate">{label}</span>
          </span>
          <button
            type="button"
            onClick={composerBack}
            className="text-[11.5px] underline-offset-2 hover:underline"
            style={{ border: "none", background: "none", color: "var(--tc-chrome)", cursor: "pointer" }}
          >
            ← back
          </button>
        </div>
      )}
      <NoteBox
        textareaRef={textareaRef}
        value={note.text}
        onChange={input.onChange}
        onKeyDown={input.onKeyDown}
        onSelect={input.onSelect}
        label={`Note for ${label}`}
        describedBy="tc-composer-hint"
        placeholder={isEdge ? "Why do these connect?" : "Add the why behind this…"}
        onSave={() => void save()}
        canSave={note.canSave}
        maxLines={CONTEXT_SETTINGS.composerMaxLines}
      >
        {input.hashOpen && (
          <div className="absolute inset-x-0 top-full z-10 mt-1">
            <NodeMatchList matches={input.matches} activeIndex={input.hashIndex} onPick={input.pick} />
          </div>
        )}
      </NoteBox>
      {note.tooLong && (
        <div className="px-1.5 text-[11px]" style={{ color: "#a8422e" }}>
          {note.text.trim().length.toLocaleString()} / {CONTEXT_SETTINGS.noteMaxChars.toLocaleString()} — saving keeps the first{" "}
          {CONTEXT_SETTINGS.noteMaxChars.toLocaleString()} characters; the rest stays here for another note.
        </div>
      )}
      {note.failed && (
        <div className="flex items-center gap-2 px-1.5 text-[11.5px]" style={{ color: "#a8422e" }}>
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
      {isEdge && (
        <div className="px-0.5 pb-0.5 pt-1">
          <BadgeRow picked={note.picked} onPick={note.setPicked} />
        </div>
      )}
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
