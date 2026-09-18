"use client"

import { Suspense, useEffect, useState, type FormEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { continueWithGoogle, signInWithEmail, signUpWithEmail } from "@/lib/auth"
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

  const [mode, setMode] = useState<Mode>("create")
  const [isAnonymous, setIsAnonymous] = useState<boolean | null>(null)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  // Derived straight from the query string at first render, not an effect —
  // there's nothing asynchronous to synchronize, just a redirect param to
  // read once. mode/email/etc. below can still overwrite it afterward.
  const [error, setError] = useState<string | null>(
    redirectError ? "That didn't go through — try again." : null,
  )
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void supabase.auth.getUser().then(({ data, error: getUserError }) => {
      if (cancelled) return
      if (getUserError) {
        logger.warn("[login] failed to read current user", { error: getUserError })
        return
      }
      setIsAnonymous(data.user?.is_anonymous ?? false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleGoogle() {
    setSubmitting(true)
    setError(null)
    const result = await continueWithGoogle(next)
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

    const result =
      mode === "create" ? await signUpWithEmail(email, password) : await signInWithEmail(email, password)

    setSubmitting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    if (result.needsEmailConfirmation) {
      setNotice("Check your email to confirm the address, then come back and sign in.")
      return
    }
    router.push(next)
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
        <input
          type="password"
          required
          minLength={8}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {notice && <p className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {submitting ? "…" : mode === "create" ? "Create account" : "Sign in"}
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
