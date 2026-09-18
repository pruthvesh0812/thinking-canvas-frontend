import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import type { Database } from "@/types/database.types"

// Middleware-scoped Supabase client — separate from lib/supabase.ts's
// browser client (that one is a lazily-constructed Proxy so importing it
// never throws at build time; middleware runs per-request at the edge, so
// there's no equivalent prerender hazard to defer around here).
//
// Reads/writes the session cookie straight off the NextRequest/NextResponse
// pair per @supabase/ssr's documented middleware recipe: cookies read from
// `request`, refreshed cookies written to both `request` (so this same
// request sees the refresh) and the `response` that's actually returned.
export function createMiddlewareClient(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options)
        },
      },
    },
  )

  return { supabase, getResponse: () => response }
}
