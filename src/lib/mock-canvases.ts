export interface MockCanvasSummary {
  id: string
  title: string
  originalIntent: string
  sessionLabel: string
  nodeCount: number
}

// Dashboard list data — canvas-dashboard hasn't landed against the real
// backend yet, so this stands in for "load every canvas the user owns."
// Only "retention" has a seeded graph behind it (canvas-store); the other
// three exist to prove the dashboard/grid design out, not as working canvases.
export const MOCK_CANVASES: MockCanvasSummary[] = [
  {
    id: "retention",
    title: "Retention",
    originalIntent: "Why is our user retention dropping after week 2?",
    sessionLabel: "session 3 · 2 days ago",
    nodeCount: 18,
  },
  {
    id: "onboarding",
    title: "Onboarding",
    originalIntent: "What's actually broken about our onboarding flow?",
    sessionLabel: "session 5 · yesterday",
    nodeCount: 31,
  },
  {
    id: "free-tier",
    title: "Free tier",
    originalIntent: "Should we sunset the free tier?",
    sessionLabel: "session 1 · 12 days ago",
    nodeCount: 7,
  },
  {
    id: "naming",
    title: "Naming",
    originalIntent: "What should we name the new product line?",
    sessionLabel: "session 2 · 6 days ago",
    nodeCount: 9,
  },
]
