import type { SessionLearning } from "@/types"

// Session Complete's Observer pass is backend-async — POST
// /api/session/complete only enqueues it (API-CONTRACT.md). Mock mode has no
// backend to run that pass, so this stands in for what would eventually land
// in `session_learnings` for the seeded Retention canvas. Shape matches the
// real table exactly so ObserverSuggestions never needs a mock-only branch.
export const MOCK_OBSERVER_SUGGESTIONS: SessionLearning[] = [
  {
    id: "mock-learning-1",
    canvas_id: "mock",
    session_id: "mock",
    type: "contradiction",
    content:
      "\"The drop is steepest for users who never invited a teammate\" sits uneasily next to \"Week-2 usage is almost entirely solo sessions.\" Solo users churn less, but never-inviting users churn most — same population, or two different groups?",
    created_at: new Date().toISOString(),
  },
  {
    id: "mock-learning-2",
    canvas_id: "mock",
    session_id: "mock",
    type: "question",
    content:
      "Three nodes now orbit the day 7–11 window without ever being drawn as a single shape. Is the gap itself the finding?",
    created_at: new Date().toISOString(),
  },
]
