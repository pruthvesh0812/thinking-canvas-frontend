'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Background,
  Controls,
  ReactFlow,
  type Connection,
  type EdgeTypes,
  type NodeChange,
  type NodeTypes,
  applyNodeChanges,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { HumanNode } from './nodes/HumanNode'
import { NorthStarHeader } from './NorthStarHeader'
import { EdgeTypeSelector } from './EdgeTypeSelector'
import { LogicalEdge } from './edges/LogicalEdge'
import { DoubtEdge } from './edges/DoubtEdge'
import { QuestionEdge } from './edges/QuestionEdge'
import { AssociativeEdge } from './edges/AssociativeEdge'
import {
  useCanvasStore,
  type CanvasEdge,
  type CanvasNode,
} from '@/stores/canvas-store'
import { useSessionStore } from '@/stores/session-store'
import { useCanvasPersistence } from '@/hooks/use-canvas-persistence'
import { logger } from '@/lib/logger'
import type { EdgeType } from '@/types'

// Module-scope — recreating these per render forces React Flow to remount
// every custom node/edge type (CANVAS-RENDERING.md).
const nodeTypes: NodeTypes = {
  humanNode: HumanNode,
}

const edgeTypes: EdgeTypes = {
  logicalEdge: LogicalEdge,
  doubtEdge: DoubtEdge,
  questionEdge: QuestionEdge,
  associativeEdge: AssociativeEdge,
}

type PendingConnection = {
  connection: Connection
  point: { x: number; y: number }
}

export function Canvas({ canvasId }: { canvasId: string }) {
  const nodes = useCanvasStore((s) => s.nodes)
  const edges = useCanvasStore((s) => s.edges)
  const addNode = useCanvasStore((s) => s.addNode)
  const addEdge = useCanvasStore((s) => s.addEdge)
  const setGraph = useCanvasStore((s) => s.setGraph)
  const updateNodePosition = useCanvasStore((s) => s.updateNodePosition)

  const { persistNode, persistNodeContent, persistNodePosition, persistEdge } =
    useCanvasPersistence(canvasId)

  const [pending, setPending] = useState<PendingConnection | null>(null)

  // First-content-blur commit — the HumanNode dispatches this event so its
  // component stays hook-free (see HumanNode.tsx).
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

  // onConnect just captures the connection; the row is not written until the
  // selector chooses a type — a default-typed edge would mis-route agents
  // backend-side (see story: edge-system risks).
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
      // both_existing = true here: the user drew this edge between two nodes
      // that both already exist (retrospective connection). The child-creation
      // gesture (which would set it false) is not implemented yet — a future
      // story will branch on gesture origin.
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

  return (
    <div className="relative flex h-screen w-full flex-col">
      <NorthStarHeader />
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onPaneClick={onPaneClick}
          onConnect={onConnect}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
      {pending && (
        <EdgeTypeSelector
          position={pending.point}
          onSelect={handleTypeSelected}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  )
}
