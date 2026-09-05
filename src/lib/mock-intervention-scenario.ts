import type { SpawnDescriptor } from "@/types"

// The one seeded intervention scenario for this pass — anchors to n2
// ("Onboarding ends on day 7…"). Content matches ThinkingCanvas.dc.html's
// demo verbatim: a grounding reframe, then its question downstream
// ("ground before nudge, never question-first" — CORE-CONCEPTS.md).
export const MOCK_INTERVENTION_TEXT = {
  context: "What if this isn't a retention problem — day 7 is simply where the product stops having a plan for the user.",
  question: "What would day 8 look like if you designed it on purpose?",
}

// A real SpawnDescriptor — the demo hook streams MOCK_INTERVENTION_TEXT into
// it via the same store actions (appendChunk/markDone) the real SSE hook
// uses, instead of a separate mock-only full-text shape.
export const MOCK_INTERVENTION: SpawnDescriptor = {
  trigger_node_id: "n2",
  session_id: "mock-session",
  anchor_node_ids: ["n2"],
  context_node: { ghost_id: "g1", node_type: "reframe", agent_role: "expander" },
  context_edge: { edge_type: "logical", from: "n2", to: "g1" },
  question_node: { ghost_id: "g2", node_type: "question" },
  question_edge: { edge_type: "logical", from: "g1", to: "g2" },
}
