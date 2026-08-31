"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useSessionStore } from "@/stores/session-store"
import { useCanvasStore } from "@/stores/canvas-store"
import { useGhostStore } from "@/stores/ghost-store"
import { ensureAnonSession } from "@/lib/auth"
import { supabase } from "@/lib/supabase"
import { logger } from "@/lib/logger"

const USE_MOCK_PERSISTENCE = process.env.NEXT_PUBLIC_USE_MOCK_PERSISTENCE === "true"

// The product's most sacred input, designed like the first page of a
// notebook, not a form: no other fields, write once, never edited again
// (design brief §2b). Typed text renders solid roman — the human's mark —
// while only the placeholder stays italic/gestural.
export default function NewCanvasPage() {
  const [text, setText] = useState("")
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const startNewCanvas = useSessionStore((s) => s.startNewCanvas)
  const resetCanvas = useCanvasStore((s) => s.resetToEmpty)
  const resetGhosts = useGhostStore((s) => s.reset)

  const canBegin = text.trim().length > 0 && !busy

  async function begin() {
    if (!canBegin) return
    const intent = text.trim()
    const canvasName = name.trim()

    // Mock mode: no Supabase — seed client state and open a throwaway id,
    // exactly as before (the canvas surface renders the typed intent and the
    // seeded demo graph is reset away).
    if (USE_MOCK_PERSISTENCE) {
      startNewCanvas(intent, canvasName)
      resetCanvas()
      resetGhosts()
      router.push(`/canvas/${crypto.randomUUID()}`)
      return
    }

    // Real: insert the canvas row (original_intent write-once), then open it.
    // The session is NOT started here — canvas hydration starts one when the
    // canvas opens without an active session (API-CONTRACT.md), so there's a
    // single code path for session creation and no risk of a duplicate.
    setBusy(true)
    setError(null)
    const user = await ensureAnonSession()
    if (!user) {
      setBusy(false)
      setError("Couldn't sign you in. Check your connection and try again.")
      return
    }

    const id = crypto.randomUUID()
    const { error: insertError } = await supabase.from("canvases").insert({
      id,
      original_intent: intent,
      title: canvasName || "Untitled",
      user_id: user.id,
    })
    if (insertError) {
      logger.error("[new-canvas] failed to create canvas", { error: insertError })
      setBusy(false)
      setError("Couldn't create the canvas. Please try again.")
      return
    }

    router.push(`/canvas/${id}`)
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
          {/* Ordinary, editable metadata — unlike original_intent below this
              is never write-once and never the focal point of the page.
              Optional: left blank, the canvas is titled "Untitled" (same
              default the dashboard already shows). */}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name this canvas (optional)"
            maxLength={120}
            className="w-full max-w-[360px] bg-transparent outline-none"
            style={{
              border: "none",
              borderBottom: "1px solid #E6DFD1",
              fontFamily: "var(--font-tc-content)",
              fontSize: 13.5,
              color: "var(--tc-chrome)",
              padding: "2px 0 8px",
              fontStyle: name.trim() ? "normal" : "italic",
            }}
          />
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
          <div className="mt-2 flex items-center gap-4">
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
              {busy ? "Creating…" : "Begin thinking →"}
            </button>
            {error && (
              <span className="text-[12.5px]" style={{ color: "#B4472E" }}>
                {error}
              </span>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
