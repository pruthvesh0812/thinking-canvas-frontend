// Ghost width is fixed (matches GhostContextNode/GhostQuestionNode's own
// card width props) — only position floats, relative to the trigger node so
// concurrent pairs on different nodes never collide (GHOST-STREAMING.md:
// "positioned floating near the trigger node"). Shared by Canvas.tsx (where
// the pending ghost renders) and use-canvas-persistence.ts (which plants
// the accepted real node at the same spot, so acceptance reads as a settle
// rather than a jump — CANVAS-RENDERING.md's ghost→real transition).
export const GHOST_WIDTH = { context: 280, question: 250 }
const GHOST_GAP_X = 60
const GHOST_GAP_Y = 150

type NodeShape = { position: { x: number; y: number }; width: number; height?: number }

export function ghostPositions(trigger: NodeShape | undefined) {
  // No trigger row found (shouldn't happen — a spawn always names a real
  // node) falls back to the old demo's fixed spot rather than stacking at
  // the origin.
  const base = trigger?.position ?? { x: 470, y: 480 }
  const x = base.x + (trigger?.width ?? 260) + GHOST_GAP_X
  return {
    context: { x, y: base.y },
    question: { x, y: base.y + GHOST_GAP_Y },
  }
}

// The geometric midpoint between two endpoints' centers — the anchor point
// a `relate` edge's diamond conceptually sits at. Canvas.tsx plants a
// purely decorative RelateAnchorNode here (see RelateAnchorNode.tsx) marking
// where the rest-state diamond sat; the ghost's actual drop-lines run from
// both endpoint nodes straight to the ghost card, not from this point.
// Kept as its own export (not inlined into ghostPositionsFromEdge) so the
// anchor node and the ghost card position are both derived from the
// identical calculation — they'd drift apart silently if each
// rounded/computed the midpoint its own way.
export function relateAnchorPosition(endpoints: [NodeShape, NodeShape]): { x: number; y: number } {
  const [a, b] = endpoints
  const x = (a.position.x + a.width / 2 + b.position.x + b.width / 2) / 2
  // Between the tops of the two nodes — good enough given node heights
  // vary; the ghost still gaps well below either one either way.
  const y = (a.position.y + b.position.y) / 2
  return { x, y }
}

// Edge-triggered variant for the `relate` gesture — the ghost hangs BELOW
// the edge's midpoint (relateAnchorPosition), not next to either endpoint,
// matching the image spec (dashed drop-line from the edge's mid-diamond to
// the ghost card).
export function ghostPositionsFromEdge(endpoints: [NodeShape, NodeShape] | undefined) {
  if (!endpoints) return ghostPositions(undefined)
  const mid = relateAnchorPosition(endpoints)
  const x = mid.x - GHOST_WIDTH.context / 2
  return {
    context: { x, y: mid.y + GHOST_GAP_Y },
    question: { x: x + 30, y: mid.y + GHOST_GAP_Y * 1.6 },
  }
}
