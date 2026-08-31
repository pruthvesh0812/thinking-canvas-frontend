import { useSessionStore } from "@/stores/session-store"
import { useCanvasUiStore } from "@/stores/canvas-ui-store"
import { PhaseToggle } from "../session/PhaseToggle"

// Fixed, read-only, always visible — the north star, not a form field
// (CANVAS-RENDERING.md). original_intent has no edit affordance anywhere.
export function NorthStarHeader() {
  const originalIntent = useSessionStore((s) => s.originalIntent)
  const sessionNumber = useSessionStore((s) => s.sessionNumber)
  const viewedSession = useSessionStore((s) => s.viewedSession)
  const openPastSessions = useCanvasUiStore((s) => s.openPastSessions)
  const isHistory = viewedSession !== null

  return (
    <div
      className="flex h-14 flex-none items-center justify-between px-5"
      style={{ borderBottom: "1px solid var(--tc-hairline)" }}
    >
      <div className="flex items-baseline gap-3.5">
        <span style={{ fontFamily: "var(--font-tc-hand)", fontSize: 19, color: "var(--tc-chrome-quiet)" }}>
          ThinkingCanvas
        </span>
        <span className="self-center" style={{ width: 1, height: 18, background: "var(--tc-hairline)" }} />
        <span style={{ fontFamily: "var(--font-tc-hand)", fontSize: 15, color: "var(--tc-chrome-faint)" }}>
          north star
        </span>
        <span className="text-[13.5px] font-semibold" style={{ color: "rgba(43,38,34,.85)" }}>
          {originalIntent}
        </span>
      </div>
      {!isHistory && (
        <div className="flex items-center gap-3">
          {/* Shortcut into session history — opens the rail with past
              sessions already expanded. */}
          <button
            type="button"
            onClick={openPastSessions}
            className="-mx-1.5 -my-0.5 rounded px-1.5 py-0.5 text-[11.5px] transition-colors hover:bg-black/[.05]"
            style={{ background: "none", border: "none", fontFamily: "inherit", color: "var(--tc-chrome-quiet)" }}
          >
            Session {sessionNumber} ▾
          </button>
          <PhaseToggle />
        </div>
      )}
    </div>
  )
}
