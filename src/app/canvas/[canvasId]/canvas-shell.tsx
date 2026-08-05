'use client'

import { useMemo } from 'react'
import { ReactFlow, Background, Controls, type Node, type NodeTypes } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { NorthStarHeader } from '@/components/canvas/NorthStarHeader'
import { CarriedForwardNode } from '@/components/session/CarriedForwardNode'
import { PhaseToggle } from '@/components/session/PhaseToggle'
import { SessionCompleteModal } from '@/components/session/SessionCompleteModal'
import { useSessionLifecycle } from '@/hooks/use-session-lifecycle'
import { useSessionStore } from '@/stores/session-store'

// Registered once at module scope — React Flow re-renders the whole graph if
// this object is recreated per render (CANVAS-RENDERING.md).
const nodeTypes = {
  carriedForward: CarriedForwardNode,
} satisfies NodeTypes

// Carried threads get their own column on the left rather than being scattered
// into the graph — a dedicated area, ready to continue (SESSION-FLOWS.md).
const CARRIED_COLUMN_X = -320
const CARRIED_ROW_HEIGHT = 150

export function CanvasShell({ canvasId }: { canvasId: string }) {
  const hydration = useSessionLifecycle(canvasId)
  const carried = useSessionStore((s) => s.carried)
  const error = useSessionStore((s) => s.error)
  const completeSession = useSessionStore((s) => s.completeSession)

  const carriedNodes = useMemo<Node[]>(
    () =>
      carried.map((item, index) => ({
        id: `carried-${item.id}`,
        type: 'carriedForward',
        position: { x: CARRIED_COLUMN_X, y: index * CARRIED_ROW_HEIGHT },
        data: { content: item.content, type: item.type, origin: item.origin },
        draggable: true,
        selectable: false,
      })),
    [carried],
  )

  return (
    <div className="flex h-screen w-full flex-col">
      <NorthStarHeader />

      <header className="flex items-center justify-between gap-4 border-b border-zinc-200 px-6 py-2 dark:border-zinc-800">
        <PhaseToggle />
        <div className="flex items-center gap-3">
          {hydration === 'loading' && (
            <span className="text-xs text-zinc-400">Opening session…</span>
          )}
          {error && <span className="text-xs text-amber-600">{error}</span>}
          <button
            type="button"
            disabled={hydration !== 'ready'}
            onClick={() => void completeSession()}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium disabled:opacity-40 dark:border-zinc-700"
          >
            Session complete
          </button>
        </div>
      </header>

      <div className="flex-1">
        <ReactFlow nodes={carriedNodes} edges={[]} nodeTypes={nodeTypes} fitView>
          <Background />
          <Controls />
        </ReactFlow>
      </div>

      <SessionCompleteModal />
    </div>
  )
}
