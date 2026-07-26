import { useSessionStore } from "@/stores/session-store"

// Diverging (Expander territory) / converging (Stress-Tester territory) —
// user flips it manually; user control always wins over the backend's own
// sensed attunement (CORE-CONCEPTS.md).
export function PhaseToggle() {
  const phase = useSessionStore((s) => s.phase)
  const setPhase = useSessionStore((s) => s.setPhase)

  const btn = (key: "diverging" | "converging") => (
    <button
      type="button"
      onClick={() => setPhase(key)}
      className="rounded-full px-3 py-[3px] text-[11.5px]"
      style={{
        border: "none",
        fontFamily: "inherit",
        background: phase === key ? "#F1EBDF" : "transparent",
        color: phase === key ? "var(--tc-ink)" : "var(--tc-chrome-quiet)",
        fontWeight: phase === key ? 600 : 400,
      }}
    >
      {key}
    </button>
  )

  return (
    <div
      className="inline-flex rounded-full p-[2px]"
      style={{ border: "1px solid var(--tc-panel-border)", background: "var(--tc-panel)" }}
    >
      {btn("diverging")}
      {btn("converging")}
    </div>
  )
}
