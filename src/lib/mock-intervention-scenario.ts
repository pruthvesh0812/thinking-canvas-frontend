import type { MockSpawnDescriptor } from "@/stores/ghost-store"

// The one seeded intervention scenario for this pass — anchors to n2
// ("Onboarding ends on day 7…"). Content matches ThinkingCanvas.dc.html's
// demo verbatim: a grounding reframe, then its question downstream
// ("ground before nudge, never question-first" — CORE-CONCEPTS.md).
export const MOCK_INTERVENTION: MockSpawnDescriptor = {
  trigger_node_id: "n2",
  context_node: {
    ghost_id: "g1",
    node_type: "reframe",
    agent_role: "expander",
    text: "What if this isn't a retention problem — day 7 is simply where the product stops having a plan for the user.",
  },
  question_node: {
    ghost_id: "g2",
    text: "What would day 8 look like if you designed it on purpose?",
  },
}
