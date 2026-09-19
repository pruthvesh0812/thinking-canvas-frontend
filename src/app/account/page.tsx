"use client"

import { useEffect, useState, type FormEvent } from "react"
import Link from "next/link"
import type { User } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"
import { ensureAnonSession, resendVerification, setPassword, signOut } from "@/lib/auth"
import { logger } from "@/lib/logger"

type LoadState = "loading" | "ready" | "error"

const PROVIDER_LABEL: Record<string, string> = { google: "Google", email: "Email & password" }

// Where the auth story's states become visible (ARCHITECTURE.md — Auth Flow).
// One user, three shapes this page has to tell apart:
//   guest             — anonymous, nothing pending: canvases live only in
//                       this browser; the ask is "save your account".
//   guest, verifying  — anonymous with `new_email` parked: a confirmation
//                       link was sent; until it's clicked the account is NOT
//                       saved (and proxy.ts still treats them as a guest).
//   permanent         — email present; verified once `email_confirmed_at` is
//                       set (Google sets it immediately).
// Sign-out is only offered to a permanent account: signing out a guest
// would orphan their canvases (an anonymous session can't be signed back
// into), which is the opposite of what "log out" should ever cost.
export default function AccountPage() {
  const [state, setState] = useState<LoadState>("loading")
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    let cancelled = false
    // getUser() (not getSession()) — it asks Supabase Auth, so is_anonymous /
    // email_confirmed_at reflect a confirmation link clicked a moment ago
    // rather than the JWT's stale claims.
    function load() {
      // ensureAnonSession first so a first-ever visit (guest session still
      // being created by the root layout) doesn't read "no session" and
      // dead-end in the error state.
      void ensureAnonSession().then(() => supabase.auth.getUser()).then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          // "No session" is a real state here (just signed out, session
          // expired) — /login is where that resolves.
          logger.warn("[account] failed to read current user", { error })
          setState("error")
          return
        }
        setUser(data.user)
        setState("ready")
      })
    }

    load()
    // The confirmation link usually opens in ANOTHER tab of this same
    // browser (cookies are shared, so that tab's callback signs this one
    // in as the now-permanent user) — re-check whenever this tab regains
    // focus so the status flips without a manual reload.
    function onVisible() {
      if (document.visibilityState === "visible") load()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [])

  return (
    <main className="tc-scope min-h-screen" style={{ background: "var(--tc-surface)" }}>
      <div className="mx-auto w-full max-w-[640px] px-6 py-11">
        <div className="mb-10 flex items-center justify-between">
          <Link
            href="/"
            className="text-[13px] hover:underline"
            style={{ color: "var(--tc-chrome-quiet)" }}
          >
            ← All canvases
          </Link>
          <span style={{ fontFamily: "var(--font-tc-hand)", fontSize: 24, color: "var(--tc-chrome-quiet)" }}>
            ThinkingCanvas
          </span>
        </div>

        <h1 className="mb-6 text-[22px] font-semibold" style={{ color: "var(--tc-ink)" }}>
          Account
        </h1>

        {state === "loading" && (
          <p className="text-[13px]" style={{ color: "var(--tc-chrome-quiet)" }}>
            Loading…
          </p>
        )}

        {state === "error" && (
          <p className="text-[13px]" style={{ color: "#B4472E" }}>
            Couldn&rsquo;t load your account.{" "}
            <Link href="/login" className="underline">
              Sign in
            </Link>{" "}
            or refresh to try again.
          </p>
        )}

        {state === "ready" && user && (
          <div className="flex flex-col gap-4">
            <IdentityCard user={user} />
            {!user.is_anonymous && user.identities?.some((i) => i.provider === "email") && <PasswordCard />}
            {!user.is_anonymous && <SessionCard />}
          </div>
        )}
      </div>
    </main>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="flex flex-col gap-3 rounded-xl p-5"
      style={{ background: "var(--tc-panel)", border: "1px solid var(--tc-panel-border)" }}
    >
      <h2 className="text-[13px] font-semibold uppercase tracking-wide" style={{ color: "var(--tc-chrome-quiet)" }}>
        {title}
      </h2>
      {children}
    </section>
  )
}

function Pill({ tone, children }: { tone: "ok" | "warn" | "quiet"; children: React.ReactNode }) {
  const palette = {
    ok: { bg: "#E3EEDD", fg: "#3C6B2E" },
    warn: { bg: "#F4E7CB", fg: "var(--tc-amber-ink-strong)" },
    quiet: { bg: "rgba(43,38,34,.07)", fg: "var(--tc-chrome)" },
  }[tone]
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold"
      style={{ background: palette.bg, color: palette.fg }}
    >
      {children}
    </span>
  )
}

function ghostButtonStyle(disabled: boolean) {
  return {
    border: "1px solid var(--tc-hairline-strong)",
    background: "none",
    color: "var(--tc-ink)",
    opacity: disabled ? 0.6 : 1,
  }
}

function IdentityCard({ user }: { user: User }) {
  const [resending, setResending] = useState(false)
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null)

  const providers = (user.identities ?? []).map((i) => PROVIDER_LABEL[i.provider] ?? i.provider)
  const pendingEmail = user.new_email ?? null
  const verified = Boolean(user.email_confirmed_at)

  // Which resend applies: a guest's parked new_email is an email_change; a
  // permanent account that never confirmed its signup address (prod, once
  // email confirmations are on) is a signup.
  async function handleResend(email: string, type: "email_change" | "signup") {
    setResending(true)
    setMessage(null)
    const result = await resendVerification(email, type)
    setResending(false)
    setMessage(
      result.ok
        ? { tone: "ok", text: `Sent a new confirmation link to ${email}.` }
        : { tone: "error", text: result.error },
    )
  }

  return (
    <Card title="Your account">
      {user.is_anonymous ? (
        pendingEmail ? (
          <>
            <div className="flex items-center gap-2.5">
              <Pill tone="warn">Verification pending</Pill>
              <span className="text-[14px]" style={{ color: "var(--tc-ink)" }}>
                {pendingEmail}
              </span>
            </div>
            <p className="text-[13px] leading-[1.55]" style={{ color: "var(--tc-chrome)" }}>
              We sent a confirmation link to that address. Open it to finish saving your account — until then,
              your canvases live only in this browser. This page updates on its own once you&rsquo;ve confirmed.
            </p>
            <button
              type="button"
              disabled={resending}
              onClick={() => void handleResend(pendingEmail, "email_change")}
              className="self-start rounded-full px-4 py-1.5 text-[12.5px] font-semibold"
              style={ghostButtonStyle(resending)}
            >
              {resending ? "Sending…" : "Resend link"}
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2.5">
              <Pill tone="quiet">Guest</Pill>
              <span className="text-[14px]" style={{ color: "var(--tc-chrome)" }}>
                Not saved yet
              </span>
            </div>
            <p className="text-[13px] leading-[1.55]" style={{ color: "var(--tc-chrome)" }}>
              Your thinking so far only lives in this browser — clearing site data would lose it. Create an
              account to keep every canvas and pick up anywhere.
            </p>
            <Link
              href="/login"
              className="self-start rounded-full px-4 py-1.5 text-[12.5px] font-semibold"
              style={{ background: "var(--tc-ink)", color: "#F5F1E8" }}
            >
              Save your account
            </Link>
          </>
        )
      ) : (
        <>
          <div className="flex items-center gap-2.5">
            <span className="text-[15px] font-semibold" style={{ color: "var(--tc-ink)" }}>
              {user.email}
            </span>
            {verified ? <Pill tone="ok">Verified</Pill> : <Pill tone="warn">Not verified</Pill>}
          </div>
          {!verified && user.email && (
            <>
              <p className="text-[13px] leading-[1.55]" style={{ color: "var(--tc-chrome)" }}>
                Confirm this address from the link we emailed you.
              </p>
              <button
                type="button"
                disabled={resending}
                onClick={() => void handleResend(user.email!, "signup")}
                className="self-start rounded-full px-4 py-1.5 text-[12.5px] font-semibold"
                style={ghostButtonStyle(resending)}
              >
                {resending ? "Sending…" : "Resend link"}
              </button>
            </>
          )}
          {providers.length > 0 && (
            <p className="text-[12.5px]" style={{ color: "var(--tc-chrome-quiet)" }}>
              Signs in with {providers.join(" · ")}
            </p>
          )}
        </>
      )}
      {message && (
        <p className="text-[12.5px]" style={{ color: message.tone === "ok" ? "#3C6B2E" : "#B4472E" }}>
          {message.text}
        </p>
      )}
    </Card>
  )
}

// Step 2 of email conversion (lib/auth.ts's signUpWithEmail) and the ordinary
// change-password form — one call, `updateUser({ password })`, either way.
// Only rendered for a permanent account with an email identity: a
// Google-only account has no password to set, and a guest can't yet
// (Supabase requires the email verified first).
function PasswordCard() {
  const [password, setPasswordValue] = useState("")
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    const result = await setPassword(password)
    setSaving(false)
    if (!result.ok) {
      setMessage({ tone: "error", text: result.error })
      return
    }
    setPasswordValue("")
    setMessage({ tone: "ok", text: "Password saved." })
  }

  return (
    <Card title="Password">
      <p className="text-[13px] leading-[1.55]" style={{ color: "var(--tc-chrome)" }}>
        Set a password to sign in with your email later — or change the one you have.
      </p>
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-2.5">
        <input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="New password (8+ characters)"
          value={password}
          onChange={(e) => setPasswordValue(e.target.value)}
          className="rounded-lg px-3.5 py-2.5 text-[13.5px] outline-none"
          style={{ background: "var(--tc-node)", border: "1px solid var(--tc-hairline-strong)", color: "var(--tc-ink)" }}
        />
        <button
          type="submit"
          disabled={saving}
          className="self-start rounded-full px-4 py-1.5 text-[12.5px] font-semibold"
          style={{ border: "none", background: "var(--tc-ink)", color: "#F5F1E8", opacity: saving ? 0.6 : 1 }}
        >
          {saving ? "Saving…" : "Save password"}
        </button>
      </form>
      {message && (
        <p className="text-[12.5px]" style={{ color: message.tone === "ok" ? "#3C6B2E" : "#B4472E" }}>
          {message.text}
        </p>
      )}
    </Card>
  )
}

function SessionCard() {
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSignOut() {
    setSigningOut(true)
    setError(null)
    const result = await signOut()
    if (!result.ok) {
      setError(result.error)
      setSigningOut(false)
      return
    }
    // Hard navigation, not router.push: discards every in-memory store so
    // the next person to sign in on this tab never sees this user's canvas.
    window.location.assign("/login?signedOut=1")
  }

  return (
    <Card title="Session">
      <p className="text-[13px] leading-[1.55]" style={{ color: "var(--tc-chrome)" }}>
        Signing out ends this browser&rsquo;s session only. Your canvases stay safe in your account.
      </p>
      <button
        type="button"
        disabled={signingOut}
        onClick={() => void handleSignOut()}
        className="self-start rounded-full px-4 py-1.5 text-[12.5px] font-semibold"
        style={ghostButtonStyle(signingOut)}
      >
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
      {error && (
        <p className="text-[12.5px]" style={{ color: "#B4472E" }}>
          {error}
        </p>
      )}
    </Card>
  )
}
