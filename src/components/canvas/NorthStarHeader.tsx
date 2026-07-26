import { useSessionStore } from "@/stores/session-store"
import { PhaseToggle } from "./PhaseToggle"

// Fixed, read-only, always visible — the north star, not a form field
// (CANVAS-RENDERING.md). original_intent has no edit affordance anywhere.
export function NorthStarHeader() {
  const originalIntent = useSessionStore((s) => s.originalIntent)
  const sessionNumber = useSessionStore((s) => s.sessionNumber)

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
      <div className="flex items-center gap-3">
        <span className="text-[11.5px]" style={{ color: "var(--tc-chrome-quiet)" }}>
          Session {sessionNumber}
        </span>
        <PhaseToggle />
      </div>
    </div>
  )
}
