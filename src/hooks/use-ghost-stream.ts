'use client'

import { useEffect } from 'react'
import { logger } from '@/lib/logger'
import { useGhostStore } from '@/stores/ghost-store'
import { useSessionStore } from '@/stores/session-store'
import type { RedisMessage } from '@/types'

// Owns the EventSource lifecycle for the active session and dispatches every
// message into the ghost store. Components never touch the EventSource.
//
// Backend behaviour (see API-CONTRACT.md Known Gap #6b): the connection closes
// after every `done`. Reconnect is routine, and pairs left un-`done` across
// the drop must be discarded (never shown as stubs) — the ghost store's
// `discardUnfinished` action is called on error/reopen.

const API_URL = process.env.NEXT_PUBLIC_API_URL

export function useGhostStream(sessionId: string | null) {
  useEffect(() => {
    if (!sessionId || !API_URL) return
    const source = new EventSource(`${API_URL}/api/stream/${sessionId}`)

    source.onopen = () => {
      logger.info('[ghost-stream] open', { sessionId })
    }

    source.onmessage = (e) => {
      let msg: RedisMessage
      try {
        msg = JSON.parse(e.data) as RedisMessage
      } catch (err) {
        logger.warn('[ghost-stream] invalid JSON', { data: e.data, err })
        return
      }
      switch (msg.type) {
        case 'spawn':
          useGhostStore.getState().spawn(msg.descriptor)
          useSessionStore.getState().clearDebounce()
          break
        case 'chunk':
          useGhostStore.getState().appendChunk(msg.target, msg.data)
          break
        case 'done':
          useGhostStore.getState().markDone()
          break
        case 'ping':
          break
        default:
          // Forward-compat: the protocol will grow (waiting/offer/withdraw).
          // Unknown types are logged and ignored — never thrown on.
          logger.warn('[ghost-stream] unknown message type', { msg })
      }
    }

    source.onerror = () => {
      // EventSource auto-reconnects; log and discard any partial pair.
      logger.info('[ghost-stream] error/reconnect — discarding un-done pairs')
      useGhostStore.getState().discardUnfinished()
    }

    return () => {
      source.close()
      useGhostStore.getState().reset()
    }
  }, [sessionId])
}
