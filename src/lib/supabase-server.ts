import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

// Server-side Supabase client — used by middleware and (future) server
// components/route handlers. Reads/writes auth cookies via next/headers.
// Anon key only; RLS is the security boundary.
export async function getServerSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(items) {
          try {
            items.forEach(({ name, value, options }: { name: string; value: string; options?: CookieOptions }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // Called from a Server Component — setAll no-ops in that context.
          }
        },
      },
    },
  )
}
