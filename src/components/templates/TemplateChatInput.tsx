"use client"

import { useState } from "react"

// The entry point: a search-bar-style text input pinned bottom-center of the
// canvas viewport. Enter (or Send) submits; the field clears immediately and
// the canvas shows a loading state. No text response, no conversation history —
// every query produces a canvas structure (templates doc, "Chat input").
export function TemplateChatInput({
  onSubmit,
  disabled,
}: {
  onSubmit: (query: string) => void
  disabled: boolean
}) {
  const [value, setValue] = useState("")

  function submit() {
    const q = value.trim()
    if (!q || disabled) return
    setValue("")
    onSubmit(q)
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-4">
      <div
        className="pointer-events-auto flex w-full max-w-[560px] items-center gap-2 rounded-full px-4 py-2"
        style={{
          background: "var(--tc-node)",
          border: "1px solid var(--tc-node-border)",
          boxShadow: "0 6px 20px rgba(43,38,34,.12)",
        }}
      >
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="Ask a question — it becomes a structure on the canvas…"
          aria-label="Ask a question"
          className="flex-1 bg-transparent text-[14px] outline-none"
          style={{ color: "var(--tc-ink)" }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !value.trim()}
          aria-label="Send"
          className="flex items-center justify-center rounded-full text-[13px] font-semibold"
          style={{
            width: 32,
            height: 32,
            border: "none",
            background: "var(--tc-ink)",
            color: "#f5f1e8",
            cursor: disabled || !value.trim() ? "default" : "pointer",
            opacity: disabled || !value.trim() ? 0.4 : 1,
          }}
        >
          ↑
        </button>
      </div>
    </div>
  )
}
