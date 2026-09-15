import { useCanvasUiStore } from "@/stores/canvas-ui-store"
import type { HumanEdgeType } from "@/stores/canvas-store"

// The pen rack: pick a pen before you drag — the connection line renders
// live in that style, no popover after release
// (the design's signature edge-creation interaction).
export function PenRack() {
  const activePen = useCanvasUiStore((s) => s.activePen)
  const setActivePen = useCanvasUiStore((s) => s.setActivePen)

  const row = (pen: HumanEdgeType, label: string, preview: React.ReactNode) => (
    <div
      onClick={() => setActivePen(pen)}
      className="flex cursor-pointer items-center gap-2 rounded-[7px] px-[9px] py-[7px] text-xs"
      style={{
        background: activePen === pen ? "rgba(43,38,34,.07)" : "transparent",
        color: activePen === pen ? "var(--tc-ink)" : "var(--tc-chrome)",
        fontWeight: activePen === pen ? 600 : 400,
      }}
    >
      {preview}
      <span>{label}</span>
    </div>
  )

  return (
    <div
      className="pointer-events-auto absolute bottom-4 left-[18px] z-[8] rounded-[10px] p-1.5"
      style={{ background: "var(--tc-panel)", border: "1px solid var(--tc-panel-border)", boxShadow: "0 1px 4px rgba(43,38,34,.05)" }}
      title="Pick a pen before you drag — the line draws live in this style."
    >
      {row(
        "logical",
        "Logical",
        <svg width="34" height="10" viewBox="0 0 34 10">
          <line x1="1" y1="5" x2="26" y2="5" stroke="#6A6154" strokeWidth="1.5" />
          <path d="M26 1.5 L32 5 L26 8.5 z" fill="#6A6154" />
        </svg>,
      )}
      {row(
        "question",
        "Question",
        <span className="relative inline-block" style={{ width: 34, height: 10 }}>
          <svg width="34" height="10" viewBox="0 0 34 10" style={{ position: "absolute", left: 0, top: 0 }}>
            <line x1="1" y1="5" x2="32" y2="5" stroke="#6A6154" strokeWidth="1.5" />
            <path d="M26 1.5 L32 5 L26 8.5 z" fill="#6A6154" />
          </svg>
          <span
            className="absolute flex items-center justify-center rounded-[3px] text-[5.4px] font-bold"
            style={{ left: 11, top: 1, width: 8, height: 9, background: "var(--tc-surface)", color: "#6A6154", lineHeight: 1 }}
          >
            Q
          </span>
        </span>,
      )}
    </div>
  )
}
