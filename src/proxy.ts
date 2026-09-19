import { NextResponse, type NextRequest } from "next/server"
import { createMiddlewareClient } from "@/lib/supabase-middleware"
import { logger } from "@/lib/logger"

// The "session 2+" gate (SESSION-FLOWS.md → Auth Gating, ARCHITECTURE.md →
// Auth Flow): session 1 is zero-friction for an anonymous user; from their
// second session/canvas on, a permanent account is required. Scoped to
// /canvas/* only — the dashboard ("/") and "/login" itself must never be
// gated, or an anonymous user with one closed session could never get back
// to see, let alone open, their own canvas list.
//
// Named proxy.ts, not middleware.ts — Next 16 renamed the file convention
// (middleware.ts still works but logs a deprecation warning on every build);
// same export shape either way, this is still what CLAUDE.md/the context
// files call "the middleware gate".
export const config = {
  matcher: ["/canvas/:path*"],
}

export default async function proxy(request: NextRequest) {
  const { supabase, getResponse } = createMiddlewareClient(request)

  // getUser() (not getSession()) — it revalidates against Supabase Auth
  // instead of trusting the cookie's decoded claims, which matters here
  // since this decision gates a whole route.
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  // AuthSessionMissingError is the expected shape of "no cookie yet" (every
  // brand-new visitor before use-anonymous-auth's client-side sign-in has
  // run) — not a failure worth logging. Anything else is a real read
  // failure; fail open rather than lock someone out of their own canvas
  // over a transient error.
  if (userError && userError.name !== "AuthSessionMissingError") {
    logger.warn("[proxy] failed to read auth user — allowing through", { error: userError })
    return getResponse()
  }

  // No session at all yet (first-ever visit, before use-anonymous-auth's
  // client-side signInAnonymously has run) — never redirect a brand-new
  // visitor to /login. Let the request through; the canvas surface itself
  // establishes the anonymous session on mount.
  if (!user || !user.is_anonymous) return getResponse()

  // Anonymous user: gate only once they've already closed a session
  // somewhere (any canvas — the gate is per-user, not per-canvas, per
  // SESSION-FLOWS.md: "second canvas/session without an account"). RLS
  // scopes this to the signed-in user's own sessions via canvas ownership,
  // so no explicit user filter is needed.
  const { data: closedSessions, error: sessionsError } = await supabase
    .from("sessions")
    .select("id")
    .neq("status", "active")
    .limit(1)

  if (sessionsError) {
    logger.warn("[proxy] failed to check session history — allowing through", { error: sessionsError })
    return getResponse()
  }

  if (closedSessions && closedSessions.length > 0) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search)
    return NextResponse.redirect(loginUrl)
  }

  return getResponse()
}
