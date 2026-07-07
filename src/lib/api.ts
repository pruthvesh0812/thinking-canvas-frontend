import { logger } from '@/lib/logger'
import type {
  CanvasEvent,
  CanvasEventResponse,
  GhostStatus,
  GhostStatusResponse,
  HealthResponse,
  SessionCompleteRequest,
  SessionCompleteResponse,
  SessionStartRequest,
  SessionStartResponse,
} from '@/types'

const API_URL = process.env.NEXT_PUBLIC_API_URL!

export class ApiError extends Error {
  constructor(
    public path: string,
    public status: number,
    public body: unknown,
  ) {
    super(`[api] ${path} ${status}`)
    this.name = 'ApiError'
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    logger.error('[api] request failed', { path, status: res.status, err })
    throw new ApiError(path, res.status, err)
  }
  return (await res.json()) as T
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    logger.error('[api] request failed', { path, status: res.status, err })
    throw new ApiError(path, res.status, err)
  }
  return (await res.json()) as T
}

// POST /api/canvas-event — fire AFTER the Supabase insert commits.
// The backend re-reads the row by id (write-then-notify non-negotiable,
// see API-CONTRACT.md). Send IDs only, never node content.
export function canvasEvent(payload: CanvasEvent): Promise<CanvasEventResponse> {
  return post<CanvasEventResponse>('/api/canvas-event', payload)
}

// POST /api/ghost-status — records the user's accept/reject decision on a pair.
// Requires thread_id + turn_index, currently not delivered on the SSE stream
// (API-CONTRACT Known Gap #1). Callers must supply them from the ghost store's
// meta field once backend enrichment lands.
export function ghostStatus(payload: GhostStatus): Promise<GhostStatusResponse> {
  return post<GhostStatusResponse>('/api/ghost-status', payload)
}

// POST /api/session/start — creates a session row and drops session-boundary
// markers into every agent thread. Call before any node/edge creation.
export function sessionStart(
  payload: SessionStartRequest,
): Promise<SessionStartResponse> {
  return post<SessionStartResponse>('/api/session/start', payload)
}

// POST /api/session/complete — the response is an ack; the observer pipeline
// runs async. The Session Complete UI polls Supabase for the resulting
// session_learnings / observer_structures rows (see SESSION-FLOWS.md).
export function sessionComplete(
  payload: SessionCompleteRequest,
): Promise<SessionCompleteResponse> {
  return post<SessionCompleteResponse>('/api/session/complete', payload)
}

// GET /health — env smoke test. The frontend never gates behaviour on this.
export function health(): Promise<HealthResponse> {
  return get<HealthResponse>('/health')
}
