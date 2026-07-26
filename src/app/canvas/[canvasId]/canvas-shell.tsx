'use client'

import { Canvas } from '@/components/canvas/Canvas'

// canvasId will select which canvas/session to hydrate once
// canvas-dashboard/session-lifecycle land (STATE-MANAGEMENT.md — Canvas
// Hydration). This pass renders the one seeded retention canvas regardless
// of id.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- canvasId is wired once canvas-dashboard lands
export function CanvasShell({ canvasId }: { canvasId: string }) {
  return <Canvas />
}
