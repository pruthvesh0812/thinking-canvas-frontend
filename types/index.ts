// MIRRORED from thinking-canvas-api/types/index.ts
// source commit: <unavailable — backend repo not accessible from this session;
//                  types reconstructed from .ai/context/API-CONTRACT.md +
//                  .ai/context/GHOST-STREAMING.md as of 2026-07-05>
// synced: 2026-07-06
// Do not edit by hand — re-run .ai/skills/sync-contract-types.md as soon as
// the backend repo is accessible; verify against src/routes/* and types/index.ts
// and record the real commit sha here.

// ---- Enums ------------------------------------------------------------------

export type EdgeType = 'logical' | 'doubt' | 'question' | 'ghost'

export type ContextNodeType =
  | 'reframe'
  | 'mirror'
  | 'pattern'
  | 'reference'
  | 'contradiction'
  | 'appreciation'

// Backend-owned string; agent role labels are not enumerated in API-CONTRACT.md.
export type AgentRole = string

export type CanvasEventType = 'node.created' | 'edge.created'

export type GhostNodeStatus = 'accepted' | 'rejected'

export type RejectionReason = 'too_abstract' | 'too_technical' | 'skip_for_now'

// ---- POST /api/canvas-event -------------------------------------------------

export type CanvasEvent = {
  canvas_id: string
  session_id: string
  event_type: CanvasEventType
  node_id?: string
  edge_id?: string
}

export type CanvasEventResponse = { ok: true }

// ---- SSE (GET /api/stream/:sessionId) --------------------------------------

export type SpawnDescriptor = {
  trigger_node_id: string
  session_id: string
  context_node: {
    ghost_id: string
    node_type: ContextNodeType
    agent_role: AgentRole
  }
  context_edge: { edge_type: EdgeType; from: string; to: string }
  question_node?: { ghost_id: string; node_type: 'question' }
  question_edge?: { edge_type: EdgeType; from: string; to: string }
}

export type RedisMessage =
  | { type: 'spawn'; descriptor: SpawnDescriptor }
  | { type: 'chunk'; target: string; data: string }
  | { type: 'done' }
  | { type: 'ping' }

// ---- POST /api/ghost-status -------------------------------------------------

export type GhostStatus = {
  thread_id: string
  turn_index: number
  canvas_id: string
  session_id: string
  context_node_status: GhostNodeStatus
  question_node_status: GhostNodeStatus | null
  rejection_reason?: RejectionReason
  interacted_at: number
}

export type GhostStatusResponse = { ok: true }

// ---- POST /api/session/start -----------------------------------------------

export type SessionStartRequest = { canvas_id: string }
export type SessionStartResponse = { session_id: string }

// ---- POST /api/session/complete --------------------------------------------

export type SessionCompleteRequest = {
  session_id: string
  canvas_id: string
  carry_forward_ids: string[]
}
export type SessionCompleteResponse = { ok: true }

// ---- GET /health ------------------------------------------------------------

export type HealthResponse = { status: 'ok' }
