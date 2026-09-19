import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse, type NextRequest } from "next/server"
import { logger } from "@/lib/logger"
import type { Database } from "@/types/database.types"

// Lands every Google OAuth round trip — both a fresh sign-in
// (signInWithOAuth) and an anonymous→permanent conversion (linkIdentity)
// redirect here the same way, since both are PKCE code exchanges. Whichever
// one it was, exchanging the code sets the real session cookie; a
// linkIdentity exchange keeps the SAME auth.uid() the anonymous session had,
// which is what carries every existing canvas over with no migration
// (ARCHITECTURE.md — Auth Flow).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  // Always "/" — this URL must match thinking-canvas-be's supabase/config.toml
  // `additional_redirect_urls` EXACTLY (no query string), or Supabase's local
  // GoTrue rejects it and silently falls back to `site_url` instead, bouncing
  // the whole flow to whatever else is running on that port. `next` travels
  // via sessionStorage instead (lib/auth.ts's continueWithGoogle) — read back
  // by PostAuthRedirect.tsx once this lands the user on "/".
  const next = "/"

  if (!code) {
    // Supabase reports a failed OAuth round trip by redirecting here with
    // ?error=…&error_code=… instead of a code. The one worth telling the user
    // about specifically: `identity_already_exists` — they asked to LINK a
    // Google account that already belongs to a real account (a returning user
    // who arrived as a fresh guest). "Try again" would fail identically; the
    // login page explains and switches to sign-in instead.
    const errorCode = searchParams.get("error_code")
    logger.warn("[auth-callback] no code on callback request", { errorCode })
    const reason = errorCode === "identity_already_exists" ? "identity_exists" : "missing_code"
    return NextResponse.redirect(`${origin}/login?error=${reason}`)
  }

  const cookieStore = await cookies()
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options)
        },
      },
    },
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    logger.error("[auth-callback] code exchange failed", { error })
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`)
  }

  logger.info("[auth-callback] session established, redirecting", { next })
  return NextResponse.redirect(`${origin}${next}`)
}
