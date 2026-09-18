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

export type AuthResult = { ok: true; needsEmailConfirmation?: boolean } | { ok: false; error: string }

// The one redirect target for every OAuth round trip — deliberately NO
// query string. Supabase's redirect allow-list (thinking-canvas-be's
// supabase/config.toml `additional_redirect_urls`) matches this URL
// EXACTLY; appending `?next=...` here makes it stop matching, and Supabase
// silently falls back to `site_url` instead — landing the user on whatever
// else happens to be running on that port (learned the hard way: local dev
// often shares one Supabase instance across projects, and a query-string
// mismatch bounced this flow into an unrelated app entirely). `next` is
// carried through sessionStorage instead — see continueWithGoogle below.
function callbackUrl(): string {
  return `${window.location.origin}/auth/callback`
}

// Shared with components/auth/PostAuthRedirect.tsx, the other half of this
// handoff — exported so the two never drift to different key strings.
export const POST_AUTH_REDIRECT_KEY = "tc-post-auth-redirect"

// "Continue with Google" — branches on whether the CURRENT session is
// anonymous, per ARCHITECTURE.md's Auth Flow:
//   anonymous  → linkIdentity: attaches Google to the SAME auth.uid(), so
//                every canvas already written under that anonymous session
//                carries over with no migration.
//   permanent, or no session at all → signInWithOAuth: an ordinary sign-in
//                (or first-time signup) against whatever account Google
//                resolves to — a different uid than any local anonymous one,
//                which is the expected trade-off of choosing "sign in" over
//                "save this session".
// Both are PKCE redirects; this function only kicks the redirect off; the
// actual session lands via /auth/callback. `next` can't travel as a query
// param on `redirectTo` (see callbackUrl's comment) — sessionStorage
// survives the round trip to Google and back on the same browser, which a
// server-set cookie or the URL both would too, but this is the least
// machinery for a same-tab redirect. /auth/callback falls back to "/" if
// it's missing (a fresh tab, or the user cleared storage mid-flow).
export async function continueWithGoogle(next = "/"): Promise<AuthResult> {
  const user = await ensureAnonSession()
  try {
    sessionStorage.setItem(POST_AUTH_REDIRECT_KEY, next)
  } catch {
    // Private-window/blocked storage — non-fatal, just lands on "/" instead.
  }
  const options = { redirectTo: callbackUrl() }
  const { error } = user?.is_anonymous
    ? await supabase.auth.linkIdentity({ provider: "google", options })
    : await supabase.auth.signInWithOAuth({ provider: "google", options })

  if (error) {
    logger.error("[auth] Google OAuth redirect failed to start", { error })
    return { ok: false, error: error.message }
  }
  // Success here just means the redirect began — the browser is about to
  // navigate away, so there's no further local state to set.
  return { ok: true }
}

// Email/password conversion or signup, same anonymous-branch reasoning as
// continueWithGoogle: an anonymous session upgrades in place via
// updateUser (same uid, keeps every canvas); anything else is a fresh
// supabase.auth.signUp. Supabase sends a confirmation email either way when
// the project has email confirmations on — `needsEmailConfirmation` lets the
// caller show the right copy instead of assuming the session is live yet.
export async function signUpWithEmail(email: string, password: string): Promise<AuthResult> {
  const user = await ensureAnonSession()

  if (user?.is_anonymous) {
    const { data, error } = await supabase.auth.updateUser({ email, password })
    if (error) {
      logger.error("[auth] anonymous→permanent conversion failed", { error })
      return { ok: false, error: error.message }
    }
    logger.info("[auth] converted anonymous session to permanent account", { userId: data.user?.id })
    // Supabase requires confirming the new email address before it takes
    // effect on an identity-linking update — the uid (and its canvases)
    // already belong to this account either way.
    return { ok: true, needsEmailConfirmation: true }
  }

  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) {
    logger.error("[auth] sign-up failed", { error })
    return { ok: false, error: error.message }
  }
  logger.info("[auth] signed up", { userId: data.user?.id })
  return { ok: true, needsEmailConfirmation: !data.session }
}

// Ordinary sign-in against an existing permanent account — never used for
// conversion (that always goes through signUpWithEmail/continueWithGoogle),
// only for the "I already have an account" path on /login.
export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    logger.error("[auth] sign-in failed", { error })
    return { ok: false, error: error.message }
  }
  logger.info("[auth] signed in", { userId: data.user?.id })
  return { ok: true }
}
