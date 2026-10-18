"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useCanvasStore } from "@/stores/canvas-store"
import { useCanvasUiStore } from "@/stores/canvas-ui-store"
import { notesFor, useContextStore, type FocusTarget } from "@/stores/context-store"
import {
  answerEdgePrompt,
  deleteNote,
  dismissEdgePrompt,
  editNote,
  moveNote,
  openComposer,
  searchNodes,
  targetLabel,
} from "@/hooks/use-context-notes"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useTargetNote } from "@/hooks/use-target-note"
import { CONTEXT_SETTINGS, SMALL_SCREEN_QUERY } from "@/lib/context-settings"
import type { ContextEntry } from "@/types"
import { NodeMatchList } from "./NodeMatchList"
import { BadgeRow, NoteBox } from "./NoteBox"

// Quick labels offered on "Why do these connect?" — optional, one tap saves
// them as the note (§5.6; wording is pm_handoff.md PM-8).
const QUICK_LABELS = ["leads to", "depends on", "contradicts"]

// The right-hand context panel (§5.5): reads, edits, moves and deletes notes.
// It shares the right edge with "Needs you" as two tabs. It never opens by
// itself when a note is saved; while open it follows focus.
export function ContextPanel() {
  const panel = useContextStore((s) => s.panel)
  const setPanel = useContextStore((s) => s.setPanel)
  const needsCount = useContextStore((s) => s.edgePromptQueue.length)
  const small = useMediaQuery(SMALL_SCREEN_QUERY)
  const ref = useRef<HTMLElement>(null)
  const threadsOpen = useCanvasUiStore((s) => s.threadsRailOpen)

  // The threads rail and this panel share the right edge — whichever opened
  // last wins.
  useEffect(() => {
    if (threadsOpen) setPanel({ open: false })
  }, [threadsOpen, setPanel])

  useEffect(() => {
    if (!panel.open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return
      const t = e.target as HTMLElement | null
      // Esc inside another input belongs to that input (composer/bar).
      if ((t?.tagName === "TEXTAREA" || t?.tagName === "INPUT") && !ref.current?.contains(t)) return
      setPanel({ open: false })
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [panel.open, setPanel])

  if (!panel.open) {
    // Collapsed: a quiet tab so "Needs you" is reachable without hunting.
    if (needsCount === 0) return null
    return (
      <button
        type="button"
        onClick={() => setPanel({ open: true, tab: "needs" })}
        className="absolute right-0 top-[calc(50%+70px)] z-[8] rounded-l-[9px] px-1.5 py-2.5 text-[10px] font-semibold"
        style={{ background: "#EDE6D9", border: "1px solid #D5C9B5", borderRight: "none", color: "#6A6154", writingMode: "vertical-rl" }}
      >
        Needs you · {needsCount}
      </button>
    )
  }

  return (
    <aside
      ref={ref}
      aria-label="Context panel"
      className={`tc-panel-in z-[12] flex flex-col ${small ? "fixed inset-0" : "absolute bottom-0 right-0 top-0 w-[360px]"}`}
      style={{ background: "var(--tc-panel)", borderLeft: "1px solid var(--tc-panel-border)", boxShadow: "-4px 0 16px rgba(43,38,34,.06)" }}
    >
      <div className="flex items-center gap-1 px-3 pt-3" role="tablist">
        <TabButton active={panel.tab === "notes"} onClick={() => setPanel({ tab: "notes" })}>
          Notes
        </TabButton>
        <TabButton active={panel.tab === "needs"} onClick={() => setPanel({ tab: "needs" })}>
          Needs you{needsCount > 0 ? ` · ${needsCount}` : ""}
        </TabButton>
        <button
          type="button"
          aria-label="Close panel"
          onClick={() => setPanel({ open: false })}
          className="ml-auto px-1.5 text-[16px] leading-none"
          style={{ border: "none", background: "none", color: "var(--tc-chrome-quiet)", cursor: "pointer" }}
        >
          ×
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-2">
        {panel.tab === "notes" ? <NotesTab /> : <NeedsYouTab />}
      </div>
    </aside>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="rounded-md px-2.5 py-1 text-[12.5px]"
      style={{
        border: "none",
        background: active ? "var(--tc-hairline)" : "transparent",
        color: active ? "var(--tc-ink)" : "var(--tc-chrome)",
        fontWeight: active ? 600 : 400,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  )
}

function NotesTab() {
  const focus = useContextStore((s) => s.focus)
  const view = useContextStore((s) => s.panel.view)
  const setPanel = useContextStore((s) => s.setPanel)
  const entries = useContextStore((s) => s.entries)
  const links = useContextStore((s) => s.links)
  // Re-render labels when node text / numbers change.
  useCanvasStore((s) => s.nodes)
  useContextStore((s) => s.seqByNode)

  const shown: FocusTarget | null = view === "canvas" ? null : focus
  const notes = useMemo(
    () => notesFor({ entries, links }, shown ? shown.kind : "canvas", shown ? shown.id : null),
    [entries, links, shown],
  )
  const heading = shown ? targetLabel(shown) : "Canvas context"

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase" style={{ letterSpacing: ".7px", color: "var(--tc-chrome-quiet)" }}>
            Notes on
          </div>
          <div className="truncate text-[13.5px] font-semibold" style={{ color: "var(--tc-ink)" }}>
            {heading}
          </div>
        </div>
        {shown && (
          <button
            type="button"
            onClick={() => setPanel({ view: "canvas" })}
            className="flex-none text-[11.5px] underline-offset-2 hover:underline"
            style={{ border: "none", background: "none", color: "var(--tc-chrome)", cursor: "pointer" }}
          >
            Canvas notes →
          </button>
        )}
      </div>
      {/* A component's notes can be added to right here; the canvas notes
          are written in the bar at the bottom. */}
      {shown && <PanelNoteBox target={shown} />}
      {notes.length === 0 ? (
        <div className="rounded-lg px-3 py-4 text-center text-[12.5px]" style={{ background: "var(--tc-surface)", color: "var(--tc-chrome)" }}>
          {shown ? `No notes on ${heading} yet.` : "No canvas notes yet."}
          {!shown && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => useContextStore.getState().requestBarFocus()}
                className="rounded-md px-2.5 py-1 text-[12px] font-semibold"
                style={{ border: "1px solid var(--tc-hairline-strong)", background: "var(--tc-node)", color: "var(--tc-ink)", cursor: "pointer" }}
              >
                Add context
              </button>
            </div>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {notes.map((n) => (
            <NoteItem key={n.id} note={n} from={shown ? { kind: shown.kind, id: shown.id } : { kind: "canvas", id: null }} linkCount={links.filter((l) => l.entry_id === n.id && l.state === "active").length} />
          ))}
        </ul>
      )}
    </div>
  )
}

// The panel's own note box — same draft, same Save, same edge badges as the
// box under the component, so typing in one shows in the other. Saving keeps
// the panel open and the new note drops into the list below.
function PanelNoteBox({ target }: { target: FocusTarget }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const note = useTargetNote(target)
  const isEdge = target.kind === "edge"
  const label = targetLabel(target)
  return (
    <div className="mb-3 flex flex-col gap-2">
      <NoteBox
        roomy
        textareaRef={textareaRef}
        value={note.text}
        onChange={(e) => note.setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.altKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            void note.save()
          }
        }}
        label={`Add a note to ${label}`}
        placeholder={isEdge ? "Why do these connect?" : "Add background, a source or a constraint…"}
        onSave={() => void note.save()}
        canSave={note.canSave}
        maxLines={CONTEXT_SETTINGS.composerMaxLines}
      />
      {note.tooLong && (
        <div className="text-[11px]" style={{ color: "#a8422e" }}>
          {note.text.trim().length.toLocaleString()} / {CONTEXT_SETTINGS.noteMaxChars.toLocaleString()} — saving keeps the first{" "}
          {CONTEXT_SETTINGS.noteMaxChars.toLocaleString()} characters; the rest stays here for another note.
        </div>
      )}
      {note.failed && (
        <div className="text-[11.5px]" style={{ color: "#a8422e" }}>
          Couldn&rsquo;t save. Your note is still here — try again.
        </div>
      )}
      {isEdge && <BadgeRow picked={note.picked} onPick={note.setPicked} />}
    </div>
  )
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return "just now"
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h ago`
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function NoteItem({
  note,
  from,
  linkCount,
}: {
  note: ContextEntry
  from: { kind: "canvas" | "node" | "edge"; id: string | null }
  linkCount: number
}) {
  const [mode, setMode] = useState<"read" | "edit" | "move">("read")
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)
  const [editText, setEditText] = useState(note.content ?? "")
  const [moveQuery, setMoveQuery] = useState("")
  const [moveIndex, setMoveIndex] = useState(0)
  const textRef = useRef<HTMLDivElement>(null)
  // Re-render when system_config has been applied to CONTEXT_SETTINGS.
  useContextStore((s) => s.settingsVersion)
  const lines = CONTEXT_SETTINGS.panelNoteCollapsedLines

  useLayoutEffect(() => {
    const el = textRef.current
    if (el && !expanded) setOverflowing(el.scrollHeight > el.clientHeight + 1)
  }, [note.content, expanded, mode])

  const matches = mode === "move" ? searchNodes(moveQuery).filter((m) => !(from.kind === "node" && m.id === from.id)) : []

  async function saveEdit() {
    if (await editNote(note.id, editText)) setMode("read")
  }

  return (
    <li className="rounded-lg px-3 py-2.5" style={{ background: "var(--tc-node)", border: "1px solid var(--tc-hairline-strong)" }}>
      {mode === "edit" ? (
        <textarea
          autoFocus
          value={editText}
          maxLength={CONTEXT_SETTINGS.noteMaxChars}
          onChange={(e) => setEditText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
              e.preventDefault()
              void saveEdit()
            } else if (e.key === "Escape") {
              e.preventDefault()
              e.stopPropagation()
              setEditText(note.content ?? "")
              setMode("read")
            }
          }}
          aria-label="Edit note"
          rows={3}
          className="w-full resize-y rounded-md px-2 py-1 text-[13px] outline-none"
          style={{ border: "1px solid var(--tc-focus)", color: "var(--tc-ink)", background: "var(--tc-node)" }}
        />
      ) : (
        <>
          <div
            ref={textRef}
            className="whitespace-pre-wrap break-words text-[13px] leading-[1.45]"
            style={{
              color: "var(--tc-ink)",
              ...(expanded
                ? {}
                : { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" }),
            }}
          >
            {note.content}
          </div>
          {(overflowing || expanded) && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-0.5 text-[11.5px] font-semibold"
              style={{ border: "none", background: "none", color: "var(--tc-chrome)", cursor: "pointer", padding: 0 }}
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]" style={{ color: "var(--tc-chrome-quiet)" }}>
        <span className="rounded px-1 font-semibold" style={{ background: "var(--tc-surface)", color: "#6B6257" }}>
          {note.source === "typed" ? "Typed" : note.source === "spoken" ? "Spoken" : "Attachment"}
        </span>
        <span>You</span>
        <span title={new Date(note.created_at).toLocaleString()}>{relativeTime(note.created_at)}</span>
        {note.updated_at !== note.created_at && <span>· edited</span>}
        {linkCount > 1 && <span>· on {linkCount} nodes</span>}
        {mode === "read" && (
          <span className="ml-auto flex gap-2">
            <ActionLink onClick={() => (setEditText(note.content ?? ""), setMode("edit"))}>Edit</ActionLink>
            <ActionLink onClick={() => (setMoveQuery(""), setMoveIndex(0), setMode("move"))}>Move to</ActionLink>
            <ActionLink danger onClick={() => void deleteNote(note.id)}>
              Delete
            </ActionLink>
          </span>
        )}
        {mode === "edit" && (
          <span className="ml-auto flex gap-2">
            <ActionLink onClick={() => (setEditText(note.content ?? ""), setMode("read"))}>Cancel</ActionLink>
            <ActionLink onClick={() => void saveEdit()}>Save</ActionLink>
          </span>
        )}
      </div>
      {mode === "move" && (
        <div className="mt-2">
          <input
            autoFocus
            value={moveQuery}
            onChange={(e) => {
              setMoveQuery(e.target.value)
              setMoveIndex(0)
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault()
                setMoveIndex((i) => Math.min(i + 1, matches.length - 1))
              } else if (e.key === "ArrowUp") {
                e.preventDefault()
                setMoveIndex((i) => Math.max(i - 1, 0))
              } else if (e.key === "Enter" && matches[moveIndex]) {
                e.preventDefault()
                void moveNote(note.id, from, matches[moveIndex].id)
                setMode("read")
              } else if (e.key === "Escape") {
                e.preventDefault()
                e.stopPropagation()
                setMode("read")
              }
            }}
            aria-label="Find a node to move this note to"
            placeholder="Move to… type to find a node"
            className="mb-1 w-full rounded-md px-2 py-1 text-[12.5px] outline-none"
            style={{ border: "1px solid var(--tc-hairline-strong)", background: "var(--tc-node)", color: "var(--tc-ink)" }}
          />
          <NodeMatchList
            matches={matches}
            activeIndex={moveIndex}
            onPick={(m) => {
              void moveNote(note.id, from, m.id)
              setMode("read")
            }}
          />
          <button
            type="button"
            onClick={() => setMode("read")}
            className="mt-1 text-[11.5px]"
            style={{ border: "none", background: "none", color: "var(--tc-chrome)", cursor: "pointer", padding: 0 }}
          >
            Cancel
          </button>
        </div>
      )}
    </li>
  )
}

function ActionLink({ onClick, children, danger }: { onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:underline"
      style={{ border: "none", background: "none", color: danger ? "#a8422e" : "var(--tc-chrome)", cursor: "pointer", padding: 0 }}
    >
      {children}
    </button>
  )
}

// "Needs you" (§5.6): one "Why do these connect?" item per unexplained new
// edge, batched, at most [3] visible. Answering saves a note on the edge;
// skipping is always allowed and never asks again.
function NeedsYouTab() {
  const queue = useContextStore((s) => s.edgePromptQueue)
  // Re-render when system_config has been applied to CONTEXT_SETTINGS.
  useContextStore((s) => s.settingsVersion)
  const visible = queue.slice(0, CONTEXT_SETTINGS.needsYouMaxVisible)
  const waiting = queue.length - visible.length
  if (queue.length === 0) {
    return (
      <div className="rounded-lg px-3 py-4 text-center text-[12.5px]" style={{ background: "var(--tc-surface)", color: "var(--tc-chrome)" }}>
        Nothing needs you right now.
      </div>
    )
  }
  return (
    <ul className="flex flex-col gap-2">
      {visible.map((edgeId) => (
        <EdgePromptItem key={edgeId} edgeId={edgeId} />
      ))}
      {waiting > 0 && (
        <li className="text-center text-[11.5px]" style={{ color: "var(--tc-chrome-quiet)" }}>
          {waiting} more after these
        </li>
      )}
    </ul>
  )
}

function EdgePromptItem({ edgeId }: { edgeId: string }) {
  const [text, setText] = useState("")
  const [failed, setFailed] = useState(false)
  useContextStore((s) => s.seqByNode)
  // Re-render when system_config has been applied to CONTEXT_SETTINGS.
  useContextStore((s) => s.settingsVersion)
  const label = targetLabel({ kind: "edge", id: edgeId })

  async function answer(value: string) {
    if (!value.trim()) return
    const ok = await answerEdgePrompt(edgeId, value)
    setFailed(!ok)
  }

  return (
    <li className="rounded-lg px-3 py-2.5" style={{ background: "var(--tc-node)", border: "1px solid var(--tc-hairline-strong)" }}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold" style={{ color: "var(--tc-ink)" }}>
          Why do these connect?
        </span>
        <button
          type="button"
          onClick={() => openComposer({ kind: "edge", id: edgeId }, { autoFocus: true })}
          className="text-[11.5px] hover:underline"
          style={{ border: "none", background: "none", color: "var(--tc-chrome)", cursor: "pointer" }}
        >
          {label}
        </button>
      </div>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            void answer(text)
          }
        }}
        aria-label={`Why do ${label} connect?`}
        placeholder="One line is plenty (optional)"
        maxLength={CONTEXT_SETTINGS.noteMaxChars}
        className="mt-1.5 w-full rounded-md px-2 py-1 text-[12.5px] outline-none"
        style={{ border: "1px solid var(--tc-hairline-strong)", background: "var(--tc-node)", color: "var(--tc-ink)" }}
      />
      {failed && (
        <div className="mt-1 text-[11.5px]" style={{ color: "#a8422e" }}>
          Couldn&rsquo;t save — try again.
        </div>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {QUICK_LABELS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => void answer(q)}
            className="rounded-full px-2 py-0.5 text-[11.5px]"
            style={{ border: "1px solid var(--tc-hairline-strong)", background: "var(--tc-surface)", color: "#5F574C", cursor: "pointer" }}
          >
            {q}
          </button>
        ))}
        <button
          type="button"
          onClick={() => dismissEdgePrompt(edgeId)}
          className="ml-auto text-[11.5px] hover:underline"
          style={{ border: "none", background: "none", color: "var(--tc-chrome-quiet)", cursor: "pointer" }}
        >
          Skip
        </button>
      </div>
    </li>
  )
}
