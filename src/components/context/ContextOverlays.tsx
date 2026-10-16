"use client"

import { useEffect, useState } from "react"
import { ViewportPortal, useViewport } from "@xyflow/react"
import { useContextStore, type RemovalPrompt } from "@/stores/context-store"
import { saveRemovalReason } from "@/hooks/use-context-notes"
import { CONTEXT_SETTINGS } from "@/lib/context-settings"

// "Saved to n2 · Undo" and short notices ("There's no node n9"). Sits just
// above the delete-undo toast slot so the two never cover each other.
export function ContextToasts() {
  const toast = useContextStore((s) => s.toast)
  const clearToast = useContextStore((s) => s.clearToast)
  const notice = useContextStore((s) => s.notice)
  if (!toast && !notice) return null
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[68px] z-[29] flex flex-col items-center gap-2 px-4">
      {notice && (
        <div
          role="status"
          className="max-w-[460px] rounded-lg px-3 py-2 text-center text-[12.5px]"
          style={{ background: "var(--tc-node)", border: "1px solid var(--tc-node-border)", color: "#5F574C", boxShadow: "0 4px 14px rgba(43,38,34,.12)" }}
        >
          {notice}
        </div>
      )}
      {toast && (
        <div
          role="status"
          className="pointer-events-auto flex items-center gap-3.5 rounded-full px-4 py-2 text-[12.5px] shadow-lg"
          style={{ background: "var(--tc-ink)", color: "#f5f1e8" }}
        >
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              type="button"
              onClick={() => {
                toast.undo?.()
                clearToast(toast.id)
              }}
              className="cursor-pointer border-none bg-transparent p-0 font-semibold underline decoration-1 underline-offset-2"
              style={{ color: "inherit" }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// "Why remove this?" (§5.7) — a small, non-blocking prompt where the deleted
// component was, visible ~[10 s] (held while the user is typing in it).
// Ignoring it is fine; any answer is stored against the deleted component.
export function RemovalReasonPrompt() {
  const prompt = useContextStore((s) => s.removalPrompt)
  // A new deletion is a fresh prompt (empty box, fresh timer).
  return prompt ? <RemovalPromptBody key={prompt.shownAt} prompt={prompt} /> : null
}

function RemovalPromptBody({ prompt }: { prompt: RemovalPrompt }) {
  const setPrompt = useContextStore((s) => s.setRemovalPrompt)
  const { zoom } = useViewport()
  const [text, setText] = useState("")
  const [engaged, setEngaged] = useState(false)

  useEffect(() => {
    if (engaged) return
    const t = setTimeout(() => setPrompt(null), CONTEXT_SETTINGS.removalPromptVisibleMs)
    return () => clearTimeout(t)
  }, [engaged, setPrompt])

  return (
    <ViewportPortal>
      <div
        className="nodrag nopan"
        style={{
          position: "absolute",
          transform: `translate(${prompt.position.x}px, ${prompt.position.y}px) scale(${1 / zoom})`,
          transformOrigin: "0 0",
          zIndex: 999,
          pointerEvents: "all",
        }}
      >
        <div
          className="flex items-center gap-2 rounded-lg px-2.5 py-1.5"
          style={{ width: 280, background: "var(--tc-node)", border: "1px dashed var(--tc-node-border)", boxShadow: "0 4px 14px rgba(43,38,34,.12)" }}
        >
          <input
            value={text}
            onFocus={() => setEngaged(true)}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                saveRemovalReason(prompt, text)
              } else if (e.key === "Escape") {
                e.preventDefault()
                setPrompt(null)
              }
            }}
            aria-label={`Why remove ${prompt.label}? (optional)`}
            placeholder={`Why remove ${prompt.label}? (optional)`}
            className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none"
            style={{ border: "none", color: "var(--tc-ink)" }}
          />
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setPrompt(null)}
            className="text-[13px] leading-none"
            style={{ border: "none", background: "none", color: "var(--tc-chrome-quiet)", cursor: "pointer" }}
          >
            ×
          </button>
        </div>
      </div>
    </ViewportPortal>
  )
}
