import { createBrowserClient } from '@supabase/ssr'

// Browser Supabase client — anon key only. RLS is the security boundary.
// Supabase Realtime is prohibited product-wide (see CODING-STANDARDS.md
// prohibited patterns). Server pushes come from the SSE stream in
// use-ghost-stream.ts.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)
