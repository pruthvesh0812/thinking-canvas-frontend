import { useEffect } from "react"
import { useGhostStore } from "@/stores/ghost-store"
import { API_URL } from "@/lib/api"
import { logger } from "@/lib/logger"
import type { RedisMessage } from "@/types"

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
//   cleanup — closing on sessionId change/unmount — is what guarantees this).
export function useGhostStream(sessionId: string | null) {
  useEffect(() => {
    if (!sessionId) return
    const source = new EventSource(`${API_URL}/api/stream/${sessionId}`)

    source.onmessage = (e) => {
      const msg = JSON.parse(e.data) as RedisMessage
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

    source.onerror = () => {
      // A genuine network drop is the ONLY reason this fires — the backend
      // holds the connection open for the whole session and does not close
      // it per-ghost. Log it; ground truth reconciles from Supabase on the
      // next mount rather than assuming any specific pending pair was lost.
      logger.error("[ghost-stream] connection error", { sessionId })
    }

    return () => source.close()
  }, [sessionId])
}
