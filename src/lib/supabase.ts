import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"

// The browser client — anon key only (never the service role key), RLS is the
// security boundary (CODING-STANDARDS.md non-negotiable #8). Realtime is
// disabled product-wide: never call `supabase.channel()` anywhere in this
// codebase (non-negotiable #2) — the SSE stream in use-ghost-stream.ts is the
// only server push.
//
// Typed against the mirrored Database schema so every `.from(table)` call is
// checked against real columns at compile time.
//
// Created lazily behind a Proxy: `createBrowserClient` throws when the
// NEXT_PUBLIC_ env vars are absent, and eagerly constructing it at module load
// broke `next build` for any statically-prerendered route that imported this
// file (the module graph is evaluated during prerender, where the vars aren't
// present). Deferring construction to first property access means importing
// this module never throws — only actually using the client at runtime (in the
// browser, where the vars are inlined) does.
let client: SupabaseClient<Database> | null = null

function getClient(): SupabaseClient<Database> {
  if (!client) {
    client = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
  }
  return client
}

export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop, receiver) {
    const value = Reflect.get(getClient(), prop, receiver)
    return typeof value === "function" ? value.bind(getClient()) : value
  },
})
