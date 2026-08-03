export interface ObserverHighlight {
  id: string
  text: string
}

export interface OpenQuestionItem {
  icon: "?" | "⊘"
  text: string
  /** Empty nodes read as a quieter, italic entry — they are an absence,
   * not a question the human actually asked. */
  muted?: boolean
}

export interface AiContributionItem {
  marker: "◌" | "✕"
  badge: string
  status: string
  text: string
  struck?: boolean
}

export interface SessionInsights {
  observer: ObserverHighlight[]
  openQuestions: OpenQuestionItem[]
  /** Either a list of ghost outcomes, or a single quiet note when the AI
   * offered nothing. A MIRROR, not a scoreboard — no streaks, no
   * percentages, no progress bars (design brief §Session Insights). */
  ai: AiContributionItem[]
  aiNote?: string
  arcLabels: string[]
  arcSummary?: string
}

export interface MockSession {
  number: number
  date: string
  shortDate: string
  durationMin: number
  description: string
  insights: SessionInsights
}

// Session history for the seeded Retention canvas. Node counts are NOT
// stored here — they are derived from the nodes actually attributed to each
// session in canvas-store, so the two can never drift.
export const MOCK_SESSIONS: MockSession[] = [
  {
    number: 1,
    date: "Jun 28, 2026",
    shortDate: "Jun 28",
    durationMin: 35,
    description: "First look at the data — the retention curve and the day-9 cliff.",
    insights: {
      observer: [
        { id: "s1-shape", text: "Both nodes describe the shape of the drop, not a cause. The thinking is still gathering — that may be exactly right this early." },
      ],
      openQuestions: [
        { icon: "?", text: "Is the day-9 cliff the same for every acquisition channel?" },
      ],
      ai: [],
      aiNote: "No ghosts offered this session.",
      arcLabels: ["0:00", "diverging", "0:35"],
    },
  },
  {
    number: 2,
    date: "Jul 5, 2026",
    shortDate: "Jul 5",
    durationMin: 28,
    description: "Week-2 patterns — solo sessions dominate.",
    insights: {
      observer: [
        { id: "s2-isolation", text: "The day-9 cliff and the solo-user pattern emerged independently but point to the same thing — isolation after onboarding." },
        { id: "s2-absence", text: "Every node so far describes an absence — nothing about what does work. Is that a gap or a deliberate focus?" },
      ],
      openQuestions: [
        { icon: "?", text: "What happens after day 11 — do people stabilize or just slowly leave?" },
        { icon: "?", text: "Are the solo users choosing to be solo, or did the product never show them teams?" },
      ],
      ai: [],
      aiNote: "No ghosts offered this session.",
      arcLabels: ["0:00", "diverging", "converging", "0:28"],
    },
  },
  {
    number: 3,
    date: "Jul 9, 2026",
    shortDate: "Jul 9",
    durationMin: 42,
    description: "The onboarding gap — days 7 to 11 — and whether solo users are the real story.",
    insights: {
      observer: [
        { id: "s3-gap", text: "Three of the six nodes orbit the same gap — days 7 through 11, after onboarding ends and before anything pulls users back. Is there a specific moment inside that window where users almost return?" },
        { id: "s3-solo", text: "Solo users and team users came up in separate threads but were never connected on the canvas. There might be something in the space between those two observations." },
        { id: "s3-shift", text: "The north star asks about retention dropping — but most of the thinking explored what's missing, not what's failing. Has the real question shifted?" },
      ],
      openQuestions: [
        { icon: "?", text: "Do referral users survive week 2 better than organic signups?" },
        { icon: "?", text: "Is there a near-miss pattern between day 7 and day 11 — users who almost came back?" },
        { icon: "⊘", text: "An empty node — something was started but never written.", muted: true },
      ],
      ai: [
        {
          marker: "◌",
          badge: "↺ reframing",
          status: "accepted",
          text: "“What if this isn't a retention problem — day 7 is where the product stops having a plan for the user.”",
        },
        {
          marker: "✕",
          badge: "? nudge",
          status: "passed · too abstract",
          text: "“What would day 8 look like if you designed it on purpose?”",
          struck: true,
        },
      ],
      arcLabels: ["0:00", "first forks", "the gap", "new threads", "narrowing", "0:42"],
      arcSummary:
        "The session opened wide — three threads in the first twelve minutes — then briefly narrowed around the day-7 gap before opening again into the solo-user question. The last fourteen minutes were convergent, circling back to onboarding.",
    },
  },
]

export const CURRENT_SESSION_NUMBER = 3

export function getSession(number: number): MockSession | undefined {
  return MOCK_SESSIONS.find((s) => s.number === number)
}

export const PAST_SESSIONS = MOCK_SESSIONS.filter((s) => s.number < CURRENT_SESSION_NUMBER).sort(
  (a, b) => b.number - a.number,
)
