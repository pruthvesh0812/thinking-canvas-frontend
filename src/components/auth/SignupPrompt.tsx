'use client'

import { useState } from 'react'
import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'

// Shown after screen 3 of the first Session Complete. Converts the anonymous
// user to a permanent one — same uid, so all RLS rows carry over
// (ARCHITECTURE.md → Auth Flow).
type Props = { onDismiss(): void }

export function SignupPrompt({ onDismiss }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function convertWithEmail() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ email, password })
    setBusy(false)
    if (error) {
      logger.warn('[auth] email conversion failed', { error })
      setError(error.message)
      return
    }
    onDismiss()
  }

  async function convertWithGoogle() {
    setBusy(true)
    const { error } = await supabase.auth.linkIdentity({ provider: 'google' })
    setBusy(false)
    if (error) {
      logger.warn('[auth] google conversion failed', { error })
      setError(error.message)
    }
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Create an account to keep this</h2>
      <p className="text-sm text-zinc-500">
        Your canvas stays yours — same session, no data migration.
      </p>
      <button
        onClick={convertWithGoogle}
        disabled={busy}
        className="w-full rounded border border-zinc-300 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        Continue with Google
      </button>
      <div className="space-y-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <button
          onClick={convertWithEmail}
          disabled={busy || !email || !password}
          className="w-full rounded bg-black py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          Create account
        </button>
      </div>
      {error && <div className="text-xs text-red-500">{error}</div>}
      <button
        onClick={onDismiss}
        className="w-full text-center text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
      >
        Maybe later
      </button>
    </div>
  )
}
