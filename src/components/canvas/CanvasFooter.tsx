import { useRef, useState } from "react"
import { useReactFlow } from "@xyflow/react"
import { hasSessionChanges, useCanvasStore } from "@/stores/canvas-store"
import { useSessionStore } from "@/stores/session-store"
import { useGhostStore } from "@/stores/ghost-store"
import { useSessionLifecycle } from "@/hooks/use-session-lifecycle"

const NOTHING_CHANGED_TOOLTIP =
  "Nothing to close out yet — add or edit a node, or connect an edge, and this unlocks."

// Canvas switcher, "I'm done" (Session Complete), new-node button. No
// floating toolbars over the canvas itself (design brief).
export function CanvasFooter() {
  const canvasId = useSessionStore((s) => s.canvasId)
  const canvasTitle = useSessionStore((s) => s.canvasTitle)
  const setCanvasTitle = useSessionStore((s) => s.setCanvasTitle)
  const addNode = useCanvasStore((s) => s.addNode)
  // Node count/content and edge count/linkage since the session went live
  // (CanvasSessionBaseline) — the only thing "I'm done" cares about.
  // Position/resize/bend edits alone never unlock it.
  const sessionChanged = useCanvasStore((s) => hasSessionChanges(s.nodes, s.edges, s.sessionBaseline))
  const { beginSessionComplete, persistCanvasTitle } = useSessionLifecycle()

  // Double-click to rename — unlike original_intent, the title is ordinary
  // editable metadata (mirrors the canvas card's own inline rename).
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState("")
  const titleInputRef = useRef<HTMLInputElement | null>(null)

  function startEditingTitle() {
    setTitleDraft(canvasTitle)
    setEditingTitle(true)
    requestAnimationFrame(() => titleInputRef.current?.select())
  }

  function commitTitle() {
    setEditingTitle(false)
    const next = titleDraft.trim() || "Untitled"
    if (next === canvasTitle) return
    setCanvasTitle(next)
    if (canvasId) persistCanvasTitle(canvasId, next)
  }
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
        {editingTitle ? (
          <input
            ref={titleInputRef}
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitTitle() }
              if (e.key === "Escape") { e.preventDefault(); setEditingTitle(false) }
            }}
            maxLength={120}
            autoFocus
            className="bg-transparent text-[12.5px] outline-none"
            style={{ color: "#6B6257", border: "none", borderBottom: "1px solid var(--tc-hairline-strong)", width: 140 }}
          />
        ) : (
          <span
            onDoubleClick={startEditingTitle}
            title="Double-click to rename"
            className="cursor-text text-[12.5px]"
            style={{ color: "#6B6257" }}
          >
            {canvasTitle}
          </span>
        )}
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
        // Not a real `disabled` button — a disabled button fires no mouse
        // events in most browsers, which kills the hover tooltip explaining
        // why. Gate the click instead and fake the disabled affordance.
        aria-disabled={!sessionChanged}
        onClick={() => sessionChanged && void beginSessionComplete()}
        className="rounded-full px-[15px] py-1.5 text-[12.5px]"
        style={{
          color: sessionChanged ? "#6B6257" : "var(--tc-chrome-faint)",
          background: "none",
          border: "1px solid var(--tc-hairline-strong)",
          cursor: sessionChanged ? "pointer" : "not-allowed",
          opacity: sessionChanged ? 1 : 0.55,
        }}
        title={sessionChanged ? "Session Complete" : NOTHING_CHANGED_TOOLTIP}
      >
        I&rsquo;m done
      </button>
    </div>
  )
}
