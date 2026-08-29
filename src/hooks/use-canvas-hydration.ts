"use client"

import { useEffect, useRef, useState } from "react"
import { ensureAnonSession } from "@/lib/auth"
import { supabase } from "@/lib/supabase"
import { sessionStart } from "@/lib/api"
import { fetchSessionHistory } from "@/lib/session-history"
import { logger } from "@/lib/logger"
import { useCanvasStore, type CanvasEdge, type CanvasNode, type HumanEdgeType } from "@/stores/canvas-store"
import { useSessionStore } from "@/stores/session-store"

export type HydrationStatus = "loading" | "ready" | "not-found" | "error"

// Mock mode keeps the seeded demo graph in canvas-store untouched — hydration
// is a no-op and reports ready immediately (same flag the persistence hook
// uses to skip Supabase writes).
const USE_MOCK_PERSISTENCE = process.env.NEXT_PUBLIC_USE_MOCK_PERSISTENCE === "true"

// Fallback layout for pre-migration rows only — nodes.x/y are now persisted
// (see use-canvas-persistence.ts), so this only fires for rows written before
// those columns existed and still have them null.
const GRID = { cols: 3, gapX: 340, gapY: 200, x0: 120, y0: 100 }
const DEFAULT_WIDTH = 240

function gridPosition(index: number) {
  return {
    x: GRID.x0 + (index % GRID.cols) * GRID.gapX,
    y: GRID.y0 + Math.floor(index / GRID.cols) * GRID.gapY,
  }
}

// Only the two human-drawable types render distinctly (Canvas.tsx maps
// question → questionEdge, everything else → logicalEdge). AI-drawn types
// (doubt/associative) collapse to logical for display until their own edge
// components land.
function toHumanEdgeType(raw: string): HumanEdgeType {
  return raw === "question" ? "question" : "logical"
}

// Loads a real canvas from Supabase and pushes it into the stores:
//   1. Ensure a session (RLS needs auth.uid()); load the canvas row.
//   2. Fetch this canvas's whole session history (fetchSessionHistory).
//   3. Open (or idempotently resume) the current session — UNLESS there's a
//      real decision to make (closed history exists, nothing active), in
//      which case this defers to SessionLanding instead of calling
//      POST /api/session/start eagerly (session-store's showSessionLanding
//      doc; the actual call happens in use-session-lifecycle.ts's
//      continueToNewSession, on a deliberate "Continue" click).
//   4. Load all nodes + edges for the canvas, map rows → store shapes.
// One run per canvasId (guarded) — see STATE-MANAGEMENT.md Canvas Hydration.
export function useCanvasHydration(canvasId: string): HydrationStatus {
  const [status, setStatus] = useState<HydrationStatus>(USE_MOCK_PERSISTENCE ? "ready" : "loading")
  const hydratedFor = useRef<string | null>(null)

  useEffect(() => {
    if (USE_MOCK_PERSISTENCE) return
    if (hydratedFor.current === canvasId) return
    hydratedFor.current = canvasId
    let cancelled = false

    async function hydrate() {
      setStatus("loading")

      // 1. Session + canvas row
      await ensureAnonSession()
      const { data: canvas, error: canvasError } = await supabase
        .from("canvases")
        .select("id, original_intent, title")
        .eq("id", canvasId)
        .maybeSingle()

      if (cancelled) return
      if (canvasError) {
        logger.error("[hydration] failed to load canvas", { canvasId, error: canvasError })
        setStatus("error")
        return
      }
      if (!canvas) {
        // No row, or RLS hid it because it belongs to another user.
        logger.warn("[hydration] canvas not found (or not owned)", { canvasId })
        setStatus("not-found")
        return
      }

      // 2. This canvas's whole session history.
      const history = await fetchSessionHistory(canvasId)
      if (cancelled) return
      if (!history) {
        setStatus("error")
        return
      }
      const { isResuming, sessionNumberById, pastSessions } = history

      // Show SessionLanding only when there's an actual decision to make —
      // closed history exists, but nothing is active. Neither a brand-new
      // canvas (zero pastSessions — straight from north-star capture) nor an
      // active resume (isResuming) ever defers; both proceed straight to a
      // live session below, same as before showSessionLanding existed.
      const deferSession = !isResuming && pastSessions.length > 0

      let sessionId: string | null = null
      let sessionNumber: number | null = null
      if (!deferSession) {
        try {
          const res = await sessionStart({ canvas_id: canvasId })
          sessionId = res.session_id
          sessionNumber = res.session_number
        } catch (err) {
          logger.error("[hydration] session/start failed", { canvasId, error: err })
          if (!cancelled) setStatus("error")
          return
        }
      }
      if (cancelled) return

      // 3. Nodes + edges for the whole canvas (every session — nodes belong
      //    to the canvas, not the session).
      const [{ data: nodeRows, error: nodesError }, { data: edgeRows, error: edgesError }] = await Promise.all([
        supabase
          .from("nodes")
          .select("id, content, owner, x, y, width, height, session_id")
          .eq("canvas_id", canvasId)
          .order("created_at"),
        supabase
          .from("edges")
          .select("id, from_node_id, to_node_id, from_handle, to_handle, edge_type")
          .eq("canvas_id", canvasId),
      ])

      if (cancelled) return
      if (nodesError || edgesError) {
        logger.error("[hydration] failed to load nodes/edges", { canvasId, nodesError, edgesError })
        setStatus("error")
        return
      }

      const nodes: CanvasNode[] = (nodeRows ?? []).map((row, i) => ({
        id: row.id,
        // Saved layout when present; grid fallback only for pre-migration
        // rows that never stored x/y (all four columns are nullable).
        position: row.x != null && row.y != null ? { x: row.x, y: row.y } : gridPosition(i),
        width: row.width ?? DEFAULT_WIDTH,
        height: row.height ?? undefined,
        data: {
          content: row.content ?? "",
          owner: row.owner === "ai" ? "ai" : "human",
          aiMarker: row.owner === "ai" ? true : undefined,
          // The session that actually created this node (real ordinal, not
          // a hardcoded 1 regardless of history) — what makes Canvas.tsx's
          // history dimming/filtering honest once a human is actually
          // dropped into a real past session (SessionLanding).
          sessionNumber: sessionNumberById.get(row.session_id) ?? 1,
          synced: true,
        },
      }))

      const edges: CanvasEdge[] = (edgeRows ?? []).map((row) => ({
        id: row.id,
        source: row.from_node_id,
        target: row.to_node_id,
        // from_handle/to_handle store just the bare side, uppercase (e.g.
        // "RIGHT") — rebuild HumanNode's actual handle id ("right-source"/
        // "right-target") from it. Undefined (null column) lets React Flow
        // pick a default side.
        sourceHandle: row.from_handle ? `${row.from_handle.toLowerCase()}-source` : undefined,
        targetHandle: row.to_handle ? `${row.to_handle.toLowerCase()}-target` : undefined,
        edgeType: toHumanEdgeType(row.edge_type),
        synced: true,
      }))

      useCanvasStore.getState().hydrate(nodes, edges)
      useSessionStore.getState().loadCanvas({
        canvasId,
        sessionId,
        originalIntent: canvas.original_intent,
        title: canvas.title,
        sessionNumber,
        pastSessions,
        showSessionLanding: deferSession,
      })
      logger.info("[hydration] canvas loaded", {
        canvasId,
        nodes: nodes.length,
        edges: edges.length,
        sessionNumber,
        pastSessions: pastSessions.length,
        deferSession,
      })
      setStatus("ready")
    }

    void hydrate()
    return () => {
      cancelled = true
      // Allow a genuine re-hydrate if this same canvas mounts again later.
      if (hydratedFor.current === canvasId) hydratedFor.current = null
    }
  }, [canvasId])

  return status
}
