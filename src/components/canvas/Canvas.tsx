'use client'

import { useCallback, useEffect } from 'react'
import {
  Background,
  Controls,
  ReactFlow,
  type NodeChange,
  type NodeTypes,
  applyNodeChanges,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { HumanNode } from './nodes/HumanNode'
import { NorthStarHeader } from './NorthStarHeader'
import { useCanvasStore, type CanvasNode } from '@/stores/canvas-store'
import { useSessionStore } from '@/stores/session-store'
import { useCanvasPersistence } from '@/hooks/use-canvas-persistence'
import { logger } from '@/lib/logger'

// Module-scope — recreating this per render forces React Flow to remount every
// custom node type (CANVAS-RENDERING.md).
const nodeTypes: NodeTypes = {
  humanNode: HumanNode,
}

export function Canvas({ canvasId }: { canvasId: string }) {
  const nodes = useCanvasStore((s) => s.nodes)
  const edges = useCanvasStore((s) => s.edges)
  const addNode = useCanvasStore((s) => s.addNode)
  const setGraph = useCanvasStore((s) => s.setGraph)
  const updateNodePosition = useCanvasStore((s) => s.updateNodePosition)

  const { persistNode, persistNodeContent, persistNodePosition } =
    useCanvasPersistence(canvasId)

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
      // Client-generated UUID — no DB round-trip to learn the id.
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

  return (
    <div className="flex h-screen w-full flex-col">
      <NorthStarHeader />
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onPaneClick={onPaneClick}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  )
}
