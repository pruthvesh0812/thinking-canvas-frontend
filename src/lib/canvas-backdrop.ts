import type { CSSProperties } from "react"
import type { CanvasBackdrop } from "@/stores/canvas-ui-store"

// Two offset radial-dot layers stand in for chalk dust — no image asset.
// Shared between the real ReactFlow pane (Canvas.tsx) and the mode-picker's
// swatch preview (BackdropSwitcher.tsx) so the two never drift apart.
const BLACKBOARD_TEXTURE = {
  backgroundImage:
    "radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px), radial-gradient(rgba(255,255,255,.035) 1px, transparent 1px)",
  backgroundSize: "3px 3px, 7px 7px",
  backgroundPosition: "0 0, 2px 3px",
} satisfies CSSProperties

/** The ReactFlow-pane background for a backdrop mode + optional color tint.
 * The tint is universal — it overrides whichever mode's default base color,
 * but never touches the grid dots' or blackboard texture's own overlay. */
export function backdropPaneStyle(backdrop: CanvasBackdrop, color: string | null): CSSProperties {
  if (backdrop === "blackboard") {
    return { backgroundColor: color ?? "var(--tc-blackboard)", ...BLACKBOARD_TEXTURE }
  }
  return { backgroundColor: color ?? "var(--tc-surface)" }
}

function luminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const int = parseInt(m[1], 16)
  const r = ((int >> 16) & 255) / 255
  const g = ((int >> 8) & 255) / 255
  const b = (int & 255) / 255
  // Perceived luminance (ITU-R BT.601) — good enough to pick light vs dark
  // dots, not colorimetrically exact.
  return 0.299 * r + 0.587 * g + 0.114 * b
}

/** Grid dots flip from dark to light once a custom tint gets dark enough to
 * swallow them — same problem the blackboard texture solves with white
 * flecks, just driven by an arbitrary hex instead of one fixed dark base. */
export function gridDotColor(color: string | null): string {
  if (!color) return "rgba(43,38,34,.28)"
  const l = luminance(color)
  if (l === null) return "rgba(43,38,34,.28)"
  return l > 0.55 ? "rgba(43,38,34,.28)" : "rgba(255,255,255,.35)"
}
