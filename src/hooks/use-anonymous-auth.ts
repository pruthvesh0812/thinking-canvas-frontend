"use client"

import { useEffect } from "react"
import { ensureAnonSession } from "@/lib/auth"

// Silent anonymous sign-in on first visit — the slice of the `auth` story
// (IMPLEMENTATION-ORDER.md #9) that stands on its own. See ensureAnonSession
// for what it does; the session-2+ middleware gate and the post-Session-
// Complete signup prompt are the rest of that story, still held back on
// canvas-dashboard/session-lifecycle (see .ai/features/auth/story.md).
export function useAnonymousAuth() {
  useEffect(() => {
    void ensureAnonSession()
  }, [])
}
