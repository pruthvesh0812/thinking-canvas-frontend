'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Canvas } from '@/components/canvas/Canvas'
import { SessionLanding } from '@/components/session/SessionLanding'
import { useCanvasHydration } from '@/hooks/use-canvas-hydration'
import { useSessionStore } from '@/stores/session-store'

// Loads the real canvas addressed by the route (its nodes/edges, active
// session, north star) before rendering the surface. Hydration also owns the
// anonymous sign-in that RLS needs, so there's no separate auth call here.
// In mock mode the hook no-ops and reports ready immediately, leaving the
// seeded demo graph in canvas-store.
export function CanvasShell({ canvasId }: { canvasId: string }) {
  const { status, showSessionLanding } = useCanvasHydration(canvasId)
  // Local, not store state — a one-shot "the human already answered
  // SessionLanding's question this visit" flag. showSessionLanding itself
  // stays true for the rest of this mount once hydration sets it (see the
  // hook), so this is what actually makes the landing screen go away.
  const [landingDismissed, setLandingDismissed] = useState(false)
  const viewSession = useSessionStore((s) => s.viewSession)

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

  if (showSessionLanding && !landingDismissed) {
    return (
      <SessionLanding
        onContinue={() => setLandingDismissed(true)}
        onViewSession={(sessionNumber) => {
          viewSession(sessionNumber)
          setLandingDismissed(true)
        }}
      />
    )
  }

  return <Canvas />
}
