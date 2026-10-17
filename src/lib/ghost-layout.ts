// Ghost width is fixed (matches GhostContextNode/GhostQuestionNode's own
// card width props) — only position floats. Shared by Canvas.tsx (where the
// pending ghost renders) and use-canvas-persistence.ts (which plants the
// accepted real node at the same spot, so acceptance reads as a settle
// rather than a jump — CANVAS-RENDERING.md's ghost→real transition).
export const GHOST_WIDTH = { context: 280, question: 250 }
const GHOST_GAP_X = 60 // human -> context, and context -> question
const GHOST_GAP_Y = 150 // relate case only: how far below the edge midpoint the pair starts

// GhostNodeCard's card is in-flow, not fixed height — it grows with however
// much text streamed into it (a contradiction/pattern observation can run to
// a whole paragraph). Estimate the rendered height from the text instead of
// guessing at one fixed number, so the collision math below (obstacle
// avoidance) has a realistic box to work with. Verified against the app's
// actual CSS in a live DOM measurement: 346 chars measured 263.25px, this
// estimates 263.3px.
const CARD_SIDE_PADDING = 30 // GhostNodeCard/HumanNode's px-[15px], each side
const CARD_CHARS_PER_LINE_DIVISOR = 7.6 // ~14.5px text, empirically measured
const CARD_LINE_HEIGHT = 21.75 // 14.5px font * 1.5 leading
const CARD_PADDING_Y = 24 // py-3, top + bottom
const CARD_MIN_HEIGHT = 90 // matches GhostContextNode/HumanNode's own floor

export function estimateCardHeight(text: string, width: number): number {
  if (!text) return CARD_MIN_HEIGHT
  const contentWidth = Math.max(1, width - CARD_SIDE_PADDING)
  const charsPerLine = Math.max(1, Math.floor(contentWidth / CARD_CHARS_PER_LINE_DIVISOR))
  const lines = text
    .split("\n")
    .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / charsPerLine)), 0)
  return Math.max(CARD_MIN_HEIGHT, lines * CARD_LINE_HEIGHT + CARD_PADDING_Y)
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

// A ghost card's own chrome extends past its text box: the badge floats
// above (-22px, GhostNodeCard) and the accept/reject row hangs below
// (`top-full mt-2`, GhostControls) — both outside the card's own div. Fold
// that into the box used for collision checks so a neighboring node can't
// land where the controls actually render, even though it wouldn't
// technically overlap the text card itself.
const CARD_TOP_CHROME = 26
const CARD_BOTTOM_CHROME = 48

export function ghostCardRect(x: number, y: number, width: number, text: string): Rect {
  const height = estimateCardHeight(text, width)
  return { x, y: y - CARD_TOP_CHROME, width, height: height + CARD_TOP_CHROME + CARD_BOTTOM_CHROME }
}

// A real node's own footprint — no chrome margin (it has no floating
// controls the way a pending ghost does). `height` is only ever set by a
// manual corner-resize (canvas-store.ts); otherwise the card auto-fits its
// content, so estimate it the same way a ghost card is estimated.
export function contentNodeRect(x: number, y: number, width: number, content: string, height?: number): Rect {
  return { x, y, width, height: height ?? estimateCardHeight(content, width) }
}

const OBSTACLE_MARGIN = 20 // minimum clear space kept between a ghost card and any obstacle
const SHIFT_STEP = 48 // vertical nudge step while hunting for clear space
const MAX_SHIFT_TRIES = 30 // bounded search — a packed canvas gets the last try, not an infinite hunt

function rectsOverlap(a: Rect, b: Rect, margin: number): boolean {
  return (
    a.x < b.x + b.width + margin &&
    a.x + a.width + margin > b.x &&
    a.y < b.y + b.height + margin &&
    a.y + a.height + margin > b.y
  )
}

// Nudges a candidate pair straight down, in fixed steps, until neither ghost
// card's box overlaps anything already on the canvas — another node, or an
// already-placed ghost pair (Canvas.tsx accumulates those as it iterates).
// `buildRects` re-derives both cards' boxes at a given y-shift so the two
// stay locked together (same row) as they move.
function settleClearOfObstacles(buildRects: (shiftY: number) => Rect[], obstacles: Rect[]): number {
  for (let i = 0; i < MAX_SHIFT_TRIES; i++) {
    const shiftY = i * SHIFT_STEP
    const rects = buildRects(shiftY)
    if (!rects.some((r) => obstacles.some((o) => rectsOverlap(r, o, OBSTACLE_MARGIN)))) return shiftY
  }
  return (MAX_SHIFT_TRIES - 1) * SHIFT_STEP
}

type NodeShape = { position: { x: number; y: number }; width: number; height?: number }

// Node-triggered layout: human -> context -> question, left to right, all on
// one row (Canvas.tsx wires the matching handles — human's right-source to
// context's left-target, context's right-source to question's left-target).
// A fixed-width chain means the context/question pair can never overlap
// EACH OTHER regardless of how long either card's text runs (their heights
// grow independently, downward, off the shared top edge) — the only
// remaining collision risk is against unrelated nodes, which `obstacles`
// (every other real node + every already-placed ghost pair) guards against
// by shifting the whole row down until it's clear.
export function ghostPositions(
  trigger: NodeShape | undefined,
  contextText = "",
  questionText: string | undefined = "",
  obstacles: Rect[] = [],
) {
  // No trigger row found (shouldn't happen — a spawn always names a real
  // node) falls back to the old demo's fixed spot rather than stacking at
  // the origin.
  const base = trigger?.position ?? { x: 470, y: 480 }
  const contextX = base.x + (trigger?.width ?? 260) + GHOST_GAP_X
  const questionX = contextX + GHOST_WIDTH.context + GHOST_GAP_X
  const shiftY = settleClearOfObstacles((dy) => {
    const rects = [ghostCardRect(contextX, base.y + dy, GHOST_WIDTH.context, contextText)]
    if (questionText !== undefined) rects.push(ghostCardRect(questionX, base.y + dy, GHOST_WIDTH.question, questionText))
    return rects
  }, obstacles)
  return {
    context: { x: contextX, y: base.y + shiftY },
    question: { x: questionX, y: base.y + shiftY },
  }
}

// The geometric midpoint between two endpoints' centers — where a `relate`
// edge's diamond conceptually sits. Used to place the ghost card below the
// relation's midpoint (ghostPositionsFromEdge); the diamond itself is drawn
// by RelateEdge on the still-visible edge, and the ghost's drop-lines run
// from both endpoint nodes straight to the ghost card.
export function relateAnchorPosition(endpoints: [NodeShape, NodeShape]): { x: number; y: number } {
  const [a, b] = endpoints
  const x = (a.position.x + a.width / 2 + b.position.x + b.width / 2) / 2
  // Between the tops of the two nodes — good enough given node heights
  // vary; the ghost still gaps well below either one either way.
  const y = (a.position.y + b.position.y) / 2
  return { x, y }
}

// A `relate`-triggered pair's two drop-lines replace the original relate
// edge outright (it's hidden the moment the pair spawns, and deleted for
// good once the pair is accepted — Canvas.tsx / use-canvas-persistence.ts),
// so the replacement lines must leave each anchor node from the exact same
// side the relate edge did, or the swap reads as a jump. The relate edge's
// own handle ids are direction-specific ("<side>-source" on its source node,
// "<side>-target" on its target node); a ghost drop-line is always a SOURCE
// edge out of the anchor (anchor -> ghost), so a target-side anchor needs
// its side re-expressed as a "-source" id. Shared by both files so they
// can't derive two different sides for the same anchor.
export function relateAnchorSourceHandle(
  anchorNodeId: string,
  originalEdge: { source: string; target: string; sourceHandle?: string; targetHandle?: string } | undefined,
): string | undefined {
  if (!originalEdge) return undefined
  // Derive a handle only when the original edge fully specifies BOTH sides.
  // Otherwise the two legs would go asymmetric — one pinned to its exact
  // original side, the other (missing its handle) snapping to React Flow's
  // default — which reads as the relayout this helper exists to prevent.
  // All human-drawn relate edges set both handles (Canvas.tsx's onConnect),
  // so this only guards a malformed/legacy row: there, both legs fall back
  // to the default together, staying symmetric.
  if (!originalEdge.sourceHandle || !originalEdge.targetHandle) return undefined
  if (anchorNodeId === originalEdge.source) return originalEdge.sourceHandle
  if (anchorNodeId === originalEdge.target) return `${originalEdge.targetHandle.split("-")[0]}-source`
  return undefined
}

// Edge-triggered variant for the `relate` gesture — the ghost hangs BELOW
// the edge's midpoint (relateAnchorPosition), not next to either endpoint,
// matching the image spec (dashed drop-line from the edge's mid-diamond to
// the ghost card). Context and question still sit left-to-right on one row,
// same reasoning as ghostPositions above.
export function ghostPositionsFromEdge(
  endpoints: [NodeShape, NodeShape] | undefined,
  contextText = "",
  questionText: string | undefined = "",
  obstacles: Rect[] = [],
) {
  if (!endpoints) return ghostPositions(undefined, contextText, questionText, obstacles)
  const mid = relateAnchorPosition(endpoints)
  const contextX = mid.x - GHOST_WIDTH.context / 2
  const questionX = contextX + GHOST_WIDTH.context + GHOST_GAP_X
  const baseY = mid.y + GHOST_GAP_Y
  const shiftY = settleClearOfObstacles((dy) => {
    const rects = [ghostCardRect(contextX, baseY + dy, GHOST_WIDTH.context, contextText)]
    if (questionText !== undefined) rects.push(ghostCardRect(questionX, baseY + dy, GHOST_WIDTH.question, questionText))
    return rects
  }, obstacles)
  return {
    context: { x: contextX, y: baseY + shiftY },
    question: { x: questionX, y: baseY + shiftY },
  }
}
