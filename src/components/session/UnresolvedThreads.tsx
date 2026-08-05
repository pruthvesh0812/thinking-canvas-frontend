"use client"

import { useSessionStore, type ThreadChoice } from "@/stores/session-store"

const TYPE_LABEL: Record<string, string> = {
  question: "Unanswered question",
  contradiction: "Unanswered contradiction",
  empty_node: "Unfinished thought",
}

const CHOICES: Array<{ value: ThreadChoice; label: string }> = [
  { value: "carry", label: "Carry forward" },
  { value: "resolve", label: "Resolve now" },
  { value: "discard", label: "Discard" },
]

// Screen 2. Unlike screen 1 this list is computed entirely on the frontend from
// the canvas graph (see src/lib/unresolved-threads.ts) — the backend has no
// notion of an unresolved thread.
export function UnresolvedThreads() {
  const unresolved = useSessionStore((s) => s.unresolved)
  const choices = useSessionStore((s) => s.threadChoices)
  const setThreadChoice = useSessionStore((s) => s.setThreadChoice)
  const confirmThreads = useSessionStore((s) => s.confirmThreads)

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-hidden">
      <header>
        <h2 className="text-lg font-semibold">Threads you left open</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Anything you carry forward pre-loads into your next session.
        </p>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {unresolved.length === 0 && (
          <p className="text-sm text-zinc-500">Nothing left hanging — a clean close.</p>
        )}

        {unresolved.map((thread) => (
          <article
            key={thread.id}
            className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
          >
            <p className="text-[11px] font-medium uppercase tracking-widest text-zinc-400">
              {TYPE_LABEL[thread.type]}
            </p>
            <p className="mt-2 text-sm text-zinc-900 dark:text-zinc-100">{thread.label}</p>

            <div className="mt-3 flex gap-2">
              {CHOICES.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  aria-pressed={choices[thread.id] === choice.value}
                  onClick={() => setThreadChoice(thread.id, choice.value)}
                  className={
                    choices[thread.id] === choice.value
                      ? "rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-white dark:text-black"
                      : "rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
                  }
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>

      <footer className="flex justify-end">
        <button
          type="button"
          onClick={() => void confirmThreads()}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Close session
        </button>
      </footer>
    </div>
  )
}
