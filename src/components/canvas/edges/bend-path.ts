export interface Point {
  x: number
  y: number
}

// Quadratic-bezier control point that makes the curve pass exactly through
// `bend` at t=0.5, rather than merely bulge toward it like a normal control
// point would — B(0.5) = 0.25*S + 0.5*C + 0.25*T, solved for C. Dragging the
// midpoint this way visibly elongates the path (its length grows the further
// the point is pulled off the straight source→target line) instead of just
// tinting a curve that stays a fixed shape.
function bendControlPoint(source: Point, target: Point, bend: Point): Point {
  return {
    x: 2 * bend.x - (source.x + target.x) / 2,
    y: 2 * bend.y - (source.y + target.y) / 2,
  }
}

// SVG path string for an edge bent through `bend`. Used for both the visible
// stroke and the wide invisible hit-path underneath it, so hover/click
// detection always matches what's drawn.
export function bendPath(source: Point, target: Point, bend: Point): string {
  const c = bendControlPoint(source, target, bend)
  return `M${source.x},${source.y} Q${c.x},${c.y} ${target.x},${target.y}`
}

export function straightMidpoint(source: Point, target: Point): Point {
  return { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 }
}

// Unit vector perpendicular to the source→target chord, pointing to the
// "above" side (for a left-to-right edge, that's up). EdgeDeleteButton and
// EdgeBendHandle float along this line rather than a fixed vertical offset,
// so they sit clear of the stroke — not just above/below it on screen — no
// matter which way the edge runs. Exact, not an approximation: for the
// quadratic curve bendPath() draws, the tangent at the bend point (t=0.5) is
// provably T-S regardless of the control point, so "perpendicular to the
// chord" is perpendicular to the actual curve there too.
export function unitNormal(source: Point, target: Point): Point {
  const dx = target.x - source.x
  const dy = target.y - source.y
  const len = Math.hypot(dx, dy) || 1
  return { x: dy / len, y: -dx / len }
}
