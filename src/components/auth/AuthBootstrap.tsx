'use client'

import { useEffect } from 'react'
import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'

// Silently signs the user in anonymously on first mount. First-session
// zero-friction is a product decision (SESSION-FLOWS.md). Idempotent — a
// signed-in user (anon or permanent) short-circuits.
export function AuthBootstrap() {
  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      if (data?.user) return
      const { error } = await supabase.auth.signInAnonymously()
      if (error) logger.warn('[auth] anonymous sign-in failed', { error })
    })()
  }, [])
  return null
}
