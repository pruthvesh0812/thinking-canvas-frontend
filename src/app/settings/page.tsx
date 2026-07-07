'use client'

import { useEffect, useState } from 'react'
import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'
import type { Tier } from '@/stores/session-store'

// Settings — account status + Stripe checkout (Payment Link, Known Gap #4)
// + Customer Portal link. Tier is read from the subscriptions row the backend
// keeps synced via Stripe webhooks.
export default function SettingsPage() {
  const [tier, setTier] = useState<Tier>('free')
  const [email, setEmail] = useState<string | null>(null)
  const paymentUrl = process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK
  const portalUrl = process.env.NEXT_PUBLIC_STRIPE_PORTAL_LINK

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: userData } = await supabase.auth.getUser()
      if (cancelled) return
      setEmail(userData?.user?.email ?? null)
      const { data, error } = await supabase
        .from('subscriptions')
        .select('tier, status')
        .maybeSingle<{ tier: Tier; status: string }>()
      if (error) logger.warn('[settings] subscription load failed', { error })
      if (cancelled || !data) return
      setTier(data.tier)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-8 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
        <div className="text-xs uppercase tracking-wide text-zinc-500">account</div>
        <div className="mt-1 text-sm">{email ?? 'Anonymous session'}</div>
      </section>

      <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
        <div className="text-xs uppercase tracking-wide text-zinc-500">plan</div>
        <div className="mt-1 text-lg font-medium capitalize">{tier}</div>
        <p className="mt-2 text-sm text-zinc-500">
          {tier === 'free'
            ? 'Free: Expander + Articulator. Upgrade unlocks Stress-Tester, Observer, and Outer Subconscious.'
            : 'All Attunement Layer agents active.'}
        </p>
        <div className="mt-3 flex gap-2">
          {tier === 'free' && paymentUrl && (
            <a
              href={paymentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded bg-black px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black"
            >
              Upgrade to Pro
            </a>
          )}
          {portalUrl && (
            <a
              href={portalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
            >
              Manage subscription
            </a>
          )}
        </div>
      </section>
    </main>
  )
}
