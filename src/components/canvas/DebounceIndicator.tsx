import type { InterventionPhase } from "@/hooks/use-intervention-demo"

interface DebounceIndicatorProps {
  phase: InterventionPhase
  remaining: number
  paused: boolean
  togglePause: () => void
  processNow: () => void
}

function wavePath() {
  let d = "M0 20"
  for (let x = 0; x < 1440; x += 72) {
    d += ` Q${x + 18} 6 ${x + 36} 20 T${x + 72} 20`
  }
  return d
}

// The debounce/generating indicator, elaborated per the design's flagship
// intervention: a one-shot scan shimmer (trigger), then a soft amber
// waveform + timer pill (waiting — the human's window to defer, approve, or
// ignore) and a steadier waveform while generating. Nothing appears on the
// canvas itself until the halo (CORE-CONCEPTS.md — "the AI never barges in").
export function DebounceIndicator({ phase, remaining, paused, togglePause, processNow }: DebounceIndicatorProps) {
  const waving = phase === "waiting" || phase === "generating"

  return (
    <>
      {phase === "shimmer" && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="absolute -top-10 -bottom-10 w-1/3"
            style={{
              transform: "skewX(-14deg)",
              background:
                "linear-gradient(90deg,rgba(201,144,58,0),rgba(201,144,58,.10) 45%,rgba(201,144,58,.16) 50%,rgba(201,144,58,.10) 55%,rgba(201,144,58,0))",
              animation: "tc-sweep 1.35s ease-in-out both",
            }}
          />
        </div>
      )}

      {waving && (
        <svg
          width="100%"
          height="36"
          viewBox="0 0 1440 36"
          preserveAspectRatio="none"
          className="pointer-events-none absolute bottom-0 left-0"
          style={{
            transform: `scaleY(${phase === "generating" ? 1 : 0.55})`,
            transformOrigin: "bottom",
            opacity: phase === "generating" ? 0.85 : 0.55,
            transition: "transform .9s ease, opacity .6s ease",
          }}
        >
          <g style={{ animation: "tc-wdrift 9s linear infinite" }}>
            <path d={wavePath()} fill="none" stroke="rgba(201,144,58,.55)" strokeWidth="1.5" />
          </g>
        </svg>
      )}

      {waving && (
        <div
          className="pointer-events-auto absolute bottom-3.5 right-4 flex items-center gap-2 rounded-full px-3 py-1.5"
          style={{
            background: "var(--tc-panel)",
            border: "1px solid var(--tc-panel-border)",
            boxShadow: "0 2px 8px rgba(43,38,34,.07)",
            animation: "tc-fadeup .45s ease-out both",
          }}
        >
          {phase === "waiting" ? (
            <>
              <svg width="20" height="20" viewBox="0 0 20 20">
                <circle cx="10" cy="10" r="8" fill="none" stroke="#E8E0D0" strokeWidth="2" />
                <circle
                  cx="10"
                  cy="10"
                  r="8"
                  fill="none"
                  stroke="var(--tc-amber)"
                  strokeWidth="2"
                  pathLength={100}
                  strokeDasharray={100}
                  strokeDashoffset={100 * (1 - remaining / 10)}
                  transform="rotate(-90 10 10)"
                  strokeLinecap="round"
                />
              </svg>
              <span className="text-[11px]" style={{ color: "#6B6257" }}>
                noticed something
              </span>
              <button
                type="button"
                onClick={togglePause}
                title="Not a rejection — tells the system you're busy, so it eases off."
                className="pl-[9px] text-[11.5px]"
                style={{ border: "none", background: "none", color: "var(--tc-chrome)", borderLeft: "1px solid #E8E0D0" }}
              >
                {paused ? "resume" : "pause"}
              </button>
              <button
                type="button"
                onClick={processNow}
                className="text-[11.5px]"
                style={{ border: "none", background: "none", color: "var(--tc-amber-ink)" }}
              >
                now
              </button>
            </>
          ) : (
            <>
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--tc-amber)" }} />
              <span className="text-[11px]" style={{ color: "#6B6257" }}>
                on its way — keep thinking
              </span>
            </>
          )}
        </div>
      )}
    </>
  )
}
