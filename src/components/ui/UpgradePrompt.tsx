'use client'

// Shown once per session when a free-tier user takes an action that WOULD
// fire a Pro-only agent (e.g. toggling to converging → Stress-Tester).
// Client tier checks are UI-only (non-negotiable #8); enforcement lives
// server-side in the backend Orchestrator.
type Props = {
  onDismiss(): void
}

export function UpgradePrompt({ onDismiss }: Props) {
  const paymentUrl = process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK
  return (
    <div className="fixed bottom-6 right-6 z-40 w-80 rounded-lg border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-950">
      <div className="text-sm font-semibold">Unlock the full Attunement Layer</div>
      <p className="mt-1 text-xs text-zinc-500">
        Stress-Tester, Observer, and Outer Subconscious are Pro-only. Upgrade to see
        them respond on this canvas.
      </p>
      <div className="mt-3 flex gap-2">
        {paymentUrl && (
          <a
            href={paymentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded bg-black px-3 py-1 text-xs font-medium text-white dark:bg-white dark:text-black"
          >
            Upgrade
          </a>
        )}
        <button
          className="rounded border border-zinc-300 px-3 py-1 text-xs dark:border-zinc-700"
          onClick={onDismiss}
        >
          Later
        </button>
      </div>
    </div>
  )
}
