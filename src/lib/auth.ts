import type { User } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"
import { logger } from "@/lib/logger"

// Ensures there is a Supabase session, signing in anonymously if there isn't
// one yet (ARCHITECTURE.md — Auth Flow, Session 1). Every canvas read/write is
// checked against `auth.uid() = user_id` (cascading RLS), so without a session
// a read returns empty and a write is rejected. Idempotent — safe to await
// from anywhere that's about to touch Supabase (dashboard list, canvas create,
// canvas hydration). Returns the current user, or null if sign-in failed.
export async function ensureAnonSession(): Promise<User | null> {
  const { data: { session }, error: getError } = await supabase.auth.getSession()
  if (getError) {
    logger.error("[auth] failed to read existing session", { error: getError })
    return null
  }
  if (session) return session.user

  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) {
    logger.error("[auth] anonymous sign-in failed", { error })
    return null
  }
  logger.info("[auth] signed in anonymously", { userId: data.user?.id })
  return data.user ?? null
}
