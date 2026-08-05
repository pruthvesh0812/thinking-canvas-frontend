'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSessionStore } from '@/stores/session-store'

// North star capture — a single full-screen prompt before any canvas exists.
// Whatever is typed here becomes `original_intent`, which is write-once and
// visible forever afterwards (SESSION-FLOWS.md). Changing your mind means a new
// canvas, so there is no draft, no edit, no second chance affordance.
export default function NewCanvasPage() {
  const router = useRouter()
  const createCanvas = useSessionStore((s) => s.createCanvas)
  const error = useSessionStore((s) => s.error)
  const [intent, setIntent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!intent.trim() || submitting) return

    setSubmitting(true)
    const canvasId = await createCanvas(intent)
    if (!canvasId) {
      setSubmitting(false)
      return
    }
    router.push(`/canvas/${canvasId}`)
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-8 py-16">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          What are you trying to figure out?
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          This becomes your north star for this canvas. It can&apos;t be changed later.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <textarea
          autoFocus
          rows={4}
          value={intent}
          onChange={(event) => setIntent(event.target.value)}
          placeholder="The question you're actually chasing…"
          className="w-full resize-none rounded-lg border border-zinc-300 bg-transparent p-4 text-base outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100"
        />

        {error && <p className="text-sm text-amber-600">{error}</p>}

        <button
          type="submit"
          disabled={!intent.trim() || submitting}
          className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
        >
          {submitting ? 'Creating…' : 'Start thinking'}
        </button>
      </form>
    </main>
  )
}
