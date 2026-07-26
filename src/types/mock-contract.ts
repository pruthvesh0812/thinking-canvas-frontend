// Stand-in for the backend-mirrored `types/index.ts` (the contract-layer
// story hasn't landed yet, so there is nothing to mirror). Shapes here follow
// .ai/context/CORE-CONCEPTS.md, CANVAS-RENDERING.md and GHOST-STREAMING.md so
// that swapping in the real mirrored contract later is a type-only change.
// Delete this file once contract-layer lands and import from '@/types' instead.

export type NodeOwner = "human" | "ai"

export type HumanEdgeType = "logical" | "question"

export type ContextNodeType =
  | "reframe"
  | "mirror"
  | "pattern"
  | "reference"
  | "contradiction"
  | "appreciation"

export type AgentRole =
  | "expander"
  | "stress_tester"
  | "outer_subconscious"
  | "articulator"

export type RejectionReason = "too_abstract" | "too_technical" | "skip_for_now"

export type SessionPhase = "diverging" | "converging"

// Mirrors GHOST-STREAMING.md's SpawnDescriptor — the ghost layout contract.
// The mock intervention hook constructs one of these instead of receiving it
// over SSE; everything downstream (ghost-store, ghost node components) is
// written against this shape so the real wiring is a source swap, not a rewrite.
export interface MockSpawnDescriptor {
  trigger_node_id: string
  context_node: {
    ghost_id: string
    node_type: ContextNodeType
    agent_role: AgentRole
    text: string
  }
  question_node?: {
    ghost_id: string
    text: string
  }
}
