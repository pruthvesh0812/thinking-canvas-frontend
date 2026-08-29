"use client"

import { useEffect, useRef, useState } from "react"
import { ensureAnonSession } from "@/lib/auth"
import { supabase } from "@/lib/supabase"
import { sessionStart } from "@/lib/api"
import { logger } from "@/lib/logger"
import { useCanvasStore, type CanvasEdge, type CanvasNode, type HumanEdgeType } from "@/stores/canvas-store"
import { useSessionStore, type PastSessionSummary } from "@/stores/session-store"

export type HydrationStatus = "loading" | "ready" | "not-found" | "error"

function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

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

export interface CanvasHydrationResult {
  status: HydrationStatus
  /** True exactly once per canvas open: no active session was found (this
   * call is what started/resumed one), AND the canvas has at least one
   * closed prior session — "reopening something you finished before," not
   * "the very first time this canvas has ever been opened" (a fresh
   * north-star-capture canvas has zero prior sessions and always skips
   * this) and not "still mid-session" (an active session skips this too).
   * CanvasShell renders SessionLanding instead of Canvas while this is
   * true and the human hasn't dismissed it yet. */
  showSessionLanding: boolean
}

// Loads a real canvas from Supabase and pushes it into the stores:
//   1. Ensure a session (RLS needs auth.uid()); load the canvas row.
//   2. Fetch this canvas's whole session history; open (or idempotently
//      resume) the current one via POST /api/session/start.
//   3. Load all nodes + edges for the canvas, map rows → store shapes.
// One run per canvasId (guarded) — see STATE-MANAGEMENT.md Canvas Hydration.
export function useCanvasHydration(canvasId: string): CanvasHydrationResult {
  const [status, setStatus] = useState<HydrationStatus>(USE_MOCK_PERSISTENCE ? "ready" : "loading")
  const [showSessionLanding, setShowSessionLanding] = useState(false)
  const hydratedFor = useRef<string | null>(null)

  useEffect(() => {
    if (USE_MOCK_PERSISTENCE) return
    if (hydratedFor.current === canvasId) return
    hydratedFor.current = canvasId
    let cancelled = false

    async function hydrate() {
      setStatus("loading")
      setShowSessionLanding(false)

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

      // 2. This canvas's whole session history, oldest first — answers three
      // things at once: whether an active session already exists (isResuming
      // — gates carry-forward below), each session's 1-indexed ordinal (same
      // derivation POST /api/session/start uses server-side, so a node or a
      // SessionLanding row never disagrees with the live session's own
      // number), and the closed ones for SessionLanding's list.
      const { data: allSessions, error: sessionsError } = await supabase
        .from("sessions")
        .select("id, status, start_time, end_time")
        .eq("canvas_id", canvasId)
        .order("start_time", { ascending: true })

      if (cancelled) return
      if (sessionsError) {
        logger.error("[hydration] failed to load session history", { canvasId, error: sessionsError })
        setStatus("error")
        return
      }
      const isResuming = (allSessions ?? []).some((s) => s.status === "active")
      const sessionNumberById = new Map<string, number>((allSessions ?? []).map((s, i) => [s.id, i + 1]))

      // 3. Open (or resume) the session. POST /api/session/start is
      // idempotent per canvas now — the backend enforces at most one active
      // session and returns the existing one instead of creating a sibling
      // (API-CONTRACT.md), so it's always safe to call here regardless of
      // step 2's answer. Its response is the single source for both the
      // session id and its 1-indexed session_number ordinal — no more
      // client-side guessing (array position, row counts) for either.
      let sessionId: string
      let sessionNumber: number
      try {
        const res = await sessionStart({ canvas_id: canvasId })
        sessionId = res.session_id
        sessionNumber = res.session_number
      } catch (err) {
        logger.error("[hydration] session/start failed", { canvasId, error: err })
        if (!cancelled) setStatus("error")
        return
      }
      if (cancelled) return

      // Carry-Forward (SESSION-FLOWS.md): only loaded when this canvas is
      // opening into a genuinely NEW session, not a resumed active one —
      // "on starting a new session on the same canvas". No `resolved`
      // column exists on session_learnings yet (Known Gap), so every
      // learning ever written re-appears at the next new-session start;
      // flagged here rather than invented around.
      let carriedRows: { id: string; content: string; type: string }[] = []
      if (!isResuming) {
        const { data: learningRows, error: learningsError } = await supabase
          .from("session_learnings")
          .select("id, content, type")
          .eq("canvas_id", canvasId)
        if (learningsError) {
          logger.warn("[hydration] failed to load carried-forward learnings", { canvasId, error: learningsError })
        } else {
          carriedRows = learningRows ?? []
        }
      }

      // 4. Nodes + edges for the whole canvas (every session — nodes belong
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

      // Real per-session node counts (SessionLanding's list) — built off the
      // same rows being mapped below, no extra query.
      const nodeCountBySessionId = new Map<string, number>()
      for (const row of nodeRows ?? []) {
        nodeCountBySessionId.set(row.session_id, (nodeCountBySessionId.get(row.session_id) ?? 0) + 1)
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
          // the hardcoded 1 every real node used to get) — what makes
          // Canvas.tsx's history dimming/filtering honest once SessionLanding
          // can drop a human into a real past session.
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

      // Carried-forward items land as local-only editable placeholders, badge-
      // marked (HumanNode.tsx), in a dedicated row below the loaded grid — the
      // existing content-persistence path picks each one up on first edit,
      // same as any other new node (use-canvas-persistence.ts).
      const carryY = GRID.y0 + Math.ceil((nodes.length || 1) / GRID.cols) * GRID.gapY + 160
      const carried: CanvasNode[] = carriedRows.map((row, i) => ({
        id: crypto.randomUUID(),
        position: { x: GRID.x0 + i * GRID.gapX, y: carryY },
        width: DEFAULT_WIDTH,
        data: { content: row.content, owner: "human" as const, sessionNumber: 1, seedSource: "carried_forward" as const },
      }))

      // Closed prior sessions only — SessionLanding's list and, later,
      // HistoryBar's real-mode lookup (the active/current one has its own
      // session-store fields and is never also a row here).
      const pastSessions: PastSessionSummary[] = (allSessions ?? [])
        .filter((s) => s.status !== "active")
        .map((s) => ({
          id: s.id,
          number: sessionNumberById.get(s.id) ?? 0,
          date: formatSessionDate(s.start_time),
          durationMin: s.end_time
            ? Math.round((new Date(s.end_time).getTime() - new Date(s.start_time).getTime()) / 60000)
            : null,
          nodeCount: nodeCountBySessionId.get(s.id) ?? 0,
        }))

      useCanvasStore.getState().hydrate([...nodes, ...carried], edges)
      useSessionStore.getState().loadCanvas({
        canvasId,
        sessionId,
        originalIntent: canvas.original_intent,
        title: canvas.title,
        sessionNumber,
        pastSessions,
      })
      logger.info("[hydration] canvas loaded", {
        canvasId,
        nodes: nodes.length,
        edges: edges.length,
        carried: carried.length,
        sessionNumber,
        pastSessions: pastSessions.length,
      })
      // Reopening something already finished (closed history exists, but
      // nothing was active) — SessionLanding gets first say instead of
      // dropping straight onto the live canvas. Neither a brand-new canvas
      // (no pastSessions yet) nor a still-active resume ever sets this.
      if (!isResuming && pastSessions.length > 0) setShowSessionLanding(true)
      setStatus("ready")
    }

    void hydrate()
    return () => {
      cancelled = true
      // Allow a genuine re-hydrate if this same canvas mounts again later.
      if (hydratedFor.current === canvasId) hydratedFor.current = null
    }
  }, [canvasId])

  return { status, showSessionLanding }
}
