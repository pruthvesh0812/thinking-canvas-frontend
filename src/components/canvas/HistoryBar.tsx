import { useSessionStore } from "@/stores/session-store"
import { getSession } from "@/lib/mock-sessions"

// A clear but calm "you are in the past" signal. Paired with the dimmed
// earlier-session nodes and the total absence of live controls, this is what
// makes the historical view unmistakably not a second editable canvas.
export function HistoryBar() {
  const viewedSession = useSessionStore((s) => s.viewedSession)
  const returnToLive = useSessionStore((s) => s.returnToLive)

  if (viewedSession === null) return null
  const session = getSession(viewedSession)
  if (!session) return null

  return (
    <div
      className="flex h-9 flex-none items-center justify-between px-5"
      style={{ background: "#EDE8DC", borderBottom: "1px solid #DDD5C6" }}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={returnToLive}
          className="text-xs hover:underline"
          style={{ background: "none", border: "none", fontFamily: "inherit", color: "var(--tc-amber-ink)" }}
        >
          ← live session
        </button>
        <span style={{ width: 1, height: 14, background: "#DDD5C6" }} />
        <span className="text-xs" style={{ color: "var(--tc-chrome)" }}>
          viewing <strong className="font-semibold">Session {session.number}</strong> · {session.date}
        </span>
      </div>
      <span
        className="text-[10.5px] uppercase"
        style={{ letterSpacing: ".5px", color: "var(--tc-chrome-quiet)" }}
      >
        read-only
      </span>
    </div>
  )
}
