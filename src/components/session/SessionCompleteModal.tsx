"use client"

import { ObserverSuggestions } from "@/components/session/ObserverSuggestions"
import { UnresolvedThreads } from "@/components/session/UnresolvedThreads"
import { useSessionStore } from "@/stores/session-store"

// The 3-screen Session Complete flow — a modal, not an inline panel, because
// it is the most significant moment in a session and the only place the
// Observer ever speaks (SESSION-FLOWS.md). It opens on a deliberate click and
// never automatically, never on tab close.
export function SessionCompleteModal() {
  const screen = useSessionStore((s) => s.modalScreen)

  if (!screen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Session complete"
        className="flex h-[min(36rem,90vh)] w-full max-w-xl flex-col rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        <ScreenIndicator screen={screen} />
        {screen === "observer" && <ObserverSuggestions />}
        {screen === "threads" && <UnresolvedThreads />}
        {screen === "closed" && <SessionClosed />}
      </div>
    </div>
  )
}

const SCREENS = ["observer", "threads", "closed"] as const

function ScreenIndicator({ screen }: { screen: (typeof SCREENS)[number] }) {
  return (
    <div className="mb-5 flex gap-1.5" aria-hidden>
      {SCREENS.map((step) => (
        <span
          key={step}
          className={
            step === screen
              ? "h-1 flex-1 rounded-full bg-zinc-900 dark:bg-white"
              : "h-1 flex-1 rounded-full bg-zinc-200 dark:bg-zinc-800"
          }
        />
      ))}
    </div>
  )
}

// Screen 3 — confirmation. The north star survives the session; the carried
// threads are what the next one starts from.
function SessionClosed() {
  const originalIntent = useSessionStore((s) => s.originalIntent)
  const carryForwardError = useSessionStore((s) => s.carryForwardError)
  const carried = useSessionStore((s) => s.carried)
  const startNewSession = useSessionStore((s) => s.startNewSession)
  const closeModal = useSessionStore((s) => s.closeModal)

  return (
    <div className="flex flex-1 flex-col gap-4">
      <header>
        <h2 className="text-lg font-semibold">Session closed</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Your thinking is saved. Nothing was changed without you.
        </p>
      </header>

      <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="text-[11px] font-medium uppercase tracking-widest text-zinc-400">
          North star
        </p>
        <p className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">{originalIntent}</p>
      </div>

      <p className="text-sm text-zinc-500">
        {carried.length === 1
          ? "1 thread is waiting for your next session."
          : `${carried.length} threads are waiting for your next session.`}
      </p>

      {carryForwardError && (
        <p className="text-sm text-amber-600 dark:text-amber-400">{carryForwardError}</p>
      )}

      <footer className="mt-auto flex justify-between">
        <button
          type="button"
          onClick={closeModal}
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          Back to canvas
        </button>
        <button
          type="button"
          onClick={() => void startNewSession()}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Start new session
        </button>
      </footer>
    </div>
  )
}
