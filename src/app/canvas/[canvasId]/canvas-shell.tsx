'use client'

import Link from 'next/link'
import { Canvas } from '@/components/canvas/Canvas'
import { useCanvasHydration } from '@/hooks/use-canvas-hydration'

// Loads the real canvas addressed by the route (its nodes/edges, active
// session, north star) before rendering the surface. Hydration also owns the
// anonymous sign-in that RLS needs, so there's no separate auth call here.
// In mock mode the hook no-ops and reports ready immediately, leaving the
// seeded demo graph in canvas-store.
export function CanvasShell({ canvasId }: { canvasId: string }) {
  const status = useCanvasHydration(canvasId)

  if (status === 'loading') {
    return (
      <main
        className="tc-scope flex min-h-screen items-center justify-center"
        style={{ background: 'var(--tc-surface)' }}
      >
        <span className="text-[13px]" style={{ color: 'var(--tc-chrome-quiet)' }}>
          Loading canvas…
        </span>
      </main>
    )
  }

  if (status === 'not-found' || status === 'error') {
    return (
      <main
        className="tc-scope flex min-h-screen flex-col items-center justify-center gap-4"
        style={{ background: 'var(--tc-surface)' }}
      >
        <span className="text-[14px]" style={{ color: 'var(--tc-ink)' }}>
          {status === 'not-found' ? "This canvas doesn't exist or isn't yours." : 'Something went wrong loading this canvas.'}
        </span>
        <Link href="/" className="text-[12.5px]" style={{ color: 'var(--tc-chrome-quiet)' }}>
          ← back to canvases
        </Link>
      </main>
    )
  }

  return <Canvas />
}
