"use client"

import { useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { logger } from "@/lib/logger"

// Silent anonymous sign-in on first visit (ARCHITECTURE.md — Auth Flow,
// Session 1). This is the slice of the `auth` story (IMPLEMENTATION-ORDER.md
// #9) that stands on its own: every Supabase write is checked against
// `auth.uid() = user_id` (cascading RLS), so without a session every write
// gets rejected, not just returns empty. The session-2+ middleware gate and
// the post-Session-Complete signup prompt are the rest of that story — held
// back because they depend on canvas-dashboard/session-lifecycle (#7/#8),
// which haven't landed (story 9's own "Depends On").
export function useAnonymousAuth() {
  useEffect(() => {
    let cancelled = false

    async function ensureSession() {
      const { data: { session }, error: getError } = await supabase.auth.getSession()
      if (getError) {
        logger.error("[auth] failed to read existing session", { error: getError })
        return
      }
      if (session) {
        logger.debug("[auth] existing session found", {
          userId: session.user.id,
          anonymous: session.user.is_anonymous,
        })
        return
      }

      const { data, error } = await supabase.auth.signInAnonymously()
      if (cancelled) return
      if (error) {
        logger.error("[auth] anonymous sign-in failed", { error })
        return
      }
      logger.info("[auth] signed in anonymously", { userId: data.user?.id })
    }

    void ensureSession()
    return () => {
      cancelled = true
    }
  }, [])
}
