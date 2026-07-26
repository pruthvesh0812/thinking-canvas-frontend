"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useSessionStore } from "@/stores/session-store"
import { useCanvasStore } from "@/stores/canvas-store"
import { useGhostStore } from "@/stores/ghost-store"

// The product's most sacred input, designed like the first page of a
// notebook, not a form: no other fields, write once, never edited again
// (design brief §2b). Typed text renders solid roman — the human's mark —
// while only the placeholder stays italic/gestural.
export default function NewCanvasPage() {
  const [text, setText] = useState("")
  const router = useRouter()
  const startNewCanvas = useSessionStore((s) => s.startNewCanvas)
  const resetCanvas = useCanvasStore((s) => s.resetToEmpty)
  const resetGhosts = useGhostStore((s) => s.reset)

  const canBegin = text.trim().length > 0

  function begin() {
    if (!canBegin) return
    // TODO(contract-layer): Supabase insert into `canvases` (original_intent
    // write-once) + POST /api/session/start. This pass only seeds client
    // state so the canvas surface renders the typed intent immediately.
    startNewCanvas(text.trim())
    resetCanvas()
    resetGhosts()
    router.push(`/canvas/${crypto.randomUUID()}`)
  }

  return (
    <main className="tc-scope flex min-h-screen flex-col" style={{ background: "var(--tc-surface)" }}>
      <div className="px-10 py-7">
        <Link href="/" className="text-[12.5px]" style={{ color: "var(--tc-chrome-quiet)" }}>
          ← canvases
        </Link>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-10 pb-20">
        <div className="flex w-full max-w-[760px] flex-col gap-[22px]">
          <span style={{ fontFamily: "var(--font-tc-hand)", fontSize: 19, color: "var(--tc-chrome-faint)" }}>
            the first page
          </span>
          <div className="text-[36px] font-semibold leading-[1.3]" style={{ color: "var(--tc-ink)" }}>
            What are you trying to figure out?
          </div>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                begin()
              }
            }}
            placeholder="e.g. Why is our user retention dropping after week 2?"
            rows={2}
            className="w-full resize-none bg-transparent outline-none"
            style={{
              border: "none",
              borderBottom: "1px solid #D8CFBE",
              fontFamily: "var(--font-tc-content)",
              fontSize: 22,
              lineHeight: 1.5,
              color: "var(--tc-ink)",
              padding: "6px 0 14px",
              fontStyle: text.trim() ? "normal" : "italic",
            }}
          />
          <div className="max-w-[560px] text-[12.5px] leading-[1.6]" style={{ color: "var(--tc-chrome-quiet)" }}>
            Write it once. This becomes your canvas&rsquo;s north star — permanent, and never edited again.
          </div>
          <div className="mt-2">
            <button
              type="button"
              onClick={begin}
              disabled={!canBegin}
              className="rounded-full px-[26px] py-[11px] text-[14.5px] font-semibold transition-colors"
              style={{
                border: "none",
                cursor: canBegin ? "pointer" : "default",
                background: canBegin ? "var(--tc-ink)" : "#EFE8D9",
                color: canBegin ? "#F5F1E8" : "var(--tc-chrome-faint)",
              }}
            >
              Begin thinking →
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}
