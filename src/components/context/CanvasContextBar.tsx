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
  toggleNotesFor,
  looksLikeQuestion,
  saveNote,
  showNotice,
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
// colour), a note icon, "Save" (never Send/Ask), no avatar, no typing
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
  // Re-render when system_config has been applied to CONTEXT_SETTINGS.
  useContextStore((s) => s.settingsVersion)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  // First time the bar is seen: a short, dismissible explanation (§5.4).
  const introDismissed = useSyncExternalStore(noSubscribe, barIntroDismissed, () => true)
  const [introClosed, setIntroClosed] = useState(false)
  const introVisible = !introDismissed && !introClosed
  const [expanded, setExpanded] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
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
        {count > 0 && (
          <span className="rounded-full px-1.5 text-[10.5px] font-semibold" style={{ background: "var(--tc-hairline)", color: "#5F574C" }}>
            {count}
          </span>
        )}
      </div>
    )
  }

  const chip = bar.allMode
    ? `Every node (${allCount})`
    : bar.deletedFromLabel
      ? `Draft from deleted ${bar.deletedFromLabel}`
      : null
  const canSave = text.trim().length > 0 && !saving
  const editing = expanded || text.length > 0
  // The explanation lives behind the (i) button; the very first time the bar
  // is seen it opens by itself once, until dismissed (§5.4).
  const showInfo = !small && (infoOpen || introVisible)

  function toggleInfo() {
    if (introVisible) {
      dismissBarIntro()
      setIntroClosed(true)
      setInfoOpen(false)
    } else setInfoOpen((v) => !v)
  }

  return (
    <section aria-label="Canvas context notes" className="flex-none px-[18px] py-2" style={{ background: "var(--tc-surface)" }}>
      {/* About a third of the canvas, centred — it is a note bar, not the
          main thing on screen. Full width on a small screen. */}
      <div className="relative mx-auto" style={{ width: small ? "100%" : "clamp(420px, 35%, 640px)", maxWidth: "100%" }}>
      {showInfo && (
        <div
          role="note"
          className="tc-unfold absolute z-20 w-[320px] rounded-[10px] px-3.5 py-3 text-[12.5px] leading-[1.5]"
          style={{
            right: -38,
            bottom: "calc(100% - 6px)",
            background: "var(--tc-panel)",
            border: "1px solid var(--tc-panel-border)",
            boxShadow: "0 8px 24px rgba(43,38,34,.14)",
            color: "#5F574C",
          }}
        >
          Background about the whole canvas: who it&rsquo;s for, what&rsquo;s being decided, what limits apply. It saves
          notes; it is not a chat and nothing replies. For a note about one node, select the node instead.
          <div className="mt-2 text-right">
            <button
              type="button"
              onClick={() => {
                dismissBarIntro()
                setIntroClosed(true)
                setInfoOpen(false)
              }}
              className="text-[12px] font-semibold"
              style={{ border: "none", background: "none", color: "var(--tc-focus-ink)", cursor: "pointer" }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
      <div
        className="flex flex-wrap items-start gap-x-2 gap-y-1 rounded-[14px] px-2 py-[7px]"
        style={{
          background: "var(--tc-panel)",
          border: `1px solid ${editing ? "var(--tc-chrome-quiet)" : "var(--tc-panel-border)"}`,
          boxShadow: "0 1px 2px rgba(43,38,34,.06), 0 6px 18px rgba(43,38,34,.05)",
          transition: "border-color .16s ease",
        }}
      >
        <button
          type="button"
          onClick={() => toggleNotesFor(null)}
          aria-label={`${count} canvas ${count === 1 ? "note" : "notes"} — open in the context panel`}
          title="Open canvas notes"
          className="flex h-[34px] flex-none items-center gap-1.5 rounded-[9px] px-2 text-[12px] font-semibold"
          style={{ border: "1px solid var(--tc-hairline)", background: "var(--tc-surface-quiet)", color: "#5F574C", cursor: "pointer" }}
        >
          <NoteIcon size={13} />
          {count}
        </button>
        <div className="relative min-w-0 flex-1" style={{ flexBasis: 120 }}>
          {chip && (
            <div className="mb-1 flex items-center gap-2 pt-1 text-[11.5px]">
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
            placeholder={bar.allMode ? "One note, linked to every node…" : "Add canvas background…"}
            className="block w-full resize-none border-none bg-transparent px-1.5 py-[7px] text-[14px] outline-none"
            style={{ lineHeight: `${LINE_PX}px`, color: "var(--tc-ink)", overflowY: "auto" }}
          />
          {input.hashOpen && (
            // Opens upward — the bar sits at the very bottom of the screen.
            <div className="absolute inset-x-0 bottom-full z-20 mb-1">
              <NodeMatchList matches={input.matches} activeIndex={input.hashIndex} onPick={input.pick} />
            </div>
          )}
          {failed && (
            <div className="mt-1 flex items-center gap-2 px-1.5 text-[11.5px]" style={{ color: "#a8422e" }}>
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
            <div className="mt-1 px-1.5 text-[11px]" style={{ color: "#a8422e" }}>
              {text.trim().length.toLocaleString()} / {CONTEXT_SETTINGS.noteMaxChars.toLocaleString()} — saving keeps
              the first {CONTEXT_SETTINGS.noteMaxChars.toLocaleString()} characters; the rest stays here.
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!canSave}
          className="flex-none rounded-[9px] px-4 text-[13.5px] font-semibold"
          style={{
            height: 34,
            border: canSave ? "1px solid var(--tc-ink)" : "1px solid var(--tc-hairline)",
            background: canSave ? "var(--tc-ink)" : "var(--tc-surface-quiet)",
            color: canSave ? "#f5f1e8" : "var(--tc-chrome-quiet)",
            cursor: canSave ? "pointer" : "default",
            transition: "background .16s ease",
          }}
        >
          Save
        </button>
        {!small && editing && (
          <div className="w-full px-2 pb-0.5 text-[11px]" style={{ color: "var(--tc-chrome-quiet)" }}>
            @n2 hands the note to node 2 · #text finds a node · /all writes one note for every node · Enter saves ·
            Shift+Enter new line · Alt+C jumps here
          </div>
        )}
      </div>
        {!small && (
          <button
            type="button"
            onClick={toggleInfo}
            aria-label="What is this bar?"
            aria-expanded={showInfo}
            className="absolute flex h-[30px] w-[30px] items-center justify-center rounded-full"
            style={{ left: "calc(100% + 8px)", top: 11, border: "1px solid var(--tc-hairline-strong)", background: showInfo ? "var(--tc-hairline)" : "transparent", color: "var(--tc-chrome)", cursor: "pointer" }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 7.2v3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="8" cy="5" r=".6" fill="currentColor" />
            </svg>
          </button>
        )}
      </div>
    </section>
  )
}

function noSubscribe() {
  return () => {}
}
