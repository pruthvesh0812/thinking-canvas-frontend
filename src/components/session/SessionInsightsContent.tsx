import type { MockSession } from "@/lib/mock-sessions"
import type { InsightsMode } from "@/stores/session-store"

// The organic diverge/converge ribbon — a gentle tide, never a chart. No
// axes, no gridlines, no data-viz styling (design brief §"Diverge/converge
// timeline"). Two path densities so it reads at either panel width.
const ARC_PATH_FULL =
  "M0,26 C15,26 30,22 55,18 C80,14 100,11 130,9 C160,7 175,10 195,16 C215,22 225,26 240,27 C255,28 270,24 290,18 C310,12 330,9 350,8 C370,7 385,9 400,14 C415,19 428,22 440,24 L440,32 C428,34 415,37 400,40 C385,43 370,45 350,44 C330,43 310,38 290,34 C270,30 255,30 240,31 C225,32 215,34 195,40 C175,46 160,49 130,47 C100,45 80,40 55,36 C30,32 15,30 0,30 Z"
const ARC_PATH_SIDEBAR =
  "M0,16 C20,16 40,12 70,10 C100,8 120,10 150,14 C180,18 200,20 220,19 C240,18 260,16 290,15 L332,16 L332,20 C290,21 260,22 240,24 C220,26 200,26 180,24 C150,30 120,32 70,28 C40,24 20,20 0,20 Z"

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[10px] uppercase"
      style={{ letterSpacing: ".65px", color: "var(--tc-chrome-quiet)" }}
    >
      {children}
    </div>
  )
}

function TheArc({ session, mode }: { session: MockSession; mode: InsightsMode }) {
  const full = mode === "full"
  return (
    <div>
      <SectionLabel>The arc of the session</SectionLabel>
      <div className="relative mt-4">
        <svg
          viewBox={full ? "0 0 440 56" : "0 0 332 36"}
          preserveAspectRatio="none"
          className="block w-full"
          style={{ height: full ? 56 : 36 }}
        >
          <path d={full ? ARC_PATH_FULL : ARC_PATH_SIDEBAR} fill="rgba(43,38,34,0.04)" />
        </svg>
        <div
          className="mt-1.5 flex justify-between text-[9.5px]"
          style={{ color: "var(--tc-chrome-faint)" }}
        >
          {session.insights.arcLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      </div>
      {full && session.insights.arcSummary && (
        <div
          className="mt-8 max-w-[380px] text-[11.5px] leading-[1.6]"
          style={{ color: "var(--tc-chrome-quiet)", textWrap: "pretty" }}
        >
          {session.insights.arcSummary}
        </div>
      )}
    </div>
  )
}

// Never an AI-written "here's what you concluded" summary — every block
// either mirrors what the human already did or invites more thinking
// (design brief: this is an anti-answer-machine product).
export function SessionInsightsContent({ session, mode }: { session: MockSession; mode: InsightsMode }) {
  const full = mode === "full"
  const { observer, openQuestions, ai, aiNote } = session.insights

  const blocks = (
    <>
      <div>
        <SectionLabel>What the observer noticed</SectionLabel>
        <div className={`flex flex-col ${full ? "mt-[22px] gap-[22px]" : "mt-3 gap-3"}`}>
          {observer.map((h) => (
            <div
              key={h.id}
              className={full ? "pl-4" : "pl-3"}
              style={{ borderLeft: "2px solid rgba(43,38,34,.07)" }}
            >
              <div
                className={full ? "text-[14.5px] leading-[1.65]" : "text-[13px] leading-[1.55]"}
                style={{ color: "#4A4239", textWrap: "pretty" }}
              >
                {h.text}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Open questions</SectionLabel>
        <div className={`flex flex-col ${full ? "mt-[18px] gap-3.5" : "mt-3 gap-2"}`}>
          {openQuestions.map((q) => (
            <div key={q.text} className="flex items-baseline gap-2.5">
              <span
                className="flex-none text-[12.5px]"
                style={{ color: "var(--tc-chrome-quiet)" }}
              >
                {q.icon}
              </span>
              <span
                className={full ? "text-[14.5px] leading-[1.55]" : "text-[12.5px] leading-[1.45]"}
                style={{
                  color: q.muted ? "var(--tc-chrome)" : "#4A4239",
                  fontStyle: q.muted ? "italic" : "normal",
                }}
              >
                {q.text}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>The AI this session</SectionLabel>
        {ai.length === 0 ? (
          <div
            className={`${full ? "mt-[18px] text-[13px]" : "mt-2.5 text-[12.5px]"} leading-[1.5]`}
            style={{ color: "var(--tc-chrome)" }}
          >
            {aiNote}
          </div>
        ) : (
          <div className={`flex flex-col ${full ? "mt-[18px] gap-5" : "mt-3 gap-3.5"}`}>
            {ai.map((item) => (
              <div key={item.text} className="flex items-start gap-3">
                <span
                  className="mt-px flex-none text-[13px]"
                  style={{ color: item.marker === "◌" ? "var(--tc-chrome-quiet)" : "var(--tc-chrome-faint)" }}
                >
                  {item.marker}
                </span>
                <div>
                  <div className="mb-1.5 flex items-baseline gap-2">
                    <span
                      className="rounded-full px-2 py-0.5 text-[10.5px]"
                      style={{ border: "1px solid rgba(43,38,34,.12)", color: "var(--tc-chrome)" }}
                    >
                      {item.badge}
                    </span>
                    <span className="text-[11px]" style={{ color: "var(--tc-chrome-faint)" }}>
                      {item.status}
                    </span>
                  </div>
                  <div
                    className="text-[13px] italic leading-[1.55]"
                    style={{
                      color: item.struck ? "var(--tc-chrome-faint)" : "var(--tc-chrome)",
                      textDecoration: item.struck ? "line-through" : "none",
                    }}
                  >
                    {item.text}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )

  if (!full) {
    return (
      <div className="flex flex-col gap-7">
        {blocks}
        <TheArc session={session} mode={mode} />
      </div>
    )
  }

  // Full view splits into two columns once there is room; below ~920px the
  // wrap makes it degrade to the stacked reading order during the morph.
  return (
    <div className="flex flex-wrap gap-x-20 gap-y-12">
      <div className="flex min-w-[420px] flex-1 flex-col gap-[52px]">{blocks}</div>
      <div className="w-[440px] flex-none">
        <TheArc session={session} mode={mode} />
      </div>
    </div>
  )
}
