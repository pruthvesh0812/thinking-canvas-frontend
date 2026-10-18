import { logger } from "@/lib/logger"

// Interim home for an edge's reshape ("bend") point. The edges table has no
// bend_x/bend_y columns yet (verified against the live schema), so nothing the
// user drags could be written to Supabase and every reload fell back to the
// default curve. Until that migration lands (use-canvas-persistence.ts
// persistEdgeBend TODO), the bend is kept per canvas in this browser's
// localStorage — it survives reloads here, but not on another device. When the
// columns exist, write them to the row instead and delete this file.

export interface EdgeBend {
  x: number
  y: number
}

const key = (canvasId: string) => `tc.edge-bends.${canvasId}`

function read(canvasId: string): Record<string, EdgeBend> {
  try {
    const raw = window.localStorage.getItem(key(canvasId))
    return raw ? (JSON.parse(raw) as Record<string, EdgeBend>) : {}
  } catch {
    return {}
  }
}

export function loadEdgeBends(canvasId: string): Record<string, EdgeBend> {
  const all = read(canvasId)
  // Ignore anything that isn't a finite point (hand-edited or from an old build).
  return Object.fromEntries(
    Object.entries(all).filter(([, b]) => b && Number.isFinite(b.x) && Number.isFinite(b.y)),
  )
}

/** A null bend puts the edge back on its default curve. */
export function saveEdgeBend(canvasId: string, edgeId: string, bend: EdgeBend | null) {
  const all = read(canvasId)
  if (bend) all[edgeId] = { x: bend.x, y: bend.y }
  else delete all[edgeId]
  try {
    window.localStorage.setItem(key(canvasId), JSON.stringify(all))
  } catch (error) {
    logger.warn("[persistence] couldn't store the edge bend locally", { edgeId, error })
  }
}
