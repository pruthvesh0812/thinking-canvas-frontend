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

export type AuthResult =
  | { ok: true; needsEmailConfirmation?: boolean }
  | { ok: false; error: string; code?: string }

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

// Email "create account" — ALWAYS an anonymous→permanent conversion, never a
// fresh supabase.auth.signUp, because every visitor already has an anonymous
// session (AnonymousAuthGate) and converting in place keeps the same uid, so
// every canvas carries over.
//
// Two steps, per Supabase's anonymous-conversion docs ("to add a password for
// the anonymous user, the user's email needs to be verified first"):
//   1. here — updateUser({ email }) starts an email-change: Supabase mails a
//      confirmation link; until it's clicked the user stays anonymous (and
//      proxy.ts keeps treating them as such) with the address parked in
//      `user.new_email`.
//   2. after the link lands back via /auth/callback, the account page offers
//      "Set a password" (setPassword below).
// Passing a password in step 1 (what this used to do) isn't valid for an
// unverified anonymous user, so there's deliberately no password param.
//
// emailRedirectTo matters as much as the OAuth redirectTo: it has to exact-
// match Supabase's `additional_redirect_urls` or the confirmation link falls
// back to `site_url` (another app's port, locally).
export async function signUpWithEmail(email: string): Promise<AuthResult> {
  const user = await ensureAnonSession()
  if (!user?.is_anonymous) {
    return { ok: false, error: "You're already signed in — sign out first to create a different account." }
  }

  const { data, error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: callbackUrl() })
  if (error) {
    logger.error("[auth] anonymous→permanent conversion failed to start", { error })
    return { ok: false, error: error.message }
  }

  // Ask Supabase what actually happened instead of assuming a link was sent.
  // When the project requires confirmation, the address is parked in
  // `new_email` until the link is clicked. When it auto-confirms (local dev:
  // `enable_confirmations = false` → GOTRUE_MAILER_AUTOCONFIRM) the change is
  // applied immediately — no email is sent at all and the user is already
  // permanent, so telling them to "check your email" would be a lie.
  const pending = Boolean(data.user?.new_email)
  logger.info(pending ? "[auth] email confirmation sent for anonymous conversion" : "[auth] email applied immediately (auto-confirm)", {
    userId: user.id,
  })
  return { ok: true, needsEmailConfirmation: pending }
}

// Ordinary sign-in against an existing permanent account — never used for
// conversion (that always goes through signUpWithEmail/continueWithGoogle),
// only for the "I already have an account" path on /login. Surfaces
// Supabase's error `code` so the caller can offer "resend confirmation" on
// `email_not_confirmed` (only reachable once the project has email
// confirmations enabled — off in local dev, on in prod).
export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    logger.error("[auth] sign-in failed", { error })
    return { ok: false, error: error.message, code: error.code }
  }
  logger.info("[auth] signed in", { userId: data.user?.id })
  return { ok: true }
}

// Step 2 of email conversion, and the ordinary "change password" too — same
// call either way. Only valid once the email is verified (Supabase rejects
// it for an unverified anonymous user, which the account page never offers).
export async function setPassword(password: string): Promise<AuthResult> {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    logger.error("[auth] password update failed", { error })
    return { ok: false, error: error.message }
  }
  logger.info("[auth] password updated")
  return { ok: true }
}

// Re-sends the confirmation email for whichever flow is pending:
//   'email_change' — an anonymous user's parked new_email (signUpWithEmail)
//   'signup'       — a fresh signUp still awaiting confirmation (prod, once
//                    enable_confirmations is on)
export async function resendVerification(email: string, type: "email_change" | "signup"): Promise<AuthResult> {
  const { error } = await supabase.auth.resend({ type, email, options: { emailRedirectTo: callbackUrl() } })
  if (error) {
    logger.error("[auth] resend verification failed", { type, error })
    return { ok: false, error: error.message }
  }
  logger.info("[auth] verification email re-sent", { type })
  return { ok: true }
}

// Local-scope sign-out: ends THIS browser's session only. signOut()'s
// default is 'global' — it would also kill the user's sessions on every
// other device, which is more than "log me out" means. The caller follows
// this with a hard navigation (window.location.assign) rather than a
// client-side router push so every in-memory Zustand store (canvas nodes,
// session, ghosts) is discarded — otherwise the previous user's canvas
// would still be sitting in memory for whoever signs in next.
export async function signOut(): Promise<AuthResult> {
  const { error } = await supabase.auth.signOut({ scope: "local" })
  if (error) {
    logger.error("[auth] sign-out failed", { error })
    return { ok: false, error: error.message }
  }
  logger.info("[auth] signed out")
  return { ok: true }
}
