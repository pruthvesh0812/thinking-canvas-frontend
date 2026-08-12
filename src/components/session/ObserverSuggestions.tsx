"use client"

import { useSessionCompleteStore } from "@/stores/session-complete-store"
import { useSessionLifecycle } from "@/hooks/use-session-lifecycle"
import type { SessionLearning } from "@/types"

const TYPE_LABEL: Record<SessionLearning["type"], string> = {
  contradiction: "⇄ contradiction",
  question: "? open question",
  empty_node: "⊘ empty node",
}

// Screen 1 of Session Complete (SESSION-FLOWS.md). The Observer pass is
// async server-side, so this renders three states in place: loading, a list
// of cards, or "nothing this time" — never a spinner-then-jump-cut.
export function ObserverSuggestions() {
  const suggestions = useSessionCompleteStore((s) => s.observerSuggestions)
  const accepted = useSessionCompleteStore((s) => s.acceptedSuggestionIds)
  const dismissed = useSessionCompleteStore((s) => s.dismissedSuggestionIds)
  const markSuggestionDismissed = useSessionCompleteStore((s) => s.markSuggestionDismissed)
  const goToThreads = useSessionCompleteStore((s) => s.goToThreads)
  const { acceptObserverSuggestion, skipAllSuggestions } = useSessionLifecycle()

  if (suggestions === null) {
    return (
      <div className="flex flex-col items-center gap-3 py-14 text-center">
        <span
          className="text-[13px]"
          style={{ color: "var(--tc-chrome)", animation: "tc-qpulse 1.6s ease-in-out infinite" }}
        >
          The Observer is reading your canvas…
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {suggestions.length === 0 ? (
        <p className="text-[13px] leading-[1.6]" style={{ color: "var(--tc-chrome)" }}>
          No observations this session — sometimes that&rsquo;s exactly right.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {suggestions.map((s) => {
            const isAccepted = accepted.has(s.id)
            const isDismissed = dismissed.has(s.id)
            return (
              <div
                key={s.id}
                className="rounded-[10px] p-3.5"
                style={{
                  background: "var(--tc-node)",
                  border: "1px solid var(--tc-node-border)",
                  opacity: isDismissed ? 0.45 : 1,
                }}
              >
                <div
                  className="mb-1.5 text-[10.5px] uppercase"
                  style={{
                    letterSpacing: ".5px",
                    color: s.type === "contradiction" ? "var(--tc-amber-ink-strong)" : "var(--tc-chrome-quiet)",
                  }}
                >
                  {TYPE_LABEL[s.type] ?? s.type}
                </div>
                <p
                  className="text-[13px] leading-[1.5]"
                  style={{ color: "var(--tc-ink)", textDecoration: isDismissed ? "line-through" : "none" }}
                >
                  {s.content}
                </p>
                {!isAccepted && !isDismissed && (
                  <div className="mt-2.5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => acceptObserverSuggestion(s)}
                      className="rounded-full px-3 py-1 text-[11.5px]"
                      style={{ border: "1px solid rgba(43,38,34,.4)", background: "var(--tc-node)", color: "var(--tc-ink)" }}
                    >
                      ✓ Accept to canvas
                    </button>
                    <button
                      type="button"
                      onClick={() => markSuggestionDismissed(s.id)}
                      className="rounded-full px-3 py-1 text-[11.5px]"
                      style={{ border: "1px solid rgba(43,38,34,.2)", background: "transparent", color: "var(--tc-chrome)" }}
                    >
                      Dismiss
                    </button>
                  </div>
                )}
                {isAccepted && (
                  <div className="mt-2 text-[11px]" style={{ color: "var(--tc-chrome-quiet)" }}>
                    ✓ added to canvas
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      <div className="mt-2 flex justify-end gap-2.5" style={{ borderTop: "1px solid var(--tc-hairline)", paddingTop: 16 }}>
        <button
          type="button"
          onClick={skipAllSuggestions}
          className="rounded-full px-4 py-2 text-[12.5px]"
          style={{ border: "1px solid var(--tc-hairline-strong)", background: "none", color: "#6B6257" }}
        >
          Skip all
        </button>
        <button
          type="button"
          onClick={goToThreads}
          className="rounded-full px-5 py-2 text-[12.5px] font-semibold"
          style={{ border: "none", background: "var(--tc-ink)", color: "#F5F1E8" }}
        >
          Continue →
        </button>
      </div>
    </div>
  )
}
