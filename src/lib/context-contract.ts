// PROVISIONAL contract types for Text-Only Context Capture.
//
// CLAUDE.md non-negotiable #7 says contract types are mirrored from the
// backend's types/index.ts, never defined locally. The backend has not
// defined these yet (blocker.md BL-1), so they live here — isolated, named
// exactly as proposed in .ai/features/text-context-capture/
// backend-requirements.md (B1/B2) — and get DELETED in favour of the mirror
// once sync-contract-types.md brings the real ones over. Do not import these
// from anywhere except the context store/repository/components.

export type ContextSource = "typed" | "spoken" | "attachment"

/** Where a context entry points. `canvas` = background ("Canvas context"). */
export type ContextTargetKind = "canvas" | "node" | "edge"

export type ContextLinkOrigin = "user_chosen" | "user_moved" | "shortcut"

export type ContextLinkState = "active" | "deleted"

export interface ContextEntry {
  id: string
  canvas_id: string
  session_id: string | null
  content: string
  source: ContextSource
  author_id: string | null
  created_at: string
  updated_at: string
  /** Soft delete — undo clears it. Agents never see a row with this set. */
  deleted_at: string | null
}

export interface ContextLink {
  id: string
  entry_id: string
  target_kind: ContextTargetKind
  /** null ⇔ target_kind === "canvas". */
  target_id: string | null
  origin: ContextLinkOrigin
  state: ContextLinkState
  created_at: string
}

export type ContextDecisionAction =
  | "note.created"
  | "note.edited"
  | "note.moved"
  | "note.deleted"
  | "note.restored"
  | "edge_prompt.answered"
  | "edge_prompt.dismissed"
  | "component.removal_reason"

export interface ContextDecision {
  id: string
  canvas_id: string
  action: ContextDecisionAction
  entry_id: string | null
  target_kind: ContextTargetKind | null
  target_id: string | null
  payload: Record<string, unknown>
  created_at: string
}
