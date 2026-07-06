import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

// Browser Supabase client — anon key only. RLS is the security boundary.
// Supabase Realtime is prohibited product-wide (see CODING-STANDARDS.md
// prohibited patterns). Server pushes come from the SSE stream in
// use-ghost-stream.ts.

// Lazy singleton — the client is constructed on first use, not at module
// evaluation. Prevents dev-time crashes when NEXT_PUBLIC_SUPABASE_* aren't
// set yet; production still fails loudly on the first query.
let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (client) return client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error(
      '[supabase] NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required',
    )
  }
  client = createBrowserClient(url, key)
  return client
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    const c = getSupabase()
    return c[prop as keyof SupabaseClient]
  },
})
