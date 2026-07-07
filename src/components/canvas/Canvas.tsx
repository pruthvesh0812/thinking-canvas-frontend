'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Background,
  Controls,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeChange,
  type NodeTypes,
  applyNodeChanges,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { HumanNode } from './nodes/HumanNode'
import { NorthStarHeader } from './NorthStarHeader'
import { EdgeTypeSelector } from './EdgeTypeSelector'
import { DebounceIndicator } from './DebounceIndicator'
import { LogicalEdge } from './edges/LogicalEdge'
import { DoubtEdge } from './edges/DoubtEdge'
import { QuestionEdge } from './edges/QuestionEdge'
import { AssociativeEdge } from './edges/AssociativeEdge'
import { GhostEdge } from './edges/GhostEdge'
import { GhostContextNode } from '@/components/ghost/GhostContextNode'
import { GhostQuestionNode } from '@/components/ghost/GhostQuestionNode'
import {
  useCanvasStore,
  type CanvasEdge,
  type CanvasNode,
} from '@/stores/canvas-store'
import { useGhostStore } from '@/stores/ghost-store'
import { useSessionStore } from '@/stores/session-store'
import { useCanvasPersistence } from '@/hooks/use-canvas-persistence'
import { useGhostStream } from '@/hooks/use-ghost-stream'
import { useDebounceIndicator } from '@/hooks/use-debounce-indicator'
import { logger } from '@/lib/logger'
import { UpgradePrompt } from '@/components/ui/UpgradePrompt'
import type { EdgeType } from '@/types'

// Module-scope — recreating these per render forces React Flow to remount
// every custom node/edge type (CANVAS-RENDERING.md).
const nodeTypes: NodeTypes = {
  humanNode: HumanNode,
  ghostContext: GhostContextNode,
  ghostQuestion: GhostQuestionNode,
}

const edgeTypes: EdgeTypes = {
  logicalEdge: LogicalEdge,
  doubtEdge: DoubtEdge,
  questionEdge: QuestionEdge,
  associativeEdge: AssociativeEdge,
  ghostEdge: GhostEdge,
}

type PendingConnection = {
  connection: Connection
  point: { x: number; y: number }
}

// Ghost frames float near the trigger node — non-blocking, above the real
// layer. Layout comes from the SpawnDescriptor alone (non-negotiable #3).
function ghostOffset(index: number) {
  return { x: 260, y: index === 0 ? -40 : 80 }
}

export function Canvas({ canvasId }: { canvasId: string }) {
  const nodes = useCanvasStore((s) => s.nodes)
  const edges = useCanvasStore((s) => s.edges)
  const addNode = useCanvasStore((s) => s.addNode)
  const addEdge = useCanvasStore((s) => s.addEdge)
  const setGraph = useCanvasStore((s) => s.setGraph)
  const updateNodePosition = useCanvasStore((s) => s.updateNodePosition)

  const ghostPairs = useGhostStore((s) => s.pairs)
  const sessionId = useSessionStore((s) => s.session_id)

  const {
    persistNode,
    persistNodeContent,
    persistNodePosition,
    persistEdge,
    resolveGhostPair,
  } = useCanvasPersistence(canvasId)

  useGhostStream(sessionId)
  useDebounceIndicator()

  const [pending, setPending] = useState<PendingConnection | null>(null)
  const [showUpgrade, setShowUpgrade] = useState(false)

  useEffect(() => {
    // Once-per-session prompt: dismissible; re-arms only on next mount.
    function onPrompt() {
      setShowUpgrade(true)
    }
    window.addEventListener('tc:upgrade-prompt', onPrompt)
    return () => window.removeEventListener('tc:upgrade-prompt', onPrompt)
  }, [])

  useEffect(() => {
    async function onCommit(e: Event) {
      const { id, content, hadContent } = (e as CustomEvent).detail
      const node = useCanvasStore.getState().nodes.find((n) => n.id === id)
      if (!node) return
      if (!hadContent) {
        await persistNode({ ...node, data: { ...node.data, content } })
      } else {
        await persistNodeContent(id, content)
      }
    }
    window.addEventListener('canvas:node-commit', onCommit)
    return () => window.removeEventListener('canvas:node-commit', onCommit)
  }, [persistNode, persistNodeContent])

  // Ghost accept/reject/acknowledge — pair actions are dispatched from the
  // per-node GhostControls so ghost components stay hook-free.
  useEffect(() => {
    const pendingDecision: Record<
      string,
      { context?: 'accepted' | 'rejected'; question?: 'accepted' | 'rejected' | null; reason?: import('@/types').RejectionReason }
    > = {}

    async function onDecision(e: Event) {
      const { triggerNodeId, side, decision, reason } = (e as CustomEvent).detail as {
        triggerNodeId: string
        side: 'context' | 'question'
        decision: 'accepted' | 'rejected' | 'acknowledged'
        reason?: import('@/types').RejectionReason
      }
      const pair = useGhostStore.getState().pairs[triggerNodeId]
      if (!pair) return

      // Acknowledge (appreciation) = accept context, no question, no reason.
      if (decision === 'acknowledged') {
        await resolveGhostPair(pair, { context: 'accepted', question: null })
        return
      }

      pendingDecision[triggerNodeId] = pendingDecision[triggerNodeId] ?? {}
      const entry = pendingDecision[triggerNodeId]
      if (side === 'context') entry.context = decision
      else entry.question = decision
      if (reason) entry.reason = reason

      // Resolve when both sides are in — or when the pair has no question node.
      const needsQuestion = Boolean(pair.descriptor.question_node)
      const bothIn = entry.context !== undefined && (!needsQuestion || entry.question !== undefined)
      if (!bothIn) return

      await resolveGhostPair(pair, {
        context: entry.context!,
        question: needsQuestion ? entry.question! : null,
        rejection_reason: entry.reason,
      })
      delete pendingDecision[triggerNodeId]
    }

    window.addEventListener('ghost:decision', onDecision)
    return () => window.removeEventListener('ghost:decision', onDecision)
  }, [resolveGhostPair])

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setGraph(applyNodeChanges(changes, nodes) as CanvasNode[], edges)
      for (const change of changes) {
        if (change.type === 'position' && change.dragging === false && change.position) {
          updateNodePosition(change.id, change.position)
          persistNodePosition(change.id, change.position)
        }
      }
    },
    [nodes, edges, setGraph, updateNodePosition, persistNodePosition],
  )

  const onPaneClick = useCallback(
    (event: React.MouseEvent) => {
      const canvas = useSessionStore.getState().canvas
      if (!canvas) return
      const id = crypto.randomUUID()
      addNode({
        id,
        type: 'humanNode',
        position: { x: event.clientX - 120, y: event.clientY - 80 },
        data: { content: '', owner: 'human' },
      })
      logger.info('[canvas] node created (pending first-blur commit)', { id })
    },
    [addNode],
  )

  const onConnect = useCallback((connection: Connection, event?: MouseEvent | TouchEvent) => {
    const point =
      event && 'clientX' in event
        ? { x: event.clientX, y: event.clientY }
        : { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    setPending({ connection, point })
  }, [])

  const handleTypeSelected = useCallback(
    async (edge_type: EdgeType) => {
      if (!pending) return
      const { connection } = pending
      if (!connection.source || !connection.target) {
        setPending(null)
        return
      }
      const both_existing = true
      const id = crypto.randomUUID()
      const edge: CanvasEdge = {
        id,
        source: connection.source,
        target: connection.target,
        type: `${edge_type}Edge`,
        data: { edge_type, both_existing },
      }
      addEdge(edge)
      setPending(null)
      await persistEdge(edge, edge_type, both_existing)
    },
    [pending, addEdge, persistEdge],
  )

  // Merge the real graph with the ghost layer. Ghosts derive strictly from
  // SpawnDescriptor — no invented structure. Anchors read the trigger node's
  // current position from the store so ghosts follow drag.
  const mergedNodes = useMemo<Node[]>(() => {
    const anchors = new Map(nodes.map((n) => [n.id, n.position]))
    const ghostNodes: Node[] = []
    Object.values(ghostPairs).forEach((pair) => {
      const anchor = anchors.get(pair.descriptor.trigger_node_id)
      if (!anchor) return
      const contextOff = ghostOffset(0)
      const isAppreciation = pair.nodeType === 'appreciation' && !pair.descriptor.question_node
      ghostNodes.push({
        id: pair.descriptor.context_node.ghost_id,
        type: 'ghostContext',
        position: { x: anchor.x + contextOff.x, y: anchor.y + contextOff.y },
        selectable: false,
        draggable: false,
        data: {
          nodeType: pair.nodeType,
          agentRole: pair.descriptor.context_node.agent_role,
          contextText: pair.contextText,
          articulations: pair.articulations,
          streamed: pair.streamed,
          isAppreciation,
          triggerNodeId: pair.descriptor.trigger_node_id,
        },
      })
      if (pair.descriptor.question_node) {
        const qOff = ghostOffset(1)
        ghostNodes.push({
          id: pair.descriptor.question_node.ghost_id,
          type: 'ghostQuestion',
          position: { x: anchor.x + qOff.x, y: anchor.y + qOff.y },
          selectable: false,
          draggable: false,
          data: {
            questionText: pair.questionText,
            streamed: pair.streamed,
            triggerNodeId: pair.descriptor.trigger_node_id,
          },
        })
      }
    })
    return [...nodes, ...ghostNodes]
  }, [nodes, ghostPairs])

  const mergedEdges = useMemo<Edge[]>(() => {
    const ghostEdges: Edge[] = []
    Object.values(ghostPairs).forEach((pair) => {
      ghostEdges.push({
        id: `${pair.descriptor.context_node.ghost_id}:edge`,
        source: pair.descriptor.trigger_node_id,
        target: pair.descriptor.context_node.ghost_id,
        type: 'ghostEdge',
        selectable: false,
      })
      if (pair.descriptor.question_node) {
        ghostEdges.push({
          id: `${pair.descriptor.question_node.ghost_id}:edge`,
          source: pair.descriptor.context_node.ghost_id,
          target: pair.descriptor.question_node.ghost_id,
          type: 'ghostEdge',
          selectable: false,
        })
      }
    })
    return [...edges, ...ghostEdges]
  }, [edges, ghostPairs])

  return (
    <div className="relative flex h-screen w-full flex-col">
      <NorthStarHeader />
      <div className="flex-1">
        <ReactFlow
          nodes={mergedNodes}
          edges={mergedEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onPaneClick={onPaneClick}
          onConnect={onConnect}
          fitView
        >
          <Background />
          <Controls />
          <DebounceIndicator />
        </ReactFlow>
      </div>
      {pending && (
        <EdgeTypeSelector
          position={pending.point}
          onSelect={handleTypeSelected}
          onCancel={() => setPending(null)}
        />
      )}
      {showUpgrade && <UpgradePrompt onDismiss={() => setShowUpgrade(false)} />}
    </div>
  )
}
