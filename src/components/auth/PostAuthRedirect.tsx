"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { POST_AUTH_REDIRECT_KEY } from "@/lib/auth"

// The other half of lib/auth.ts's continueWithGoogle: /auth/callback always
// lands on "/" (its redirectTo can't carry a query string — see that file's
// comment), so whatever page the user was actually trying to reach before
// clicking "Continue with Google" has to finish the trip client-side.
// Mounted once in the root layout; only fires when there's actually a
// stashed redirect AND we just landed on "/" (a plain visit to the
// dashboard has nothing to pick up, so this is a no-op almost always).
export function PostAuthRedirect() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (pathname !== "/") return
    let next: string | null = null
    try {
      next = sessionStorage.getItem(POST_AUTH_REDIRECT_KEY)
      if (next) sessionStorage.removeItem(POST_AUTH_REDIRECT_KEY)
    } catch {
      // Private-window/blocked storage — nothing to recover, stay on "/".
      return
    }
    if (next && next !== "/") router.replace(next)
  }, [pathname, router])

  return null
}
