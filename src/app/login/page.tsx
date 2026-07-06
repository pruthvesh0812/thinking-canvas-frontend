'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'

function LoginForm() {
  const router = useRouter()
  const search = useSearchParams()
  const next = search.get('next') ?? '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signInEmail() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) {
      logger.warn('[auth] signin failed', { error })
      setError(error.message)
      return
    }
    router.push(next)
  }

  async function signInGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${next}` },
    })
    if (error) setError(error.message)
  }

  return (
    <div className="space-y-3">
      <button
        onClick={signInGoogle}
        className="w-full rounded border border-zinc-300 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        Continue with Google
      </button>
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
        onClick={signInEmail}
        disabled={busy || !email || !password}
        className="w-full rounded bg-black py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        Sign in
      </button>
      {error && <div className="text-xs text-red-500">{error}</div>}
    </div>
  )
}

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-8 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  )
}
