"use client"

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"
import { useCanvasStore } from "@/stores/canvas-store"
import { noteCount, useContextStore } from "@/stores/context-store"
import {
  aimAtNode,
  aimAtSeq,
  barIntroDismissed,
  dismissBarIntro,
  enterAllMode,
  exitAllMode,
  looksLikeQuestion,
  saveNote,
  showNotice,
  toggleNotesFor,
} from "@/hooks/use-context-notes"
import { useNoteInput } from "@/hooks/use-note-input"
import { useMediaQuery } from "@/hooks/use-media-query"
import { CONTEXT_SETTINGS, SMALL_SCREEN_QUERY } from "@/lib/context-settings"
import { NodeMatchList } from "./NodeMatchList"
import { NoteIcon } from "./ContextComposer"

const LINE_PX = 19

// The canvas context bar (§5.4) — always docked at the bottom of the canvas,
// for notes about the whole canvas. It must never read as an AI chat: a
// permanent "notes" label, a calm neutral look (not the composer's focus
// colour), a note icon, "Save note" (never Send/Ask), no avatar, no typing
// indicator, no reply area. Writing here never changes the focus.
export function CanvasContextBar() {
  const text = useContextStore((s) => s.drafts.canvas ?? "")
  const setDraft = useContextStore((s) => s.setDraft)
  const bar = useContextStore((s) => s.bar)
  const setBar = useContextStore((s) => s.setBar)
  const focusRequest = useContextStore((s) => s.barFocusRequest)
  const count = useContextStore((s) => noteCount(s, "canvas", null))
  const composerOpen = useContextStore((s) => s.composer !== null)
  const liveNodeIds = useCanvasStore((s) => s.nodes.filter((n) => !n.data.setAsideAt).map((n) => n.id).join(","))
  const small = useMediaQuery(SMALL_SCREEN_QUERY)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  // First time the bar is seen: a short, dismissible explanation (§5.4).
  const introDismissed = useSyncExternalStore(noSubscribe, barIntroDismissed, () => true)
  const [introClosed, setIntroClosed] = useState(false)
  const introVisible = !introDismissed && !introClosed
  const [expanded, setExpanded] = useState(false)
  const allCount = liveNodeIds ? liveNodeIds.split(",").length : 0

  useEffect(() => {
    if (focusRequest === 0) return
    requestAnimationFrame(() => {
      const el = textareaRef.current
      el?.focus()
      el?.setSelectionRange(el.value.length, el.value.length)
    })
  }, [focusRequest])

  // A keyboard shortcut moves the cursor into the bar from anywhere (§5.4):
  // Alt/Option + C (pm_handoff.md PM-4). e.code, so Option's "ç" on macOS
  // doesn't hide it.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.altKey && !e.metaKey && !e.ctrlKey && e.code === "KeyC") {
        e.preventDefault()
        useContextStore.getState().requestBarFocus()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    const maxLines = small ? 2 : CONTEXT_SETTINGS.canvasBarMaxLines
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, maxLines * LINE_PX + 4)}px`
  }, [text, small, expanded])

  async function save() {
    if (saving || !text.trim()) return
    setSaving(true)
    const ids = liveNodeIds ? liveNodeIds.split(",") : []
    const result = bar.allMode
      ? await saveNote(text, ids.map((id) => ({ kind: "node" as const, id })), `every node (${ids.length})`)
      : await saveNote(text, [{ kind: "canvas", id: null }], "canvas context")
    setSaving(false)
    if (!result.ok) {
      setFailed(true)
      return
    }
    setFailed(false)
    if (!bar.allMode && looksLikeQuestion(text)) showNotice("Saved as a note. Nothing replies here.")
    setDraft("canvas", result.remainder)
    setBar({ allMode: false, allPrevious: null, deletedFromLabel: result.remainder ? bar.deletedFromLabel : null })
  }

  const input = useNoteInput({
    text,
    setText: (t) => {
      setDraft("canvas", t)
      if (!t.trim() && bar.deletedFromLabel) setBar({ deletedFromLabel: null })
    },
    // @n2 / #text hand the note to the composer under that node (§5.4).
    onAimSeq: (seq, rest) => {
      const ok = aimAtSeq(seq, rest, { kind: "bar" })
      if (ok) setBar({ deletedFromLabel: null })
      return ok
    },
    onPickNode: (m, rest) => {
      aimAtNode(m.id, rest, { kind: "bar" })
      setBar({ deletedFromLabel: null })
    },
    onAll: (rest) => enterAllMode(rest, null),
    onSave: () => void save(),
    onEscape: () => (bar.allMode ? exitAllMode() : textareaRef.current?.blur()),
    onBackspaceEmpty: bar.allMode ? exitAllMode : undefined,
  })

  // Small screen with a composer open: the bar gives way to a one-line strip.
  if (small && composerOpen) {
    return (
      <div
        className="flex h-8 flex-none items-center gap-2 px-3 text-[11.5px]"
        style={{ borderTop: "1px solid var(--tc-hairline)", background: "var(--tc-panel)", color: "var(--tc-chrome)" }}
      >
        <NoteIcon /> Canvas context
        {count > 0 && <CountBadge count={count} />}
      </div>
    )
  }

  const chip = bar.allMode
    ? `Every node (${allCount})`
    : bar.deletedFromLabel
      ? `Draft from deleted ${bar.deletedFromLabel}`
      : null

  return (
    <section
      aria-label="Canvas context notes"
      className="relative flex-none px-[18px] py-2"
      style={{ borderTop: "1px solid var(--tc-hairline)", background: "var(--tc-panel)" }}
    >
      {introVisible && !small && (
        <div
          role="note"
          className="mb-2 flex items-start gap-2 rounded-lg px-3 py-2 text-[12px] leading-[1.45]"
          style={{ background: "var(--tc-surface)", border: "1px solid var(--tc-hairline-strong)", color: "#5F574C" }}
        >
          <span className="flex-1">
            Use this bar for background about the whole canvas — who it&rsquo;s for, what&rsquo;s being decided, what
            limits apply. It saves notes; it is not a chat and nothing replies. For a note about one node, select the
            node instead.
          </span>
          <button
            type="button"
            onClick={() => {
              dismissBarIntro()
              setIntroClosed(true)
            }}
            className="flex-none text-[12px] font-semibold"
            style={{ border: "none", background: "none", color: "var(--tc-chrome)", cursor: "pointer" }}
          >
            Got it
          </button>
        </div>
      )}
      <div className="flex items-start gap-3">
        <div className="flex flex-none items-center gap-1.5 pt-[5px]" style={{ color: "#6B6257" }}>
          <NoteIcon size={13} />
          <div>
            <div className="text-[12px] font-semibold leading-none">Canvas context</div>
            {!small && (
              <div className="mt-1 max-w-[220px] text-[10.5px] leading-[1.35]" style={{ color: "var(--tc-chrome-quiet)" }}>
                Notes about the whole canvas, not about one node. This is not a chat and nothing will reply.
              </div>
            )}
          </div>
          <CountBadge count={count} onClick={() => toggleNotesFor(null)} />
        </div>
        <div className="relative min-w-0 flex-1">
          {chip && (
            <div className="mb-1 flex items-center gap-2 text-[11.5px]">
              <span className="rounded-full px-2 py-0.5 font-semibold" style={{ background: "var(--tc-hairline)", color: "#5F574C" }}>
                {chip}
              </span>
              {bar.allMode && (
                <button
                  type="button"
                  onClick={exitAllMode}
                  className="underline-offset-2 hover:underline"
                  style={{ border: "none", background: "none", color: "var(--tc-chrome)", cursor: "pointer" }}
                >
                  ← back
                </button>
              )}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={text}
            rows={1}
            onChange={input.onChange}
            onKeyDown={input.onKeyDown}
            onSelect={input.onSelect}
            onFocus={() => setExpanded(true)}
            onBlur={() => setExpanded(false)}
            aria-label={bar.allMode ? `Note for every node (${allCount})` : "Canvas context note"}
            placeholder={
              bar.allMode
                ? "One note, linked to every node…"
                : "e.g. This is for the Q3 pricing review — the budget is fixed at $40k."
            }
            className="w-full resize-none rounded-lg px-3 py-[6px] text-[13px] outline-none"
            style={{
              lineHeight: `${LINE_PX}px`,
              background: "var(--tc-node)",
              border: "1px solid var(--tc-hairline-strong)",
              color: "var(--tc-ink)",
              overflowY: "auto",
            }}
          />
          {input.hashOpen && (
            // Opens upward — the bar sits at the very bottom of the screen.
            <div className="absolute inset-x-0 bottom-full z-20 mb-1">
              <NodeMatchList matches={input.matches} activeIndex={input.hashIndex} onPick={input.pick} />
            </div>
          )}
          {failed && (
            <div className="mt-1 flex items-center gap-2 text-[11.5px]" style={{ color: "#a8422e" }}>
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
          {text.trim().length > CONTEXT_SETTINGS.noteMaxChars && (
            <div className="mt-1 text-[11px]" style={{ color: "#a8422e" }}>
              {text.trim().length.toLocaleString()} / {CONTEXT_SETTINGS.noteMaxChars.toLocaleString()} — saving keeps
              the first {CONTEXT_SETTINGS.noteMaxChars.toLocaleString()} characters; the rest stays here.
            </div>
          )}
          {!small && (expanded || text) && (
            <div className="mt-1 text-[10.5px]" style={{ color: "var(--tc-chrome-quiet)" }}>
              @n2 hands the note to node 2 · #text finds a node · /all writes one note for every node · Enter saves ·
              Shift+Enter new line · Alt+C jumps here
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!text.trim() || saving}
          className="mt-[2px] flex-none rounded-lg px-3 py-[6px] text-[12.5px]"
          style={{
            border: "1px solid var(--tc-hairline-strong)",
            background: text.trim() ? "var(--tc-ink)" : "transparent",
            color: text.trim() ? "#f5f1e8" : "var(--tc-chrome-quiet)",
            cursor: text.trim() ? "pointer" : "default",
          }}
        >
          Save note
        </button>
      </div>
    </section>
  )
}

function noSubscribe() {
  return () => {}
}

function CountBadge({ count, onClick }: { count: number; onClick?: () => void }) {
  if (!onClick) {
    return (
      <span className="rounded-full px-1.5 text-[10.5px] font-semibold" style={{ background: "var(--tc-hairline)", color: "#5F574C" }}>
        {count}
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${count} canvas ${count === 1 ? "note" : "notes"} — open in the context panel`}
      title="Open canvas notes"
      className="ml-1 rounded-full px-1.5 text-[10.5px] font-semibold"
      style={{ border: "1px solid var(--tc-hairline-strong)", background: "var(--tc-node)", color: "#5F574C", cursor: "pointer" }}
    >
      {count}
    </button>
  )
}
