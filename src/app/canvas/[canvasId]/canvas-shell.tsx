'use client'

import { Canvas } from '@/components/canvas/Canvas'
import { useAnonymousAuth } from '@/hooks/use-anonymous-auth'

// canvasId will select which canvas/session to hydrate once
// canvas-dashboard/session-lifecycle land (STATE-MANAGEMENT.md — Canvas
// Hydration). This pass renders the one seeded retention canvas regardless
// of id.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- canvasId is wired once canvas-dashboard lands
export function CanvasShell({ canvasId }: { canvasId: string }) {
  // Scoped here (not the root layout): this is the one surface that writes
  // to Supabase today, and every write needs a real auth.uid() for RLS to
  // pass (auth story #9, pulled forward — see .ai/features/auth/story.md).
  // Keeping it off the root layout also keeps supabase.ts out of the static
  // prerender path for pages that don't need it (/, /login, /settings).
  useAnonymousAuth()
  return <Canvas />
}
