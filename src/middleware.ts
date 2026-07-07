import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Session-2+ gate: /canvas/* is protected once a user has closed a session,
// unless they still have an anonymous session cookie (first-visit path).
// / and /login are always accessible.
export async function middleware(request: NextRequest) {
  const res = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return res

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(items) {
        items.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const login = request.nextUrl.clone()
    login.pathname = '/login'
    login.searchParams.set('next', request.nextUrl.pathname)
    return NextResponse.redirect(login)
  }

  // Anonymous users pass — first-session-value comes first (SESSION-FLOWS.md).
  return res
}

export const config = {
  matcher: ['/canvas/:path*'],
}
