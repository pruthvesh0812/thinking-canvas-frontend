'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import * as api from '@/lib/api'
import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'

// North star capture — write-once at canvas creation (CORE-CONCEPTS.md #5).
// original_intent is INSERT-only per RLS; there is no edit UI, ever.
export default function NewCanvasPage() {
  const router = useRouter()
  const [intent, setIntent] = useState('')
  const [busy, setBusy] = useState(false)

  async function create() {
    const original_intent = intent.trim()
    if (!original_intent || busy) return
    setBusy(true)
    const canvas_id = crypto.randomUUID()
    const { data: userRes } = await supabase.auth.getUser()
    const user_id = userRes?.user?.id
    const { error } = await supabase.from('canvases').insert({
      id: canvas_id,
      user_id,
      title: original_intent.slice(0, 60),
      original_intent,
    })
    if (error) {
      logger.error('[canvas-new] insert failed', { error })
      setBusy(false)
      return
    }
    try {
      await api.sessionStart({ canvas_id })
    } catch (err) {
      logger.warn('[canvas-new] session start failed (canvas will hydrate its own on open)', { err })
    }
    router.push(`/canvas/${canvas_id}`)
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-8 py-16">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          What are you trying to figure out?
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          This becomes your north star for this canvas. You can&apos;t change it later.
        </p>
      </div>
      <textarea
        value={intent}
        onChange={(e) => setIntent(e.target.value)}
        rows={4}
        placeholder="Type your intent…"
        className="w-full resize-none rounded-md border border-zinc-300 bg-white p-3 text-base outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-white"
      />
      <button
        onClick={create}
        disabled={busy || !intent.trim()}
        className="inline-flex h-11 items-center justify-center rounded-md bg-black px-4 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {busy ? 'Creating…' : 'Start canvas'}
      </button>
    </main>
  )
}
