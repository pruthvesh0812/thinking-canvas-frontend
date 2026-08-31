import { useEffect, useRef, useState } from "react"
import { useReactFlow } from "@xyflow/react"
import { useCanvasUiStore } from "@/stores/canvas-ui-store"
import { useCanvasStore } from "@/stores/canvas-store"
import { useSessionStore } from "@/stores/session-store"

const USE_MOCK_PERSISTENCE = process.env.NEXT_PUBLIC_USE_MOCK_PERSISTENCE === "true"

// pastSessions is already the whole history in one round trip (fetched at
// hydration — see session-history.ts), so "loading" a page here is just
// revealing more of the array already in memory, not a new fetch.
const PAST_SESSIONS_PAGE_SIZE = 3
const PAST_SESSIONS_MAX_HEIGHT = 240

// Seeded demo threads — only meaningful for the mock Retention canvas
// (its nodes carry these exact ids). Never shown on a real canvas.
const MOCK_THREADS = [
  { id: "t1", target: "n4", icon: "?", text: "Do referral users survive week 2 better than organic signups?", meta: "open question · unanswered" },
  { id: "t2", target: "n6", icon: "?", text: 'Question from "Week-2 usage is almost entirely solo sessions…"', meta: "open question · leads to an empty node" },
  { id: "t3", target: "n6", icon: "⊘", text: "Empty node — top right of the canvas", meta: "nothing written yet" },
]

// Collapsed by default to a thin icon + neutral count; expands only on
// click into a flat list. No resolve/dismiss actions, no urgency styling —
// clicking an item pans to that node (design brief §"Open Threads Rail").
export function OpenThreadsRail() {
  const open = useCanvasUiStore((s) => s.threadsRailOpen)
  const toggle = useCanvasUiStore((s) => s.toggleThreadsRail)
  const setThreadsRailOpen = useCanvasUiStore((s) => s.setThreadsRailOpen)
  const pastSessionsExpanded = useCanvasUiStore((s) => s.pastSessionsExpanded)
  const togglePastSessions = useCanvasUiStore((s) => s.togglePastSessions)
  const nodes = useCanvasStore((s) => s.nodes)
  const setHighlightedNode = useCanvasStore((s) => s.setHighlightedNode)
  const viewSession = useSessionStore((s) => s.viewSession)
  const pastSessions = useSessionStore((s) => s.pastSessions)
  const { setCenter } = useReactFlow()
  // The seeded demo scenario's threads only make sense on the mock
  // Retention canvas, and only while its nodes exist.
  const threads = USE_MOCK_PERSISTENCE
    ? MOCK_THREADS.filter((t) => nodes.some((n) => n.id === t.target))
    : []

  // Reveals PAST_SESSIONS_PAGE_SIZE more rows at a time as the list scrolls,
  // instead of rendering the whole history at once.
  const [visibleCount, setVisibleCount] = useState(PAST_SESSIONS_PAGE_SIZE)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const visibleSessions = pastSessions.slice(0, visibleCount)

  // The sentinel sits on the second-to-last currently-rendered row, so the
  // next page loads just before the human scrolls past the very bottom
  // (e.g. with 6 loaded, reaching the 5th row loads the next 3).
  useEffect(() => {
    if (!pastSessionsExpanded) return
    const root = scrollRef.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((v) => Math.min(v + PAST_SESSIONS_PAGE_SIZE, pastSessions.length))
        }
      },
      { root, threshold: 0.5 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [pastSessionsExpanded, visibleCount, pastSessions.length])

  function jumpTo(targetId: string) {
    const node = nodes.find((n) => n.id === targetId)
    if (node) {
      setCenter(node.position.x + node.width / 2, node.position.y + 40, { zoom: 1, duration: 500 })
      setHighlightedNode(targetId)
      setTimeout(() => setHighlightedNode(null), 1800)
    }
    setThreadsRailOpen(false)
  }

  function openSession(sessionNumber: number) {
    // The insights panel takes over the right side, so the rail steps aside.
    setThreadsRailOpen(false)
    viewSession(sessionNumber)
  }

  function handleTogglePastSessions() {
    // Opening the section always starts back at the first page — a scroll
    // position from a previous open shouldn't carry over. Collapsing leaves
    // it as-is since nothing renders while closed.
    if (!pastSessionsExpanded) setVisibleCount(PAST_SESSIONS_PAGE_SIZE)
    togglePastSessions()
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={toggle}
        title="Open threads"
        className="absolute right-0 top-1/2 z-[8] flex -translate-y-1/2 flex-col items-center gap-1.5 rounded-l-[9px] py-3.5"
        style={{ width: 28, background: "#EDE6D9", border: "1px solid #D5C9B5", borderRight: "none", boxShadow: "-2px 0 8px rgba(43,38,34,.08)" }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <polyline points="8,2 4,6 8,10" stroke="#6A6154" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span
          className="text-[9.5px] font-semibold uppercase"
          style={{ color: "#6A6154", letterSpacing: ".5px", writingMode: "vertical-rl", transform: "rotate(180deg)", lineHeight: 1 }}
        >
          Threads
        </span>
        <span
          className="flex items-center justify-center rounded-full text-[10px] font-bold text-white"
          style={{ minWidth: 16, height: 16, padding: "0 3px", background: "var(--tc-chrome)" }}
        >
          {threads.length}
        </span>
      </button>
    )
  }

  return (
    <div
      className="absolute bottom-0 right-0 top-0 z-[9] flex w-[290px] flex-col gap-1.5 p-4"
      style={{ background: "var(--tc-panel)", borderLeft: "1px solid var(--tc-panel-border)" }}
    >
      <div className="mb-2.5 flex items-start justify-between">
        <div>
          <div className="text-[10px] uppercase" style={{ letterSpacing: ".7px", color: "var(--tc-chrome-quiet)" }}>
            This session
          </div>
          <div className="mt-[3px] text-[13.5px] font-semibold" style={{ color: "var(--tc-ink)" }}>
            Open threads
          </div>
        </div>
        <button
          type="button"
          onClick={toggle}
          className="px-1 py-0.5 text-sm"
          style={{ border: "none", background: "none", color: "var(--tc-chrome-quiet)" }}
        >
          ×
        </button>
      </div>
      {threads.map((t) => (
        <div
          key={t.id}
          onClick={() => jumpTo(t.target)}
          className="flex cursor-pointer gap-2 rounded-lg px-2.5 py-2.5 hover:bg-black/[.045]"
        >
          <span className="flex-none text-xs" style={{ color: "var(--tc-chrome)" }}>
            {t.icon}
          </span>
          <div>
            <div className="text-[12.5px] leading-[1.4]" style={{ color: "#4A4239" }}>
              {t.text}
            </div>
            <div className="mt-0.5 text-[11px]" style={{ color: "var(--tc-chrome-quiet)" }}>
              {t.meta}
            </div>
          </div>
        </div>
      ))}

      <div className="mt-auto pt-2.5" style={{ borderTop: "1px solid rgba(43,38,34,.07)" }}>
        <button
          type="button"
          onClick={handleTogglePastSessions}
          className="flex w-full items-center justify-between py-1.5 hover:opacity-70"
          style={{ background: "none", border: "none", fontFamily: "inherit" }}
        >
          <span
            className="text-[10px] uppercase"
            style={{ letterSpacing: ".6px", color: "var(--tc-chrome-quiet)" }}
          >
            Past sessions · {pastSessions.length}
          </span>
          <span className="text-[11px]" style={{ color: "var(--tc-chrome-quiet)" }}>
            {pastSessionsExpanded ? "▴" : "▾"}
          </span>
        </button>
        {pastSessionsExpanded && (
          <div
            ref={scrollRef}
            className="mt-1.5 flex flex-col gap-0.5 overflow-y-auto"
            style={{ animation: "tc-fadeup .2s ease-out both", maxHeight: PAST_SESSIONS_MAX_HEIGHT }}
          >
            {visibleSessions.map((s, i) => (
              <div
                key={s.id}
                ref={i === visibleSessions.length - 2 ? sentinelRef : undefined}
                data-testid={`past-session-${s.number}`}
                onClick={() => openSession(s.number)}
                className="flex cursor-pointer flex-col gap-[3px] rounded-lg px-2.5 py-2 hover:bg-black/[.04]"
              >
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[12.5px] font-semibold" style={{ color: "var(--tc-ink)" }}>
                    Session {s.number}
                  </span>
                  <span className="text-[10.5px]" style={{ color: "var(--tc-chrome-faint)" }}>
                    {s.date}
                  </span>
                </div>
                <div className="text-[11px]" style={{ color: "var(--tc-chrome-quiet)" }}>
                  {s.durationMin === null ? "unknown length" : `${s.durationMin} min`} · {s.nodeCount} nodes
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
