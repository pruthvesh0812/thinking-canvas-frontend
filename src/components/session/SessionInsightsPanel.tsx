"use client"

import { useSessionStore } from "@/stores/session-store"
import { useCanvasStore } from "@/stores/canvas-store"
import { getSession } from "@/lib/mock-sessions"
import { SessionInsightsContent } from "./SessionInsightsContent"

const SIDEBAR_WIDTH = 380

function ExpandIcon({ collapse }: { collapse?: boolean }) {
  // Corner brackets — outward to expand into the full view, inward to
  // settle back into the dock.
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      {collapse ? (
        <>
          <path d="M12.5 1.5 L8.5 5.5 M8.5 2 V5.5 H12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <path d="M1.5 12.5 L5.5 8.5 M5.5 12 V8.5 H2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M8.5 5.5 L12.5 1.5 M12.5 5 V1.5 H9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <path d="M5.5 8.5 L1.5 12.5 M1.5 9 V12.5 H5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </>
      )}
    </svg>
  )
}

function CornerButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="flex h-[26px] w-[26px] items-center justify-center rounded-md transition-colors hover:bg-black/[.05]"
      style={{ border: "1px solid var(--tc-hairline-strong)", background: "transparent", color: "var(--tc-chrome)" }}
    >
      {children}
    </button>
  )
}

/**
 * One surface, two presentations. A past session opens docked beside the
 * historical canvas; the top-right corner control expands it over the
 * canvas for the fuller read and collapses it back. The width morph plus a
 * content cross-fade is what makes the two read as the same panel rather
 * than two screens.
 */
export function SessionInsightsPanel() {
  const viewedSession = useSessionStore((s) => s.viewedSession)
  const insightsMode = useSessionStore((s) => s.insightsMode)
  const setInsightsMode = useSessionStore((s) => s.setInsightsMode)
  const returnToLive = useSessionStore((s) => s.returnToLive)
  const canvasTitle = useSessionStore((s) => s.canvasTitle)
  const nodeCount = useCanvasStore(
    (s) => s.nodes.filter((n) => n.data.sessionNumber === viewedSession).length,
  )

  if (viewedSession === null) return null
  const session = getSession(viewedSession)
  if (!session) return null

  const full = insightsMode === "full"

  return (
    <aside
      data-testid="session-insights-panel"
      data-mode={insightsMode}
      className="absolute bottom-0 right-0 top-0 z-[14] overflow-hidden"
      style={{
        width: full ? "100%" : SIDEBAR_WIDTH,
        background: "var(--tc-surface)",
        borderLeft: full ? "none" : "1px solid var(--tc-panel-border)",
        boxShadow: full ? "none" : "-2px 0 10px rgba(43,38,34,.05)",
        transition: "width .42s cubic-bezier(.22,.85,.32,1)",
      }}
    >
      <div className="flex h-full flex-col overflow-y-auto">
        <div
          key={insightsMode}
          className={full ? "px-20 py-14" : "px-6 py-7"}
          style={{ animation: "tc-fadeup .32s ease-out both" }}
        >
          <div
            className={`flex items-start justify-between ${full ? "mb-14" : "mb-7"}`}
          >
            <div className="flex flex-col gap-[7px]">
              <span
                style={{
                  fontFamily: "var(--font-tc-hand)",
                  fontSize: full ? 17 : 14,
                  color: "var(--tc-chrome-faint)",
                }}
              >
                session insights
              </span>
              <div
                className={full ? "text-[21px] font-semibold leading-[1.3]" : "text-[14.5px] font-semibold"}
                style={{ color: "var(--tc-ink)" }}
              >
                {full ? `${canvasTitle} — Session ${session.number}` : `Session ${session.number}`}
              </div>
              <div
                className={full ? "text-xs" : "text-[11.5px]"}
                style={{ color: "var(--tc-chrome-faint)" }}
              >
                {session.durationMin} min · {nodeCount} {nodeCount === 1 ? "node" : "nodes"} ·{" "}
                {full ? session.date : session.shortDate}
              </div>
            </div>

            <div className="flex flex-none items-center gap-1.5">
              <CornerButton
                onClick={() => setInsightsMode(full ? "sidebar" : "full")}
                title={full ? "Collapse to sidebar" : "Open full session detail"}
              >
                <ExpandIcon collapse={full} />
              </CornerButton>
              <CornerButton onClick={returnToLive} title="Close — back to the live session">
                <span className="text-[15px] leading-none">×</span>
              </CornerButton>
            </div>
          </div>

          <SessionInsightsContent session={session} mode={insightsMode} />
        </div>
      </div>
    </aside>
  )
}
