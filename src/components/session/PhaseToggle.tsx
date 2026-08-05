"use client"

import { useSessionStore } from "@/stores/session-store"
import type { SessionPhase } from "@/types"

const PHASES: Array<{ value: SessionPhase; label: string; hint: string }> = [
  { value: "diverging", label: "Diverging", hint: "Expanding — the Expander is listening" },
  { value: "converging", label: "Converging", hint: "Narrowing — the Stress-Tester may push back" },
]

// The manual phase override, always visible so the user knows which mode the AI
// is in. Switching to converging is what makes the Stress-Tester eligible to
// fire (CORE-CONCEPTS.md) — the backend also senses the transition, and the
// user's toggle always wins.
export function PhaseToggle() {
  const phase = useSessionStore((s) => s.phase)
  const setPhase = useSessionStore((s) => s.setPhase)

  return (
    <div
      className="inline-flex rounded-full border border-zinc-200 p-0.5 dark:border-zinc-800"
      role="group"
      aria-label="Session phase"
    >
      {PHASES.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.hint}
          aria-pressed={phase === option.value}
          onClick={() => void setPhase(option.value)}
          className={
            phase === option.value
              ? "rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-white dark:bg-white dark:text-black"
              : "rounded-full px-3 py-1 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
