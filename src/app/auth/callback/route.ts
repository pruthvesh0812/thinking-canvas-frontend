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
  const next = searchParams.get("next") ?? "/"

  if (!code) {
    logger.warn("[auth-callback] no code param on callback request")
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
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
