"use client"

import Link from "next/link"
import { useSessionStore } from "@/stores/session-store"

interface SessionLandingProps {
  onContinue: () => void
  onViewSession: (sessionNumber: number) => void
}

// Shown once, on reopening a canvas that has closed session history but
// nothing currently active (SESSION-FLOWS.md's "Session Start: reopening an
// existing canvas") — never on a brand-new canvas (no history yet, straight
// from north-star capture) and never on an already-active resume (nothing to
// decide). See use-canvas-hydration.ts's showSessionLanding for the exact
// gate; CanvasShell renders this in place of <Canvas /> while it applies.
//
// POST /api/session/start has already run by the time this renders — it's
// idempotent per canvas (API-CONTRACT.md), so starting the live session
// eagerly costs nothing even if the human ends up only browsing history
// instead of continuing. "View session N" drops straight into that session's
// existing read-only time-travel view (HistoryBar/viewSession) with the live
// session already underneath — same "← live session" way back the canvas
// already has, not a new mode.
export function SessionLanding({ onContinue, onViewSession }: SessionLandingProps) {
  const originalIntent = useSessionStore((s) => s.originalIntent)
  const canvasTitle = useSessionStore((s) => s.canvasTitle)
  const pastSessions = useSessionStore((s) => s.pastSessions)

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
            onClick={onContinue}
            className="mt-2 self-start rounded-full px-[26px] py-[11px] text-[14.5px] font-semibold"
            style={{ border: "none", cursor: "pointer", background: "var(--tc-ink)", color: "#F5F1E8" }}
          >
            Continue thinking →
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
                  onClick={() => onViewSession(s.number)}
                  className="flex flex-col gap-[3px] rounded-lg px-3.5 py-2.5 text-left transition-colors hover:bg-black/[.03]"
                  style={{ border: "1px solid var(--tc-hairline-strong)", background: "var(--tc-panel)" }}
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
