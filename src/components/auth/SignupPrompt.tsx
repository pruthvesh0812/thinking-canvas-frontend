"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { logger } from "@/lib/logger"

// Shown inside Session Complete's screen 3 (SessionCompleteModal.tsx), and
// only there — this is the one deliberate moment ARCHITECTURE.md's Auth Flow
// names for the ask: "after the first Session Complete". The caller decides
// WHETHER this was the first one (session-store.pastSessions.length === 0
// at the moment the modal opened); this component only renders the CTA and
// checks that there's actually still an anonymous session worth saving —
// e.g. a user who already converted earlier in this same tab shouldn't see
// it again.
export function SignupPrompt() {
  const router = useRouter()
  const [isAnonymous, setIsAnonymous] = useState(false)

  useEffect(() => {
    let cancelled = false
    void supabase.auth.getUser().then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        logger.warn("[signup-prompt] failed to read current user", { error })
        return
      }
      setIsAnonymous(data.user?.is_anonymous ?? false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!isAnonymous) return null

  return (
    <div
      className="flex flex-col gap-2 rounded-xl px-4 py-3.5 text-left"
      style={{ background: "var(--tc-panel-alt, rgba(43,38,34,.04))", border: "1px solid var(--tc-hairline)" }}
    >
      <p className="text-[13px] font-semibold" style={{ color: "var(--tc-ink)" }}>
        Create an account to save this
      </p>
      <p className="text-[12.5px] leading-[1.5]" style={{ color: "var(--tc-chrome)" }}>
        Your thinking so far only lives in this browser. An account keeps every canvas and lets you pick up
        anywhere.
      </p>
      <button
        type="button"
        onClick={() => router.push("/login")}
        className="mt-1 self-start rounded-full px-4 py-1.5 text-[12.5px] font-semibold"
        style={{ border: "none", background: "var(--tc-ink)", color: "#F5F1E8" }}
      >
        Create account
      </button>
    </div>
  )
}
