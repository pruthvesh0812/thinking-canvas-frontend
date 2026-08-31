import { supabase } from "@/lib/supabase"
import { logger } from "@/lib/logger"
import type { PastSessionSummary } from "@/stores/session-store"

function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

export interface SessionHistory {
  /** Does the canvas already have an active session? Callers use this to
   * decide whether to call POST /api/session/start eagerly (resuming — no
   * decision to make) or defer it behind a deliberate SessionLanding
   * "Continue" click (nothing active — see use-canvas-hydration.ts and
   * use-session-lifecycle.ts's continueToNewSession). */
  isResuming: boolean
  /** Every session's 1-indexed ordinal by id — the same derivation
   * POST /api/session/start uses server-side (API-CONTRACT.md), so a node
   * tagged from this map or a SessionLanding row never disagrees with the
   * live session's own number. */
  sessionNumberById: Map<string, number>
  /** Closed sessions only, ready for SessionLanding's list — the active
   * one (if any) has its own session-store fields, never also a row here. */
  pastSessions: PastSessionSummary[]
}

// One `sessions` query, reused everywhere this canvas's session history is
// needed: canvas hydration (use-canvas-hydration.ts) and the "session
// closed, hand off to SessionLanding" step (use-session-lifecycle.ts). Pass
// nodeCountBySessionId when the caller already has node rows in hand
// (hydration does, from the same round trip it needs nodes/edges for
// anyway); omitted, past-session node counts come from a light extra query
// against just the `session_id` column.
export async function fetchSessionHistory(
  canvasId: string,
  nodeCountBySessionId?: Map<string, number>,
): Promise<SessionHistory | null> {
  const { data: allSessions, error } = await supabase
    .from("sessions")
    .select("id, status, start_time, end_time")
    .eq("canvas_id", canvasId)
    .order("start_time", { ascending: true })

  if (error) {
    logger.error("[session-history] failed to load session history", { canvasId, error })
    return null
  }

  const isResuming = (allSessions ?? []).some((s) => s.status === "active")
  const sessionNumberById = new Map<string, number>((allSessions ?? []).map((s, i) => [s.id, i + 1]))

  const nodeCounts = nodeCountBySessionId ?? (await fetchNodeCountsBySession(canvasId))

  const pastSessions: PastSessionSummary[] = (allSessions ?? [])
    .filter((s) => s.status !== "active")
    .map((s) => ({
      id: s.id,
      number: sessionNumberById.get(s.id) ?? 0,
      date: formatSessionDate(s.start_time),
      durationMin: s.end_time
        ? Math.round((new Date(s.end_time).getTime() - new Date(s.start_time).getTime()) / 60000)
        : null,
      nodeCount: nodeCounts.get(s.id) ?? 0,
    }))

  return { isResuming, sessionNumberById, pastSessions }
}

async function fetchNodeCountsBySession(canvasId: string): Promise<Map<string, number>> {
  const { data, error } = await supabase.from("nodes").select("session_id").eq("canvas_id", canvasId)
  const counts = new Map<string, number>()
  if (error) {
    logger.warn("[session-history] failed to count nodes per session", { canvasId, error })
    return counts
  }
  for (const row of data ?? []) {
    counts.set(row.session_id, (counts.get(row.session_id) ?? 0) + 1)
  }
  return counts
}
