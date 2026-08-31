import { useSessionStore } from "@/stores/session-store"
import { getSession } from "@/lib/mock-sessions"

const USE_MOCK_PERSISTENCE = process.env.NEXT_PUBLIC_USE_MOCK_PERSISTENCE === "true"

// A clear but calm "you are in the past" signal. Paired with the dimmed
// earlier-session nodes and the total absence of live controls, this is what
// makes the historical view unmistakably not a second editable canvas.
export function HistoryBar() {
  const viewedSession = useSessionStore((s) => s.viewedSession)
  const returnToLive = useSessionStore((s) => s.returnToLive)
  const pastSessions = useSessionStore((s) => s.pastSessions)

  if (viewedSession === null) return null
  // Mock mode's only exercise of time-travel today is OpenThreadsRail's
  // seeded "Past sessions" list, keyed to mock-sessions.ts's numbers — keep
  // that path exactly as it was. A real canvas's viewedSession (set from
  // SessionLanding or, once wired, a real OpenThreadsRail) is looked up
  // against session-store's real pastSessions instead — MockSession and
  // PastSessionSummary both expose the `number`/`date` fields this renders.
  const session = USE_MOCK_PERSISTENCE
    ? getSession(viewedSession)
    : pastSessions.find((s) => s.number === viewedSession)
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
