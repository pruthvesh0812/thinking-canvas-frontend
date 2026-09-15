import { logger } from "@/lib/logger"
import type {
  CanvasEvent,
  GhostStatusPayload,
  SessionCompletePayload,
  SessionStartPayload,
  SessionStartResponse,
} from "@/types"

// Exported so use-ghost-stream.ts can build the SSE URL from the same
// source — EventSource has no header hook to route through `post()` below.
export const API_URL = process.env.NEXT_PUBLIC_API_URL!

// Typed error carrying enough to decide a retry/rollback strategy at the call
// site — that decision belongs in the hook that called us, not here
// (add-api-call.md checklist #4).
export class ApiError extends Error {
  constructor(
    public readonly path: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`${path} failed with ${status}`)
    this.name = "ApiError"
  }
}

// Thin generic: JSON in/out, structured logging, typed errors. Every endpoint
// wrapper below stays one honest line of intent. There is no auth header
// here today (API-CONTRACT.md — no auth on any /api/* route yet); isolating
// that fact to this one function is what makes adding a Supabase JWT later a
// one-file change.
async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    logger.error("[api] request failed", { path, status: res.status, err })
    throw new ApiError(path, res.status, err)
  }
  return res.json() as Promise<T>
}

// POST /api/canvas-event — notify AFTER the Supabase write commits; the
// backend immediately re-reads the row(s) by id, never the request body
// (write-then-notify non-negotiable). `node.created` is synchronous and slow
// (~1–3s of Gemini summary+embedding) — call this fire-and-forget, never
// block the canvas render on its response.
export function canvasEvent(payload: CanvasEvent) {
  return post<{ ok: true }>("/api/canvas-event", payload)
}

// POST /api/ghost-status — thread_id/turn_index come straight off the SSE
// `done` message for this pair (GHOST-STREAMING.md); there is no
// agent_threads read to do first. Omitting rejection_reason on a rejection
// makes the backend default to 'skip_for_now'.
export function ghostStatus(payload: GhostStatusPayload) {
  return post<{ ok: true }>("/api/ghost-status", payload)
}

// POST /api/session/start — call when a canvas is opened with no active
// session, before any node can be created. Never insert a `sessions` row
// directly (STATE-MANAGEMENT.md) — only this route appends the
// session-boundary marker every agent thread needs.
export function sessionStart(payload: SessionStartPayload) {
  return post<SessionStartResponse>("/api/session/start", payload)
}

// POST /api/session/complete — an ack only; the Observer pass and
// session_learnings writes happen asynchronously afterward. ⚠
// carry_forward_ids is validated but currently ignored backend-side
// (API-CONTRACT.md Known Gap #3) — don't build UI that assumes it persists.
export function sessionComplete(payload: SessionCompletePayload) {
  return post<{ ok: true }>("/api/session/complete", payload)
}

// No wrapper for POST /api/observer-edge-status — the schema exists in the
// mirrored types but the route isn't implemented backend-side yet
// (API-CONTRACT.md Known Gap #4). Add one when that lands, not before.
