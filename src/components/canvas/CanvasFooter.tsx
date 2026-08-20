import { useReactFlow } from "@xyflow/react"
import { useCanvasStore } from "@/stores/canvas-store"
import { useSessionStore } from "@/stores/session-store"
import { useGhostStore } from "@/stores/ghost-store"

// Canvas switcher, "I'm done" (Session Complete — deferred to
// session-lifecycle), new-node button. No floating toolbars over the
// canvas itself (design brief).
export function CanvasFooter() {
  const canvasTitle = useSessionStore((s) => s.canvasTitle)
  const canvasPosition = useSessionStore((s) => s.canvasPosition)
  const addNode = useCanvasStore((s) => s.addNode)
  const showRejected = useGhostStore((s) => s.showRejected)
  const toggleShowRejected = useGhostStore((s) => s.toggleShowRejected)
  const rejectedCount = useGhostStore((s) =>
    Object.values(s.pairs).reduce(
      (n, p) =>
        n + (p.context.status === "rejected-final" ? 1 : 0) + (p.question?.status === "rejected-final" ? 1 : 0),
      0,
    ),
  )
  const { screenToFlowPosition } = useReactFlow()

  return (
    <div
      className="flex h-[52px] flex-none items-center justify-between px-[18px]"
      style={{ borderTop: "1px solid var(--tc-hairline)" }}
    >
      <div className="flex items-center gap-3">
        <span className="cursor-pointer text-[12.5px]" style={{ color: "#6B6257" }}>
          {canvasTitle} ▾
        </span>
        <span className="text-[11px]" style={{ color: "#C4BBA9" }}>
          {canvasPosition}
        </span>
        <button
          type="button"
          onClick={toggleShowRejected}
          disabled={rejectedCount === 0}
          className="rounded-full px-[11px] py-[3px] text-[11.5px]"
          style={{
            color: showRejected ? "var(--tc-amber-ink-strong)" : "var(--tc-chrome)",
            background: showRejected ? "rgba(201,144,58,.12)" : "transparent",
            border: `1px solid ${showRejected ? "rgba(201,144,58,.4)" : "var(--tc-hairline-strong)"}`,
            cursor: rejectedCount > 0 ? "pointer" : "default",
            opacity: rejectedCount > 0 ? 1 : 0.5,
          }}
        >
          {rejectedCount > 0 ? `${showRejected ? "hide" : "show"} rejected · ${rejectedCount}` : "no rejected yet"}
        </button>
      </div>
      <button
        type="button"
        onClick={() => addNode(screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }))}
        className="rounded-lg px-[13px] py-1.5 text-[12.5px]"
        style={{ color: "#5F574C", background: "none", border: "1px solid var(--tc-hairline-strong)" }}
      >
        + New node
      </button>
      <button
        type="button"
        className="rounded-full px-[15px] py-1.5 text-[12.5px]"
        style={{ color: "#6B6257", background: "none", border: "1px solid var(--tc-hairline-strong)" }}
        title="Session Complete — coming soon"
      >
        I&rsquo;m done
      </button>
    </div>
  )
}
