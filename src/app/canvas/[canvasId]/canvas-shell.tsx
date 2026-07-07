'use client'

import { ReactFlow, Background, Controls } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

export function CanvasShell({ canvasId }: { canvasId: string }) {
  return (
    <div className="flex h-screen w-full flex-col">
      <header className="border-b border-zinc-200 px-4 py-2 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
        canvas: {canvasId}
      </header>
      <div className="flex-1">
        <ReactFlow nodes={[]} edges={[]} fitView>
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  )
}
