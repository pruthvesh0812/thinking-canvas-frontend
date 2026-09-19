"use client"

import { Suspense, useEffect, useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { continueWithGoogle, ensureAnonSession, resendVerification, signInWithEmail, signUpWithEmail } from "@/lib/auth"
import { logger } from "@/lib/logger"

type Mode = "create" | "signin"

// The same underline-only field the north-star page uses (canvas/new) — no
// box, just a hairline that darkens to ink on focus, and an italic quiet
// placeholder.
const INPUT_CLASS =
  "w-full border-0 border-b border-b-[#D8CFBE] bg-transparent py-2 text-[16px] outline-none transition-colors " +
  "placeholder:italic placeholder:text-[var(--tc-chrome-faint)] focus:border-b-[var(--tc-ink)]"

// useSearchParams needs a Suspense boundary above it in the App Router or
// `next build` fails prerendering this route — the form is the only part
// that reads the query string, so it's the only part inside the boundary.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}

// Reached two ways (ARCHITECTURE.md — Auth Flow): a deliberate click on the
// post-Session-Complete signup prompt, or middleware.ts's session-2+
// redirect. Both land here with the anonymous session (if any) still
// active, so "Create account" converts it in place — copy adapts once we
// know whether there's data on the line to keep.
function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get("next") || "/"
  const redirectError = searchParams.get("error")
  // Set by the account page's sign-out (hard navigation) — someone who just
  // signed out is here to sign back in, not to "save" a session they no
  // longer have, so open on the sign-in form with a confirmation line.
  const signedOut = searchParams.get("signedOut") === "1"

  // A returning user whose Google account already exists lands here from the
  // callback with error=identity_exists — sign-in is the only thing that will
  // work for them, so open on it.
  const identityExists = redirectError === "identity_exists"
  const [mode, setMode] = useState<Mode>(signedOut || identityExists ? "signin" : "create")
  const [isAnonymous, setIsAnonymous] = useState<boolean | null>(null)
  // An anonymous user who already asked for a confirmation link and hasn't
  // clicked it yet — Supabase parks the address in `new_email`. Shown as a
  // pointer to /account rather than letting them think the form is fresh.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  // Set when a sign-in fails because the address was never confirmed (only
  // possible once the project has email confirmations enabled) — offers a
  // resend instead of a dead-end error.
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  // Derived straight from the query string at first render, not an effect —
  // there's nothing asynchronous to synchronize, just a redirect param to
  // read once. mode/email/etc. below can still overwrite it afterward.
  const [error, setError] = useState<string | null>(
    identityExists
      ? "That Google account already has a ThinkingCanvas account. Use Continue with Google to sign in to it."
      : redirectError
        ? "That didn't go through — try again."
        : null,
  )
  const [notice, setNotice] = useState<string | null>(signedOut ? "You've been signed out." : null)

  useEffect(() => {
    let cancelled = false
    // ensureAnonSession first: on a fresh load (or right after sign-out) the
    // root layout's AnonymousAuthGate is still creating the guest session
    // concurrently, and a bare getUser() here can win that race, see no user,
    // and leave this page believing "not a guest" for good.
    void ensureAnonSession().then(() => supabase.auth.getUser()).then(({ data, error: getUserError }) => {
      if (cancelled) return
      if (getUserError) {
        logger.warn("[login] failed to read current user", { error: getUserError })
        return
      }
      setIsAnonymous(data.user?.is_anonymous ?? false)
      setPendingEmail(data.user?.new_email ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleGoogle() {
    setSubmitting(true)
    setError(null)
    const result = await continueWithGoogle(next, mode)
    if (!result.ok) {
      setError(result.error)
      setSubmitting(false)
    }
    // On success the browser is already navigating to Google — nothing
    // else to do locally.
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setNotice(null)
    setUnconfirmedEmail(null)

    const result = mode === "create" ? await signUpWithEmail(email) : await signInWithEmail(email, password)

    setSubmitting(false)
    if (!result.ok) {
      if (result.code === "email_exists") {
        // Create mode hit an address that already has an account — the fix is
        // to sign in, not to retry.
        setMode("signin")
        setError("That email already has an account — sign in with your password instead.")
        return
      }
      setError(result.error)
      if (result.code === "email_not_confirmed") setUnconfirmedEmail(email)
      return
    }
    if (result.needsEmailConfirmation) {
      setNotice(
        `We sent a confirmation link to ${email}. Open it to finish saving your account — you can set a password afterward.`,
      )
      return
    }
    // Create mode reaching here means the email was applied immediately
    // (auto-confirm) — the account is saved but has no password yet, and
    // /account is where that step lives. Sign-in goes wherever it was headed.
    router.push(mode === "create" ? "/account" : next)
  }

  async function handleResend() {
    if (!unconfirmedEmail) return
    setSubmitting(true)
    setError(null)
    const result = await resendVerification(unconfirmedEmail, "signup")
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setUnconfirmedEmail(null)
    setNotice(`Sent a new confirmation link to ${unconfirmedEmail}.`)
  }

  const heading =
    mode === "create" ? (isAnonymous ? "Save your thinking" : "Create your account") : "Welcome back"
  const subhead =
    mode === "create"
      ? isAnonymous
        ? "Create an account to keep every canvas you've started — nothing is lost."
        : "Start thinking with ThinkingCanvas."
      : "Sign in to continue."

  return (
    <main className="tc-scope flex min-h-screen flex-col" style={{ background: "var(--tc-surface)" }}>
      <div className="px-10 py-7">
        <Link href="/" className="text-[12.5px] hover:underline" style={{ color: "var(--tc-chrome-quiet)" }}>
          ← canvases
        </Link>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-20">
        <div
          className="flex w-full max-w-[400px] flex-col gap-[22px]"
          style={{ animation: "tc-fadeup .25s ease-out both" }}
        >
          <div className="flex flex-col gap-2.5">
            <span style={{ fontFamily: "var(--font-tc-hand)", fontSize: 19, color: "var(--tc-chrome-faint)" }}>
              ThinkingCanvas
            </span>
            <h1 className="text-[32px] font-semibold leading-[1.25]" style={{ color: "var(--tc-ink)" }}>
              {heading}
            </h1>
            <p className="text-[13.5px] leading-[1.6]" style={{ color: "var(--tc-chrome)" }}>
              {subhead}
            </p>
          </div>

          {mode === "signin" && isAnonymous && (
            <p className="text-[12.5px] leading-[1.6]" style={{ color: "var(--tc-chrome-quiet)" }}>
              Signing in switches you to your account. Anything you started as a guest on this device stays behind
              — it isn&rsquo;t merged in.
            </p>
          )}

          {pendingEmail && (
            <p
              className="rounded-xl px-4 py-3 text-[12.5px] leading-[1.6]"
              style={{
                background: "var(--tc-panel)",
                border: "1px solid var(--tc-panel-border)",
                color: "var(--tc-chrome)",
              }}
            >
              A confirmation link is waiting at {pendingEmail}.{" "}
              <Link href="/account" className="underline underline-offset-2" style={{ color: "var(--tc-ink)" }}>
                Check its status
              </Link>
            </p>
          )}

          <button
            type="button"
            onClick={() => void handleGoogle()}
            disabled={submitting}
            className="rounded-full px-5 py-[11px] text-[14.5px] font-semibold transition-colors hover:bg-[#F5F0E4] disabled:opacity-60"
            style={{
              border: "1px solid var(--tc-hairline-strong)",
              background: "var(--tc-panel)",
              color: "var(--tc-ink)",
            }}
          >
            Continue with Google
          </button>

          <div className="flex items-center gap-3 text-[12px]" style={{ color: "var(--tc-chrome-faint)" }}>
            <div className="h-px flex-1" style={{ background: "var(--tc-hairline)" }} />
            or
            <div className="h-px flex-1" style={{ background: "var(--tc-hairline)" }} />
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-[18px]">
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={INPUT_CLASS}
              style={{ color: "var(--tc-ink)" }}
            />
            {mode === "signin" && (
              <input
                type="password"
                required
                autoComplete="current-password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={INPUT_CLASS}
                style={{ color: "var(--tc-ink)" }}
              />
            )}

            {error && (
              <p className="text-[12.5px] leading-[1.6]" style={{ color: "#B4472E" }}>
                {error}
              </p>
            )}
            {unconfirmedEmail && (
              <button
                type="button"
                onClick={() => void handleResend()}
                disabled={submitting}
                className="self-start text-[12.5px] underline underline-offset-2 disabled:opacity-60"
                style={{ border: "none", background: "none", padding: 0, color: "var(--tc-chrome)" }}
              >
                Resend confirmation email
              </button>
            )}
            {notice && (
              <p className="text-[13px] leading-[1.6]" style={{ color: "var(--tc-ink)" }}>
                {notice}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-1 self-start rounded-full px-[26px] py-[11px] text-[14.5px] font-semibold transition-opacity disabled:opacity-60"
              style={{ border: "none", background: "var(--tc-ink)", color: "#F5F1E8" }}
            >
              {submitting ? "…" : mode === "create" ? "Email me a confirmation link" : "Sign in"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              setMode((m) => (m === "create" ? "signin" : "create"))
              setError(null)
              setNotice(null)
            }}
            className="self-start text-[12.5px] underline underline-offset-2"
            style={{ border: "none", background: "none", padding: 0, color: "var(--tc-chrome-quiet)" }}
          >
            {mode === "create" ? "Already have an account? Sign in" : "New here? Create an account"}
          </button>
        </div>
      </div>
    </main>
  )
}
