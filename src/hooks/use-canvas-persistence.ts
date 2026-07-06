'use client'

import { useCallback, useEffect } from 'react'
import type { Edge, Node } from '@xyflow/react'
import * as api from '@/lib/api'
import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'
import {
  useCanvasStore,
  type CanvasEdge,
  type CanvasNode,
  type HumanNodeData,
} from '@/stores/canvas-store'
import { useSessionStore } from '@/stores/session-store'
import { useGhostStore, type GhostPairState } from '@/stores/ghost-store'
import type { EdgeType, RejectionReason } from '@/types'

// Owns the write-then-notify loop and canvas hydration.
// Components + node handlers call the actions returned here — no component
// touches supabase or api.ts directly.

type NodeRow = {
  id: string
  canvas_id: string
  session_id: string
  owner: 'human' | 'ai'
  content: string
  position_x: number | null
  position_y: number | null
}

type EdgeRow = {
  id: string
  canvas_id: string
  session_id: string
  from_node_id: string
  to_node_id: string
  edge_type: EdgeType
  both_existing: boolean
}

type CanvasRow = {
  id: string
  title: string | null
  original_intent: string
}

type SessionRow = {
  id: string
  canvas_id: string
  status: 'active' | 'closed'
  current_phase: 'diverging' | 'converging' | null
}

function nodeRowToFlowNode(row: NodeRow): CanvasNode {
  return {
    id: row.id,
    type: 'humanNode',
    position: { x: row.position_x ?? 0, y: row.position_y ?? 0 },
    data: { content: row.content, owner: row.owner } satisfies HumanNodeData,
  }
}

function edgeRowToFlowEdge(row: EdgeRow): CanvasEdge {
  return {
    id: row.id,
    source: row.from_node_id,
    target: row.to_node_id,
    type: `${row.edge_type}Edge`,
    data: { edge_type: row.edge_type, both_existing: row.both_existing },
  }
}

export function useCanvasPersistence(canvasId: string) {
  const setCanvas = useSessionStore((s) => s.setCanvas)
  const setSession = useSessionStore((s) => s.setSession)
  const setDebounceActive = useSessionStore((s) => s.setDebounceActive)
  const setGraph = useCanvasStore((s) => s.setGraph)

  // Persist-then-notify — write to Supabase, THEN POST /api/canvas-event.
  // Reversing the order races the backend's row read (API-CONTRACT.md).
  const persistNode = useCallback(
    async (node: CanvasNode) => {
      const session_id = useSessionStore.getState().session_id
      if (!session_id) {
        logger.warn('[persistence] persistNode with no active session', { node_id: node.id })
        return
      }
      const { error } = await supabase.from('nodes').insert({
        id: node.id,
        canvas_id: canvasId,
        session_id,
        owner: node.data.owner,
        content: node.data.content,
        position_x: node.position.x,
        position_y: node.position.y,
      })
      if (error) {
        logger.error('[persistence] node insert failed, rolling back', {
          node_id: node.id,
          error,
        })
        useCanvasStore.getState().removeNode(node.id)
        return
      }
      await api
        .canvasEvent({
          canvas_id: canvasId,
          session_id,
          event_type: 'node.created',
          node_id: node.id,
        })
        .catch((err) => {
          // Row is durable; notify is best-effort. Surface the miss for retry
          // logic in a later story — never re-order to notify-then-write.
          logger.warn('[persistence] canvas-event failed post-insert', { node_id: node.id, err })
        })
      setDebounceActive(node.id)
    },
    [canvasId, setDebounceActive],
  )

  const persistNodeContent = useCallback(
    async (id: string, content: string) => {
      // Known Gap #3: no update event exists — backend agents may act on stale
      // content until the event surface is extended. Do not invent one.
      const { error } = await supabase.from('nodes').update({ content }).eq('id', id)
      if (error) logger.error('[persistence] node update failed', { id, error })
    },
    [],
  )

  const persistNodePosition = useCallback(
    async (id: string, position: { x: number; y: number }) => {
      // Positions persist but never fire canvas-event — position is not a
      // thinking event (STATE-MANAGEMENT.md).
      const { error } = await supabase
        .from('nodes')
        .update({ position_x: position.x, position_y: position.y })
        .eq('id', id)
      if (error) logger.error('[persistence] node position update failed', { id, error })
    },
    [],
  )

  const persistEdge = useCallback(
    async (edge: CanvasEdge, edge_type: EdgeType, both_existing: boolean) => {
      const session_id = useSessionStore.getState().session_id
      if (!session_id) return
      const { error } = await supabase.from('edges').insert({
        id: edge.id,
        canvas_id: canvasId,
        session_id,
        from_node_id: edge.source,
        to_node_id: edge.target,
        edge_type,
        both_existing,
      })
      if (error) {
        logger.error('[persistence] edge insert failed, rolling back', { edge_id: edge.id, error })
        useCanvasStore.getState().removeEdge(edge.id)
        return
      }
      await api
        .canvasEvent({
          canvas_id: canvasId,
          session_id,
          event_type: 'edge.created',
          edge_id: edge.id,
        })
        .catch((err) =>
          logger.warn('[persistence] canvas-event failed post-edge-insert', { edge_id: edge.id, err }),
        )
    },
    [canvasId],
  )

  // Canvas hydration — runs once per mount.
  useEffect(() => {
    let cancelled = false

    async function hydrateCanvas() {
      // 1. Canvas meta + active session (create one via the backend if missing).
      const { data: canvasRow, error: canvasErr } = await supabase
        .from('canvases')
        .select('id, title, original_intent')
        .eq('id', canvasId)
        .maybeSingle<CanvasRow>()
      if (canvasErr || !canvasRow) {
        logger.error('[persistence] canvas load failed', { canvasId, error: canvasErr })
        return
      }
      if (cancelled) return
      setCanvas({
        canvas_id: canvasRow.id,
        title: canvasRow.title,
        original_intent: canvasRow.original_intent,
      })

      const { data: activeSession } = await supabase
        .from('sessions')
        .select('id, canvas_id, status, current_phase')
        .eq('canvas_id', canvasId)
        .eq('status', 'active')
        .maybeSingle<SessionRow>()

      let sessionId = activeSession?.id ?? null
      const phase = activeSession?.current_phase ?? 'diverging'
      if (!sessionId) {
        try {
          const started = await api.sessionStart({ canvas_id: canvasId })
          sessionId = started.session_id
        } catch (err) {
          logger.error('[persistence] session start failed', { canvasId, err })
        }
      }
      if (cancelled) return
      setSession(sessionId, phase)

      // Tier — read the current row for UpgradePrompt visibility only. Never
      // gate behaviour on this value (non-negotiable #8).
      const { data: subRow } = await supabase
        .from('subscriptions')
        .select('tier')
        .maybeSingle<{ tier: 'free' | 'pro' | 'power' }>()
      if (subRow?.tier && !cancelled) {
        useSessionStore.getState().setTier(subRow.tier)
      }

      // 2. All nodes + edges for the canvas (every session, not just active).
      const { data: nodeRows } = await supabase
        .from('nodes')
        .select('id, canvas_id, session_id, owner, content, position_x, position_y')
        .eq('canvas_id', canvasId)
        .returns<NodeRow[]>()
      const { data: edgeRows } = await supabase
        .from('edges')
        .select(
          'id, canvas_id, session_id, from_node_id, to_node_id, edge_type, both_existing',
        )
        .eq('canvas_id', canvasId)
        .returns<EdgeRow[]>()
      if (cancelled) return

      // 3. Map rows → React Flow shapes → canvas store.
      const flowNodes: Node[] = (nodeRows ?? []).map(nodeRowToFlowNode)
      const flowEdges: Edge[] = (edgeRows ?? []).map(edgeRowToFlowEdge)
      setGraph(flowNodes as CanvasNode[], flowEdges)
    }

    hydrateCanvas()
    return () => {
      cancelled = true
    }
  }, [canvasId, setCanvas, setSession, setGraph])

  // Materialize an accepted ghost pair — write owner:'ai' rows and their
  // connecting edges to Supabase, then report ghost-status.
  // ⚠ Do NOT fire POST /api/canvas-event for these rows: the agent pipeline
  //   must not react to its own output (API-CONTRACT Known Gap #5). Persist
  //   the parsed contextText/questionText, never the raw stream (Known Gap #6).
  const resolveGhostPair = useCallback(
    async (
      pair: GhostPairState,
      decision: {
        context: 'accepted' | 'rejected'
        question: 'accepted' | 'rejected' | null
        rejection_reason?: RejectionReason
      },
    ) => {
      const session_id = useSessionStore.getState().session_id
      if (!session_id) {
        logger.warn('[persistence] ghost-status with no active session')
        return
      }

      const triggerId = pair.descriptor.trigger_node_id
      const contextGhostId = pair.descriptor.context_node.ghost_id
      const questionGhostId = pair.descriptor.question_node?.ghost_id ?? null

      // 1. Materialize accepted node(s) and their connecting ghost edges.
      if (decision.context === 'accepted') {
        const trigger = useCanvasStore.getState().nodes.find((n) => n.id === triggerId)
        const anchor = trigger?.position ?? { x: 0, y: 0 }
        const contextNode: CanvasNode = {
          id: contextGhostId,
          type: 'humanNode',
          position: { x: anchor.x + 260, y: anchor.y - 40 },
          data: { content: pair.contextText, owner: 'ai' } satisfies HumanNodeData,
        }
        useCanvasStore.getState().addNode(contextNode)
        const { error: cErr } = await supabase.from('nodes').insert({
          id: contextNode.id,
          canvas_id: canvasId,
          session_id,
          owner: 'ai',
          content: pair.contextText,
          position_x: contextNode.position.x,
          position_y: contextNode.position.y,
        })
        if (cErr) {
          logger.error('[persistence] ghost context materialize failed', { id: contextGhostId, cErr })
          useCanvasStore.getState().removeNode(contextGhostId)
        } else {
          const edge: CanvasEdge = {
            id: crypto.randomUUID(),
            source: triggerId,
            target: contextGhostId,
            type: `${pair.descriptor.context_edge.edge_type}Edge`,
            data: { edge_type: pair.descriptor.context_edge.edge_type, both_existing: false },
          }
          useCanvasStore.getState().addEdge(edge)
          await supabase.from('edges').insert({
            id: edge.id,
            canvas_id: canvasId,
            session_id,
            from_node_id: edge.source,
            to_node_id: edge.target,
            edge_type: pair.descriptor.context_edge.edge_type,
            both_existing: false,
          })
        }
      }

      if (
        decision.question === 'accepted' &&
        questionGhostId &&
        pair.descriptor.question_edge
      ) {
        const trigger = useCanvasStore.getState().nodes.find((n) => n.id === triggerId)
        const anchor = trigger?.position ?? { x: 0, y: 0 }
        const qNode: CanvasNode = {
          id: questionGhostId,
          type: 'humanNode',
          position: { x: anchor.x + 260, y: anchor.y + 80 },
          data: { content: pair.questionText, owner: 'ai' } satisfies HumanNodeData,
        }
        useCanvasStore.getState().addNode(qNode)
        const { error: qErr } = await supabase.from('nodes').insert({
          id: qNode.id,
          canvas_id: canvasId,
          session_id,
          owner: 'ai',
          content: pair.questionText,
          position_x: qNode.position.x,
          position_y: qNode.position.y,
        })
        if (qErr) {
          logger.error('[persistence] ghost question materialize failed', { id: questionGhostId, qErr })
          useCanvasStore.getState().removeNode(questionGhostId)
        } else {
          const qEdge: CanvasEdge = {
            id: crypto.randomUUID(),
            source: pair.descriptor.question_edge.from,
            target: pair.descriptor.question_edge.to,
            type: `${pair.descriptor.question_edge.edge_type}Edge`,
            data: {
              edge_type: pair.descriptor.question_edge.edge_type,
              both_existing: false,
            },
          }
          useCanvasStore.getState().addEdge(qEdge)
          await supabase.from('edges').insert({
            id: qEdge.id,
            canvas_id: canvasId,
            session_id,
            from_node_id: qEdge.source,
            to_node_id: qEdge.target,
            edge_type: pair.descriptor.question_edge.edge_type,
            both_existing: false,
          })
        }
      }

      // 2. Report ghost-status — one call, both statuses. Requires
      //    thread_id + turn_index from the pair meta (Known Gap #1).
      if (pair.meta) {
        await api
          .ghostStatus({
            thread_id: pair.meta.thread_id,
            turn_index: pair.meta.turn_index,
            canvas_id: canvasId,
            session_id,
            context_node_status: decision.context,
            question_node_status: decision.question,
            rejection_reason: decision.rejection_reason,
            interacted_at: Date.now(),
          })
          .catch((err) => logger.warn('[persistence] ghost-status failed', { err }))
      } else {
        logger.warn('[persistence] ghost-status skipped — no thread_id/turn_index on pair (Gap #1)', {
          triggerId,
        })
      }

      // 3. Drop the pending pair from the ghost store.
      useGhostStore.getState().resolve(triggerId)
    },
    [canvasId],
  )

  return {
    persistNode,
    persistNodeContent,
    persistNodePosition,
    persistEdge,
    resolveGhostPair,
  }
}
