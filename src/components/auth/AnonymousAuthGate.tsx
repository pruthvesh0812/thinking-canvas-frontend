"use client"

import { useAnonymousAuth } from "@/hooks/use-anonymous-auth"

// Mounted once in the root layout so every route establishes an anonymous
// Supabase session as early as possible (ARCHITECTURE.md — Auth Flow,
// Session 1) — not just the canvas surface, which used to be the only
// place ensureAnonSession ran (canvas hydration and the dashboard each call
// it again inline before their own reads/writes; this is the app-wide net,
// not a replacement for those). Renders nothing.
export function AnonymousAuthGate() {
  useAnonymousAuth()
  return null
}
