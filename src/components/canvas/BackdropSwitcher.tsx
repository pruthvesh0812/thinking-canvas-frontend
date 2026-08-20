import { useCanvasUiStore, type CanvasBackdrop } from "@/stores/canvas-ui-store"
import { backdropPaneStyle, gridDotColor } from "@/lib/canvas-backdrop"

const BACKDROP_OPTIONS: { id: CanvasBackdrop; label: string }[] = [
  { id: "paper", label: "Paper" },
  { id: "grid", label: "Grid" },
  { id: "blackboard", label: "Blackboard" },
]

// Curated presets — deliberately avoids amber/gold: CANVAS-RENDERING.md
// reserves amber for exactly one meaning (the AI intervention), never
// decoration, and a tinted backdrop is pure decoration.
const COLOR_PRESETS: { label: string; value: string }[] = [
  { label: "Sage", value: "#dbe4d6" },
  { label: "Sky", value: "#d9e3ea" },
  { label: "Blush", value: "#f0dfdd" },
  { label: "Slate", value: "#dcdad4" },
  { label: "Charcoal", value: "#2b2f31" },
]

function Swatch({ id, color }: { id: CanvasBackdrop; color: string | null }) {
  if (id === "grid") {
    // SVG shapes paint via the `fill` attribute, not CSS background — the
    // shared helper (background-color/-image) is HTML-only, so the base
    // tone is read straight off the same fallback it uses.
    const base = color ?? "var(--tc-surface)"
    const dot = gridDotColor(color)
    const cx = [4, 9, 14]
    return (
      <svg width="18" height="18" viewBox="0 0 18 18">
        <rect width="18" height="18" fill={base} />
        {cx.flatMap((x) => cx.map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1" fill={dot} />))}
      </svg>
    )
  }
  return <span className="block h-[18px] w-[18px]" style={backdropPaneStyle(id, color)} />
}

// Cosmetic ReactFlow-pane controls — a canvas-chrome preference, not graph
// data, so both live in canvas-ui-store and never touch Supabase. Mirrors
// PenRack's floating-panel treatment so the two read as one control family.
export function BackdropSwitcher() {
  const backdrop = useCanvasUiStore((s) => s.canvasBackdrop)
  const setCanvasBackdrop = useCanvasUiStore((s) => s.setCanvasBackdrop)
  const backdropColor = useCanvasUiStore((s) => s.backdropColor)
  const setBackdropColor = useCanvasUiStore((s) => s.setBackdropColor)

  return (
    <div
      className="pointer-events-auto absolute right-4 top-4 z-[8] flex flex-col gap-1.5 rounded-[10px] p-1.5"
      style={{ background: "var(--tc-panel)", border: "1px solid var(--tc-panel-border)", boxShadow: "0 1px 4px rgba(43,38,34,.05)" }}
    >
      <div className="flex items-center gap-1.5" title="Canvas backdrop">
        {BACKDROP_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setCanvasBackdrop(opt.id)}
            title={opt.label}
            aria-label={opt.label}
            aria-pressed={backdrop === opt.id}
            className="flex cursor-pointer items-center justify-center rounded-[6px] p-0"
            style={{
              width: 26,
              height: 26,
              background: backdrop === opt.id ? "rgba(43,38,34,.07)" : "transparent",
              border: "none",
              outline: backdrop === opt.id ? "1.5px solid rgba(43,38,34,.35)" : "1px solid transparent",
              outlineOffset: 1,
            }}
          >
            <span className="block overflow-hidden rounded-[3px]" style={{ border: "1px solid var(--tc-hairline-strong)" }}>
              <Swatch id={opt.id} color={backdropColor} />
            </span>
          </button>
        ))}
      </div>

      {/* Tint — one color, layered on top of whichever mode is picked above
          (lib/canvas-backdrop.ts). Not per-mode: switching modes keeps it. */}
      <div className="flex items-center gap-1.5 border-t pt-1.5" style={{ borderColor: "var(--tc-panel-border)" }} title="Backdrop color">
        <button
          type="button"
          onClick={() => setBackdropColor(null)}
          title="Default color"
          aria-label="Default color"
          aria-pressed={backdropColor === null}
          className="flex cursor-pointer items-center justify-center rounded-full p-0"
          style={{
            width: 18,
            height: 18,
            background: "var(--tc-node)",
            border: `1.5px solid ${backdropColor === null ? "rgba(43,38,34,.5)" : "var(--tc-hairline-strong)"}`,
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="#a8422e" strokeWidth="1.2" />
          </svg>
        </button>
        {COLOR_PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => setBackdropColor(preset.value)}
            title={preset.label}
            aria-label={preset.label}
            aria-pressed={backdropColor === preset.value}
            className="cursor-pointer rounded-full p-0"
            style={{
              width: 18,
              height: 18,
              background: preset.value,
              border: `1.5px solid ${backdropColor === preset.value ? "rgba(43,38,34,.5)" : "var(--tc-hairline-strong)"}`,
            }}
          />
        ))}
        <label
          title="Custom color"
          className="relative flex cursor-pointer items-center justify-center rounded-full"
          style={{
            width: 18,
            height: 18,
            border: "1.5px solid var(--tc-hairline-strong)",
            background:
              "conic-gradient(from 90deg, #e05252, #e0c052, #7bc47f, #52a9e0, #8a6fd6, #e05252)",
          }}
        >
          <input
            type="color"
            value={backdropColor ?? "#f7f3ec"}
            onChange={(e) => setBackdropColor(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label="Custom backdrop color"
          />
        </label>
      </div>
    </div>
  )
}
