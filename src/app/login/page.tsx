"use client"

import { Suspense, useEffect, useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { continueWithGoogle, ensureAnonSession, resendVerification, signInWithEmail, signUpWithEmail } from "@/lib/auth"
import { logger } from "@/lib/logger"

type Mode = "create" | "signin"

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
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-8 py-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
        <p className="text-zinc-600 dark:text-zinc-400">{subhead}</p>
      </div>

      {mode === "signin" && isAnonymous && (
        <p className="text-sm text-zinc-500">
          Signing in switches you to your account. Anything you started as a guest on this device stays behind — it
          isn&rsquo;t merged in.
        </p>
      )}

      {pendingEmail && (
        <p className="rounded-lg bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          A confirmation link is waiting at {pendingEmail}.{" "}
          <Link href="/account" className="underline underline-offset-2">
            Check its status
          </Link>
        </p>
      )}

      <button
        type="button"
        onClick={() => void handleGoogle()}
        disabled={submitting}
        className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium disabled:opacity-60 dark:border-zinc-700"
      >
        Continue with Google
      </button>

      <div className="flex items-center gap-3 text-xs text-zinc-500">
        <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        or
        <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-3">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700"
        />
        {mode === "signin" && (
          <input
            type="password"
            required
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700"
          />
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {unconfirmedEmail && (
          <button
            type="button"
            onClick={() => void handleResend()}
            disabled={submitting}
            className="self-start text-sm text-zinc-600 underline underline-offset-2 disabled:opacity-60 dark:text-zinc-400"
          >
            Resend confirmation email
          </button>
        )}
        {notice && <p className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
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
        className="text-sm text-zinc-600 underline underline-offset-2 dark:text-zinc-400"
      >
        {mode === "create" ? "Already have an account? Sign in" : "New here? Create an account"}
      </button>
    </main>
  )
}
