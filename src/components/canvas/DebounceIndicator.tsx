'use client'

import { NodeToolbar, Position } from '@xyflow/react'
import { useSessionStore } from '@/stores/session-store'

// Subtle pulsing dot near the most recently written node while the backend's
// debounce window is plausibly open. Never blocking — this is a hint, not a
// contract (CORE-CONCEPTS.md → Debounce Contract).
export function DebounceIndicator() {
  const activeId = useSessionStore((s) => s.debounce_active_node_id)
  if (!activeId) return null
  return (
    <>
      <style>{`
        @keyframes tc-debounce-pulse {
          0%, 100% { transform: scale(1); opacity: 0.7; }
          50%      { transform: scale(1.4); opacity: 1; }
        }
        .tc-debounce-dot { animation: tc-debounce-pulse 1.4s ease-in-out infinite; }
      `}</style>
      <NodeToolbar nodeId={activeId} position={Position.Right} isVisible offset={4}>
        <div
          className="tc-debounce-dot h-2 w-2 rounded-full bg-indigo-500"
          title="AI is reading what you just built"
        />
      </NodeToolbar>
    </>
  )
}
