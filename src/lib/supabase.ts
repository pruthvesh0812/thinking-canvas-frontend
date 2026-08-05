import { createBrowserClient } from "@supabase/ssr"
import type { Database } from "@/types/database.types"

// The browser client — anon key only (never the service role key), RLS is the
// security boundary (CODING-STANDARDS.md non-negotiable #8). Realtime is
// disabled product-wide: never call `supabase.channel()` anywhere in this
// codebase (non-negotiable #2) — the SSE stream in use-ghost-stream.ts is the
// only server push.
//
// Typed against the mirrored Database schema so every `.from(table)` call is
// checked against real columns at compile time.
export const supabase = createBrowserClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)
