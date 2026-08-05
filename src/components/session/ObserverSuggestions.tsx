"use client"

import { useObserverPolling } from "@/hooks/use-session-lifecycle"
import { useSessionStore } from "@/stores/session-store"

const TYPE_LABEL: Record<string, string> = {
  contradiction: "Contradiction",
  question: "Observation",
  empty_node: "Loose end",
}

// Screen 1 of Session Complete. The Observer is the only agent that speaks
// here and never mid-session (CORE-CONCEPTS.md); its output is written
// asynchronously to session_learnings, so this screen owns the "reading your
// canvas" wait state.
export function ObserverSuggestions() {
  const observations = useSessionStore((s) => s.observations)
  const observerState = useSessionStore((s) => s.observerState)
  const choices = useSessionStore((s) => s.observationChoices)
  const acceptObservation = useSessionStore((s) => s.acceptObservation)
  const dismissObservation = useSessionStore((s) => s.dismissObservation)
  const goToThreads = useSessionStore((s) => s.goToThreads)

  useObserverPolling(true)

  const waiting = observerState === "reading"

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-hidden">
      <header>
        <h2 className="text-lg font-semibold">What the Observer noticed</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Nothing lands on your canvas unless you accept it.
        </p>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {waiting && (
          <p className="animate-pulse text-sm text-zinc-500">
            The Observer is reading your canvas…
          </p>
        )}

        {!waiting && observations.length === 0 && (
          <p className="text-sm text-zinc-500">
            No observations this session.
          </p>
        )}

        {observations.map((observation) => {
          const choice = choices[observation.id]
          return (
            <article
              key={observation.id}
              className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <p className="text-[11px] font-medium uppercase tracking-widest text-zinc-400">
                {TYPE_LABEL[observation.type] ?? "Observation"}
              </p>
              <p className="mt-2 text-sm text-zinc-900 dark:text-zinc-100">
                {observation.content}
              </p>

              {choice ? (
                <p className="mt-3 text-xs text-zinc-500">
                  {choice === "accepted" ? "Added to your canvas" : "Dismissed"}
                </p>
              ) : (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void acceptObservation(observation)}
                    className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-white dark:text-black"
                  >
                    Accept to canvas
                  </button>
                  <button
                    type="button"
                    onClick={() => dismissObservation(observation.id)}
                    className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium dark:border-zinc-700"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </article>
          )
        })}
      </div>

      <footer className="flex justify-between">
        <button
          type="button"
          onClick={() => void goToThreads()}
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          Skip all
        </button>
        <button
          type="button"
          onClick={() => void goToThreads()}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Next
        </button>
      </footer>
    </div>
  )
}
