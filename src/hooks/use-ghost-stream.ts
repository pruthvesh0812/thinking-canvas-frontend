import { useEffect } from "react"
import { useGhostStore } from "@/stores/ghost-store"
import { API_URL } from "@/lib/api"
import { getAccessToken } from "@/lib/auth"
import { logger } from "@/lib/logger"
import type { RedisMessage } from "@/types"

// Reopen backoff after the browser gives up on the stream (see onerror).
// Doubles per consecutive failure, resets once a connection actually opens.
const RETRY_MIN_MS = 2_000
const RETRY_MAX_MS = 30_000

function handleFrame(e: MessageEvent) {
  // A malformed frame — a truncated write, a stray keepalive comment that
  // arrives as data — must NEVER throw out of this handler: an uncaught
  // error here tears down the EventSource for the whole session. Parse
  // defensively and drop the bad frame, same graceful-ignore contract the
  // `default` branch gives unknown types (non-negotiable #10).
  let msg: RedisMessage
  try {
    msg = JSON.parse(e.data) as RedisMessage
  } catch {
    logger.warn("[ghost-stream] unparseable message frame — dropping", { data: e.data })
    return
  }
  switch (msg.type) {
    case "spawn":
      useGhostStore.getState().spawn(msg.descriptor)
      break
    case "chunk":
      useGhostStore.getState().appendChunk(msg.target, msg.data)
      break
    case "node_type":
      useGhostStore.getState().setNodeType(msg.target, msg.node_type)
      break
    case "done":
      useGhostStore.getState().markDone(msg)
      break
    case "ping":
      break
    default:
      // Forward-compat: 'waiting'/'offer'/'withdraw' are typed but never
      // emitted today (routes/intervention.ts isn't mounted) — and the
      // protocol may grow further. Unknown types are logged and
      // ignored, never thrown on (non-negotiable #10).
      logger.warn("[ghost-stream] unhandled message type", { msg })
  }
}

// Owns the ONE EventSource for the active session — opened once the session
// id is known, held open for the session's whole lifetime. Components never
// touch it directly; every message routes straight into ghost-store.
//
// GHOST-STREAMING.md's lifecycle rules:
// - One connection for the whole session — never reconnect per ghost. The
//   backend's route resolves only on client abort or a server write error,
//   never on `done`. An `onerror` here is a real network problem, not
//   routine flow.
// - The backend sends `ping` every 25s as a keepalive — ignore it.
// - Never open a second EventSource for the same session (the effect's own
//   cleanup — closing on sessionId change/unmount — is what guarantees this,
//   and a reopen below only ever happens after the previous one is CLOSED).
//
// Auth: the backend requires the caller's Supabase access token on every
// /api/* route. EventSource can't set an Authorization header, so this one
// route takes it as `?token=` (thinking-canvas-be's requireAuth). That token
// is verified at CONNECT time only, and the browser's own auto-reconnect
// reuses the same URL — so once the token has expired (~1h) a reconnect gets
// a 401, the browser gives up for good (readyState CLOSED, no more retries),
// and the session would silently stop receiving ghosts. Hence the reopen in
// onerror: a CLOSED source is rebuilt from scratch with a freshly fetched
// token, with backoff so a persistent rejection (revoked user, backend
// down) can't spin.
export function useGhostStream(sessionId: string | null) {
  useEffect(() => {
    if (!sessionId) return

    let source: EventSource | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let retryDelayMs = RETRY_MIN_MS
    let cancelled = false

    function scheduleReopen() {
      if (cancelled) return
      logger.warn("[ghost-stream] reopening with a fresh token", { sessionId, inMs: retryDelayMs })
      retryTimer = setTimeout(() => void open(), retryDelayMs)
      retryDelayMs = Math.min(retryDelayMs * 2, RETRY_MAX_MS)
    }

    async function open() {
      const token = await getAccessToken()
      // Cleanup can run while the token fetch is in flight — never open a
      // stream nobody is going to close.
      if (cancelled) return
      if (!token) {
        logger.error("[ghost-stream] no access token — can't open stream", { sessionId })
        scheduleReopen()
        return
      }

      const es = new EventSource(`${API_URL}/api/stream/${sessionId}?token=${encodeURIComponent(token)}`)
      source = es
      es.onopen = () => {
        retryDelayMs = RETRY_MIN_MS
      }
      es.onmessage = handleFrame
      es.onerror = () => {
        // CONNECTING = a genuine network drop the browser is retrying on its
        // own — just log it. CLOSED = the browser gave up (an HTTP error such
        // as a 401 on the reconnect) — rebuild with a fresh token. Ground
        // truth reconciles from Supabase on the next mount either way rather
        // than assuming any specific pending pair was lost.
        logger.error("[ghost-stream] connection error", { sessionId, readyState: es.readyState })
        if (es.readyState === EventSource.CLOSED) {
          source = null
          scheduleReopen()
        }
      }
    }

    void open()

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
      source?.close()
    }
  }, [sessionId])
}
