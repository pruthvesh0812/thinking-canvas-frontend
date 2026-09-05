// MIRRORED from thinking-canvas-api/types/index.ts
// source commit: 21d9ac454915d1d6e0eb8f210b1c998150b76d12   synced: 2026-08-05
// PARTIAL SYNC 2026-09-06: EdgeType + SpawnDescriptor's `relate`-edge fields
// only, hand-pulled from thinking-canvas-api's working tree on branch
// feature/node-position-persistence-2026-08-11T1200 (uncommitted at sync
// time — no commit sha to cite). The mirror is ALSO independently stale
// beyond this (missing EdgeHandle, Node.x/y/width/height, Edge.from_handle/
// to_handle, all merged to the backend's main since 21d9ac4) — untouched
// here as out of scope for the relate change; needs its own full resync.
// Do not edit by hand — re-run .ai/skills/sync-contract-types.md
//
// This repo does not ship zod at runtime (no `zod` dependency) — the
// backend's five Zod schemas are hand-expanded below as plain TS types that
// match the schemas' shape (including the canvasEventSchema `.refine()`,
// expressed as a discriminated union instead of a runtime check) rather than
// dropped. If zod is ever added here, replace these with `z.infer<...>` and
// import the schemas verbatim instead.

// ─────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────

export type AgentRole =
  | 'expander'
  | 'stress_tester'
  | 'observer'
  | 'outer_subconscious'
  | 'articulator'

export type ContextNodeType =
  | 'reframe'
  | 'mirror'
  | 'pattern'
  | 'reference'
  | 'contradiction'
  | 'appreciation'

// 'relate' is the DELIBERATE "articulate this connection" gesture — the only
// edge type that triggers the Articulator immediately. 'logical' (and doubt /
// associative) are silent structural edges: drawing one just rearranges the
// canvas, absorbed into the next debounced pass, so the user isn't ambushed by
// a ghost every time they tidy up their thinking. 'question' still fires the
// Outer Subconscious.
export type EdgeType = 'logical' | 'doubt' | 'question' | 'associative' | 'relate'

export type DirectionMarker = 'establishes' | 'questions' | 'contradicts' | 'explores'

export type GhostStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'context_accepted'
  | 'question_accepted'
  | 'ignored'

export type RejectionReason = 'too_abstract' | 'too_technical' | 'skip_for_now'

export type InsightSeverity = 'hard_block' | 'approach_pivot' | 'temporal_deferral'

// Why a single Observer edge (anchor→observation or observation→observation) was rejected.
// Distinct from RejectionReason — that's about content quality, this is about connection quality.
export type ConnectionRejectionReason =
  | 'not_related' // the two nodes don't actually connect this way
  | 'wrong_direction' // the connection is real but reversed
  | 'too_indirect' // the jump is real but needs an intermediate bridge node
  | 'already_obvious' // the user already sees this connection — not a genuine insight

export type GhostEdgeStatus = 'pending' | 'accepted' | 'rejected'

export type CognitiveMode = 'exploratory' | 'transitional' | 'declarative'

export type QuestionStyle = 'opening' | 'bridging' | 'closing'

export type SessionPhase = 'diverging' | 'converging'

export type SubscriptionTier = 'free' | 'pro' | 'power'

// ─────────────────────────────────────────────
// Core domain types
// ─────────────────────────────────────────────

export type Canvas = {
  id: string
  user_id: string
  title: string
  original_intent: string // immutable after creation — RLS WITH CHECK rejects an UPDATE that changes it
  canvas_version: number // context fingerprint — bumped by a DB trigger on nodes/edges; frontend never writes it
  created_at: string
}

export type Session = {
  id: string
  canvas_id: string
  status: 'active' | 'closed'
  current_phase: SessionPhase
  node_sequence: string[] // ordered node IDs created in THIS session only — backend-written, read-only for the frontend
  latest_seq: number // monotonic version guard — intervention-spectrum, not yet exercised by any live pipeline
  receptivity: number // decayed offer-response aggregate, [0,1] — intervention-spectrum, not yet exercised
  receptivity_updated_at: string
  start_time: string
  end_time: string | null
}

export type Node = {
  id: string
  canvas_id: string
  session_id: string
  owner: 'human' | 'ai'
  content: string | null
  summary: string | null // backend-written (Gemini directional summary) — frontend renders NULL, never writes it
  direction_marker: DirectionMarker | null // backend-written
  embedding: number[] | null // backend-written — VECTOR(3072)
  created_at: string
}

export type Edge = {
  id: string
  canvas_id: string
  session_id: string
  from_node_id: string
  to_node_id: string
  edge_type: EdgeType
  both_existing: boolean
  created_at: string
}

// ─────────────────────────────────────────────
// Agent thread types (read-only ground truth — the frontend does not write these)
// ─────────────────────────────────────────────

export type GhostPair = {
  triggered_by_node_id: string
  context_ghost_id: string
  question_ghost_id: string | null
  pair_status: GhostStatus
}

export type ThreadMessage =
  | {
      role: 'user'
      turn_type: 'canvas_event' | 'session_boundary'
      content: string
      node_id?: string
      timestamp: string
    }
  | {
      role: 'assistant'
      turn_type: 'ghost_pair'
      content: string
      ghost_pair: GhostPair
      timestamp: string
    }
  | {
      role: 'assistant'
      turn_type: 'observer_structure'
      content: string
      structure_id: string
      timestamp: string
    }

export type AgentThread = {
  id: string
  canvas_id: string
  agent_role: AgentRole
  messages: ThreadMessage[]
  active_rejection_insight_ids: string[]
  updated_at: string
}

// ─────────────────────────────────────────────
// Observer structures — designed but not built yet (FRONTEND-CONTRACT.md §10.1):
// observer_structures/observer_edges tables exist and these types are real, but
// nothing writes them yet and POST /api/observer-edge-status is not a route.
// Mirrored for when that lands — do not build UI against it today.
// ─────────────────────────────────────────────

export type ObservationNode = {
  ghost_id: string
  level: number // 0 = bridges directly from the anchor nodes
  node_type: ContextNodeType
  content: string
}

export type ObserverEdge = {
  id: string
  structure_id: string
  from_id: string // an anchor node id, or another observation node's ghost_id
  to_id: string // an observation node's ghost_id
  status: GhostEdgeStatus
  created_at: string
}

export type ObserverStructure = {
  id: string
  canvas_id: string
  session_id: string | null
  thread_id: string | null
  anchor_node_ids: string[]
  nodes: ObservationNode[]
  created_at: string
}

export type ObserverObservation = {
  anchor_node_ids: string[]
  nodes: ObservationNode[]
  edges: Array<{ from_id: string; to_id: string }>
}

// ─────────────────────────────────────────────
// Attunement (backend-internal — surfaced nowhere in the product per CORE-CONCEPTS.md)
// ─────────────────────────────────────────────

export type AttunementState = {
  id: string
  canvas_id: string
  session_id: string
  node_id: string | null
  cognitive_mode: CognitiveMode
  question_style: QuestionStyle
  phase_shift_suggested: boolean
  confidence: number | null
  created_at: string
}

// ─────────────────────────────────────────────
// Rejection Insights (backend-internal)
// ─────────────────────────────────────────────

export type InsightPoint = {
  label: string
  sequence_number: number
}

export type RejectionInsight = {
  id: string
  canvas_id: string
  session_id: string | null
  thread_id: string | null
  rejection_reason: RejectionReason | null
  severity: InsightSeverity
  insight_points: InsightPoint[]
  turns_remaining: number | null
  active: boolean
  target_edge_id: string | null
  connection_feedback: ConnectionRejectionReason | null
  created_at: string
}

// ─────────────────────────────────────────────
// Streaming types (Plane 3 — GET /api/stream/:sessionId)
// ─────────────────────────────────────────────

export type SpawnDescriptor = {
  trigger_node_id: string
  session_id: string

  // Set for edge-triggered spawns (Articulator via a `relate` edge); undefined
  // for node-triggered spawns (Expander / Stress-Tester / Outer Subconscious).
  trigger_edge_id?: string

  // The canvas nodes the ghost pair visually anchors to — the frontend drives
  // its halos off this single field. ALWAYS populated: [trigger_node_id] for a
  // node-triggered spawn, [from_node_id, to_node_id] (source first) for a
  // relate-triggered Articulator run.
  anchor_node_ids: string[]

  context_node: {
    ghost_id: string
    node_type: ContextNodeType
    agent_role: AgentRole
  }
  context_edge: {
    edge_type: EdgeType
    from: string // trigger_node_id
    to: string // context ghost_id
  }

  question_node?: {
    ghost_id: string
    node_type: 'question'
  }
  question_edge?: {
    edge_type: EdgeType
    from: string // context ghost_id
    to: string // question ghost_id
  }
}

// Intervention Spectrum offer lifecycle — DESIGNED, NOT LIVE. `waiting` /
// `offer` / `withdraw` are real RedisMessage variants in the backend's types
// but src/routes/intervention.ts is never mounted in src/index.ts, so the
// stream never actually emits them today. Handle them (ignore-and-log is
// fine) for forward-compat; do not build UI that depends on receiving them.
export type InterventionStatus = 'waiting' | 'shown' | 'pulled' | 'dismissed' | 'superseded' | 'expired'

export type InterventionDirectness = 'direct' | 'subtle'

export type InterventionOffer = {
  id: string
  canvas_id: string
  session_id: string
  agent_role: AgentRole
  trigger_node_id: string
  anchor_node_ids: string[]
  seq: number
  context_fingerprint: string
  directness: InterventionDirectness | null
  headline: string | null
  status: InterventionStatus
  created_at: string
  resolved_at: string | null
}

// The live stream today only ever emits spawn/chunk/node_type/done/ping — see
// the per-agent cheat sheet in GHOST-STREAMING.md. Route on `type` with an
// explicit ignore-and-log default; never an exhaustive switch that throws.
export type RedisMessage =
  | { type: 'waiting'; offer: InterventionOffer; timer_ms: number } // not live — see note above
  | { type: 'offer'; offer: InterventionOffer } // not live
  | { type: 'withdraw'; offer_id: string } // not live
  | { type: 'spawn'; descriptor: SpawnDescriptor }
  | { type: 'chunk'; target: string; data: string } // target = ghost_id; chunk is pre-routed server-side (context vs question) — never carries markers
  | { type: 'node_type'; target: string; node_type: ContextNodeType } // server-side [NODE_TYPE:] split — restyle the context ghost named by target
  | {
      // Attribution-carrying done, published AFTER the ghost_pair thread turn is
      // persisted — read thread_id/turn_index straight off this for
      // POST /api/ghost-status, no agent_threads read needed.
      type: 'done'
      thread_id: string
      turn_index: number
      trigger_node_id: string
      context_ghost_id: string
      question_ghost_id: string | null
    }
  | { type: 'ping' } // keepalive every 25s — ignore

// ─────────────────────────────────────────────
// Audit types
// ─────────────────────────────────────────────

export type AiContribution = {
  id: string
  canvas_id: string
  session_id: string | null
  agent_role: AgentRole
  ghost_id: string | null
  status: GhostStatus
  created_at: string
}

export type SessionLearning = {
  id: string
  canvas_id: string
  session_id: string
  content: string
  type: 'question' | 'contradiction' | 'empty_node'
  created_at: string
}

export type Subscription = {
  id: string
  user_id: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  tier: SubscriptionTier
  status: 'active' | 'canceled' | 'past_due'
  updated_at: string
}

// ─────────────────────────────────────────────
// API payload types — hand-expanded from the backend's Zod schemas (see file
// header: this repo has no zod dependency, so these are plain types, not
// z.infer). Keep in lockstep with thinking-canvas-api/types/index.ts.
// ─────────────────────────────────────────────

// POST /api/canvas-event
// ORDERING CONTRACT: write the row to Supabase first, then POST here with the
// id — the backend always re-reads the authoritative row, never the request
// body. Mirrors canvasEventSchema's `.refine()` as a discriminated union:
// node events require node_id, edge events require edge_id, and
// ghost.accepted requires node_ids + agent_role — enforced at compile time
// here instead of by a runtime refinement.
export type CanvasEvent =
  | {
      canvas_id: string
      session_id: string
      event_type: 'node.created' | 'node.updated' | 'node.deleted'
      node_id: string
    }
  | {
      canvas_id: string
      session_id: string
      event_type: 'edge.created' | 'edge.deleted'
      edge_id: string
    }
  | {
      // Enriches accepted AI nodes (summary/embedding/node_sequence + an
      // ai_contributions audit row) — the frontend fires this AFTER writing
      // the accepted ghost's nodes/edges to Supabase itself (§7.3). Never
      // re-triggers an agent; safe to retry.
      canvas_id: string
      session_id: string
      event_type: 'ghost.accepted'
      node_ids: string[]
      agent_role: AgentRole
    }

// POST /api/ghost-status
export type GhostStatusPayload = {
  thread_id: string
  turn_index: number
  canvas_id: string
  session_id: string
  context_node_status: 'accepted' | 'rejected'
  question_node_status: 'accepted' | 'rejected' | null
  rejection_reason?: RejectionReason
  interacted_at: number // unix ms
}

// POST /api/observer-edge-status — mirrored for completeness; NOT a live
// route yet (Known Gap #2 / FRONTEND-CONTRACT.md §10.1). Do not add an
// api.ts wrapper for this until the backend ships the route.
export type ObserverEdgeStatusPayload = {
  edge_id: string
  structure_id: string
  canvas_id: string
  session_id: string
  status: 'accepted' | 'rejected'
  connection_feedback?: ConnectionRejectionReason
  interacted_at: number
}

// POST /api/session/start
export type SessionStartPayload = {
  canvas_id: string
}

export type SessionStartResponse = {
  session_id: string
  // 1-indexed ordinal among every session this canvas has ever had — not a
  // persisted column on `sessions`, computed backend-side from
  // getSessionsByCanvas's existing oldest-first order (array position, or
  // priorSessions.length + 1 for a brand-new session). This endpoint is
  // idempotent per canvas: if one is already active, it's returned as-is
  // (same session_id + session_number) instead of creating a sibling — so
  // it's safe to call unconditionally, on both a fresh start and a resume.
  session_number: number
}

// POST /api/session/complete
// ⚠ carry_forward_ids is validated backend-side but currently ignored by the
// route/pipeline (FRONTEND-CONTRACT.md §5.4, §11.3) — don't build a "Carry
// Forward" screen expecting this to persist anything yet.
export type SessionCompletePayload = {
  session_id: string
  canvas_id: string
  carry_forward_ids: string[]
}
