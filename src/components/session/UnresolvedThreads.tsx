"use client"

import { useSessionCompleteStore, type CarryChoice, type UnresolvedThreadKind } from "@/stores/session-complete-store"

const CHOICES: { value: CarryChoice; label: string }[] = [
  { value: "carry", label: "Carry forward" },
  { value: "resolve", label: "Resolve now" },
  { value: "discard", label: "Discard" },
]

const KIND_LABEL: Record<UnresolvedThreadKind, string> = {
  question: "? open question",
  empty_node: "⊘ empty node",
}

// Screen 2 of Session Complete (SESSION-FLOWS.md) — entirely frontend-computed
// from canvas state, unlike screen 1's backend-sourced observations. Choices
// only take effect on screen 3's "Start New Session" (use-session-lifecycle.ts).
export function UnresolvedThreads() {
  const threads = useSessionCompleteStore((s) => s.unresolvedThreads)
  const choices = useSessionCompleteStore((s) => s.choices)
  const setChoice = useSessionCompleteStore((s) => s.setChoice)
  const goToClosed = useSessionCompleteStore((s) => s.goToClosed)

  return (
    <div className="flex flex-col gap-4">
      {threads.length === 0 ? (
        <p className="text-[13px] leading-[1.6]" style={{ color: "var(--tc-chrome)" }}>
          Nothing left open — every question has a follow-up, every node has words.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {threads.map((t) => (
            <div
              key={t.id}
              className="rounded-[10px] p-3.5"
              style={{ background: "var(--tc-node)", border: "1px solid var(--tc-node-border)" }}
            >
              <div className="mb-1.5 text-[10.5px] uppercase" style={{ letterSpacing: ".5px", color: "var(--tc-chrome-quiet)" }}>
                {KIND_LABEL[t.kind]}
              </div>
              <p
                className="mb-2.5 text-[13px] leading-[1.5]"
                style={{
                  color: t.kind === "empty_node" ? "var(--tc-chrome)" : "var(--tc-ink)",
                  fontStyle: t.kind === "empty_node" ? "italic" : "normal",
                }}
              >
                {t.content}
              </p>
              <div className="flex gap-1.5">
                {CHOICES.map((c) => {
                  const active = choices[t.id] === c.value
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setChoice(t.id, c.value)}
                      className="rounded-full px-3 py-1 text-[11.5px]"
                      style={{
                        border: `1px solid ${active ? "rgba(43,38,34,.5)" : "var(--tc-hairline-strong)"}`,
                        background: active ? "#F1EBDF" : "transparent",
                        color: active ? "var(--tc-ink)" : "var(--tc-chrome)",
                        fontWeight: active ? 600 : 400,
                      }}
                    >
                      {c.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 flex justify-end" style={{ borderTop: "1px solid var(--tc-hairline)", paddingTop: 16 }}>
        <button
          type="button"
          onClick={goToClosed}
          className="rounded-full px-5 py-2 text-[12.5px] font-semibold"
          style={{ border: "none", background: "var(--tc-ink)", color: "#F5F1E8" }}
        >
          Continue →
        </button>
      </div>
    </div>
  )
}
