export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

// "Making room" (§5.1, §7): components the composer would cover move DOWN,
// each only as far as needed to clear whatever is above it, so none overlap.
// Components beside the composer (no horizontal overlap) never move. The
// result is a display-only offset per node id — the saved layout never
// changes because a composer opened.
export function computeRoomOffsets(blocker: Rect, nodes: (Rect & { id: string })[], gap: number): Record<string, number> {
  const offsets: Record<string, number> = {}
  const blockers: Rect[] = [blocker]
  const overlapsX = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width
  const overlapsY = (a: Rect, b: Rect) => a.y < b.y + b.height + gap && b.y < a.y + a.height + gap

  // Top to bottom, so a node pushed down can in turn push the one below it.
  const sorted = [...nodes].sort((a, b) => a.y - b.y)
  for (const n of sorted) {
    // Anything entirely above the composer's top is never in the way.
    if (n.y + n.height <= blocker.y) continue
    let rect = { ...n }
    let moved = true
    while (moved) {
      moved = false
      for (const b of blockers) {
        if (overlapsX(rect, b) && overlapsY(rect, b)) {
          const target = b.y + b.height + gap
          if (rect.y < target) {
            rect = { ...rect, y: target }
            moved = true
          }
        }
      }
    }
    if (rect.y !== n.y) {
      offsets[n.id] = rect.y - n.y
      blockers.push(rect)
    }
  }
  return offsets
}
