"use client"

import { useState } from "react"
import Link from "next/link"
import { useSessionStore } from "@/stores/session-store"

interface SessionLandingProps {
  onContinue: () => Promise<void>
  onViewSession: (sessionNumber: number) => Promise<void>
}

// Shown whenever there's session history to decide about but no live
// session established yet — reopening a canvas that has closed history but
// nothing active (SESSION-FLOWS.md's "Session Start: reopening an existing
// canvas"), or Session Complete's "Done" handing off here instead of
// starting the next session itself. Never on a brand-new canvas (no history
// yet, straight from north-star capture) and never on an already-active
// resume (nothing to decide) — see session-store's showSessionLanding doc
// for the exact gate; CanvasShell renders this in place of <Canvas /> while
// it's true.
//
// Neither button has started a session yet when this renders — that's the
// point (session-store.sessionId is null here). "Continue" is the one
// deliberate click that actually calls POST /api/session/start
// (use-session-lifecycle.ts's continueToNewSession). "View session N" does
// the same first, then drops into that session's read-only time-travel view
// (HistoryBar/viewSession) — a live session always sits underneath history
// mode, same "← live session" way back the canvas already has.
export function SessionLanding({ onContinue, onViewSession }: SessionLandingProps) {
  const originalIntent = useSessionStore((s) => s.originalIntent)
  const canvasTitle = useSessionStore((s) => s.canvasTitle)
  const pastSessions = useSessionStore((s) => s.pastSessions)
  const [busy, setBusy] = useState(false)

  async function handleContinue() {
    if (busy) return
    setBusy(true)
    await onContinue()
    // No setBusy(false) on success — showSessionLanding flips false and
    // this component unmounts; resetting here would just flash the button
    // back to its idle state for a frame first. A thrown/rejected promise
    // never reaches here (both handlers log-and-return on failure), so
    // there's no stuck-busy case to guard against either.
  }

  async function handleViewSession(sessionNumber: number) {
    if (busy) return
    setBusy(true)
    await onViewSession(sessionNumber)
  }

  return (
    <main className="tc-scope flex min-h-screen flex-col" style={{ background: "var(--tc-surface)" }}>
      <div className="px-10 py-7">
        <Link href="/" className="text-[12.5px]" style={{ color: "var(--tc-chrome-quiet)" }}>
          ← canvases
        </Link>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-10 pb-20">
        <div className="flex w-full max-w-[560px] flex-col gap-[22px]">
          <span style={{ fontFamily: "var(--font-tc-hand)", fontSize: 19, color: "var(--tc-chrome-faint)" }}>
            welcome back
          </span>
          <div className="text-[28px] font-semibold leading-[1.3]" style={{ color: "var(--tc-ink)" }}>
            {canvasTitle}
          </div>
          <div
            className="text-[17px] leading-[1.5]"
            style={{ fontFamily: "var(--font-tc-hand)", color: "#9C9284" }}
          >
            &ldquo;{originalIntent}&rdquo;
          </div>

          <button
            type="button"
            onClick={() => void handleContinue()}
            disabled={busy}
            className="mt-2 self-start rounded-full px-[26px] py-[11px] text-[14.5px] font-semibold"
            style={{
              border: "none",
              cursor: busy ? "default" : "pointer",
              background: "var(--tc-ink)",
              color: "#F5F1E8",
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? "Opening…" : "Continue thinking →"}
          </button>

          {pastSessions.length > 0 && (
            <div className="mt-6 flex flex-col gap-2">
              <span
                className="text-[11px] uppercase"
                style={{ letterSpacing: ".6px", color: "var(--tc-chrome-quiet)" }}
              >
                Past sessions · {pastSessions.length}
              </span>
              {pastSessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => void handleViewSession(s.number)}
                  disabled={busy}
                  className="flex flex-col gap-[3px] rounded-lg px-3.5 py-2.5 text-left transition-colors hover:bg-black/[.03]"
                  style={{
                    border: "1px solid var(--tc-hairline-strong)",
                    background: "var(--tc-panel)",
                    opacity: busy ? 0.6 : 1,
                    cursor: busy ? "default" : "pointer",
                  }}
                >
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[13px] font-semibold" style={{ color: "var(--tc-ink)" }}>
                      Session {s.number}
                    </span>
                    <span className="text-[11px]" style={{ color: "var(--tc-chrome-faint)" }}>
                      {s.date}
                    </span>
                  </div>
                  <div className="text-[11.5px]" style={{ color: "var(--tc-chrome-quiet)" }}>
                    {s.durationMin != null ? `${s.durationMin} min · ` : ""}
                    {s.nodeCount} {s.nodeCount === 1 ? "node" : "nodes"}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
