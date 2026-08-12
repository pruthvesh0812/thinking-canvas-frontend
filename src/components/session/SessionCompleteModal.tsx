"use client"

import { useSessionCompleteStore } from "@/stores/session-complete-store"
import { useSessionLifecycle } from "@/hooks/use-session-lifecycle"
import { ObserverSuggestions } from "./ObserverSuggestions"
import { UnresolvedThreads } from "./UnresolvedThreads"

const TITLE = {
  observer: "What the Observer noticed",
  threads: "Unresolved threads",
  closed: "Session closed",
} as const

// The one true modal in the product (SESSION-FLOWS.md — "the most
// significant UI moment in a session, a distinct modal flow, not an inline
// panel"). A backdrop, not a popover: deliberate and blocking, unlike every
// other canvas affordance.
export function SessionCompleteModal() {
  const open = useSessionCompleteStore((s) => s.open)
  const screen = useSessionCompleteStore((s) => s.screen)
  const starting = useSessionCompleteStore((s) => s.starting)
  const carryCount = useSessionCompleteStore(
    (s) => Object.values(s.choices).filter((c) => c === "carry").length,
  )
  const reset = useSessionCompleteStore((s) => s.reset)
  const { startNewSession } = useSessionLifecycle()

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[50] flex items-center justify-center p-6"
      style={{ background: "rgba(43,38,34,.4)", animation: "tc-fadeup .2s ease-out both" }}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[14px]"
        style={{ background: "var(--tc-panel)", border: "1px solid var(--tc-panel-border)", boxShadow: "0 20px 60px rgba(43,38,34,.25)" }}
      >
        <div
          className="flex flex-none items-center justify-between px-7 pb-4 pt-6"
          style={{ borderBottom: "1px solid var(--tc-hairline)" }}
        >
          <div className="flex flex-col gap-1">
            <span style={{ fontFamily: "var(--font-tc-hand)", fontSize: 15, color: "var(--tc-chrome-faint)" }}>
              session complete
            </span>
            <span className="text-[15px] font-semibold" style={{ color: "var(--tc-ink)" }}>
              {TITLE[screen]}
            </span>
          </div>
          {screen !== "closed" && (
            <button
              type="button"
              onClick={reset}
              title="Close"
              aria-label="Close"
              className="px-1.5 py-1 text-base"
              style={{ border: "none", background: "none", color: "var(--tc-chrome-quiet)" }}
            >
              ×
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-7 py-6">
          {screen === "observer" && <ObserverSuggestions />}
          {screen === "threads" && <UnresolvedThreads />}
          {screen === "closed" && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <span className="text-[34px]" style={{ color: "var(--tc-chrome)" }}>
                ✓
              </span>
              <p className="max-w-[380px] text-[13.5px] leading-[1.6]" style={{ color: "var(--tc-chrome)" }}>
                This session is closed. Your north star stays exactly as you wrote it —{" "}
                {carryCount > 0
                  ? `${carryCount} carried ${carryCount === 1 ? "item" : "items"} will open with the new session.`
                  : "nothing to carry forward this time."}
              </p>
              <button
                type="button"
                onClick={() => void startNewSession()}
                disabled={starting}
                className="rounded-full px-6 py-2.5 text-[13.5px] font-semibold"
                style={{ border: "none", background: "var(--tc-ink)", color: "#F5F1E8", opacity: starting ? 0.6 : 1 }}
              >
                {starting ? "Starting…" : "Start new session →"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
