// Canvas Templates — a SEPARATE, self-contained testing module (not wired into
// the main canvas). The backend returns a structured payload (hierarchy or
// sequence) and the frontend renders it as an interactive node layout.
//
// NOTE: these contract types are intentionally defined locally, NOT in the
// mirrored `types/index.ts`. The templates feature is a standalone experiment;
// its shapes are not part of the mirrored backend contract yet. Once this
// graduates into the main canvas, fold the response shapes into the mirror via
// `.ai/skills/sync-contract-types.md` and import them from `@/types` instead.

/** Which template the backend chose for a given answer. The frontend picks the
 * matching layout algorithm from this field alone — never from the parent
 * node's shape ("Jev picks the shape" is backend-side). */
export type TemplateShape = "hierarchy" | "sequence"

/** Hierarchy children carry a `kind` (drives node styling) and a `link` (the
 * associative edge label from root to this child, e.g. "because"). */
export type HierarchyKind = "idea" | "example" | "question"

export interface HierarchyChild {
  label: string
  detail: string
  kind: HierarchyKind
  /** Edge label at the root→child midpoint. */
  link: string
}

export interface HierarchyResponse {
  shape: "hierarchy"
  root: { label: string; detail: string }
  /** 2–4 children per the backend schema. */
  children: HierarchyChild[]
}

export interface SequenceStep {
  label: string
  detail: string
  /** Edge label to the NEXT step ("which triggers", …). The last step has
   * none. */
  transition?: string
}

export interface SequenceResponse {
  shape: "sequence"
  title: string
  detail: string
  /** 3–6 ordered steps per the backend schema. */
  steps: SequenceStep[]
}

/** Discriminated on `shape` — the layout algorithm is selected by this, so a
 * hierarchy node can expand into a sequence and vice versa. */
export type TemplateResponse = HierarchyResponse | SequenceResponse

export function isHierarchy(r: TemplateResponse): r is HierarchyResponse {
  return r.shape === "hierarchy"
}

export function isSequence(r: TemplateResponse): r is SequenceResponse {
  return r.shape === "sequence"
}

/** Request body for an expansion/query. A fresh chat-box query carries
 * `query`; an expand-this-node action carries `context` (the node's own
 * label + detail and its siblings' labels, per the backend API contract). */
export interface TemplateExpandRequest {
  query?: string
  context?: {
    label: string
    detail: string
    siblingLabels: string[]
  }
}

/** Role of a node within the template that created it. */
export type TemplateRole = "root" | "child" | "step" | "title"

/** A rendered template node. One flat model drives both shapes — `role` and
 * the shape-specific optionals (`kind`/`link` for hierarchy, `order`/
 * `transition` for sequence) carry the differences. Extends the index
 * signature React Flow's node `data` requires (same pattern as the main
 * canvas's `CanvasNodeData`). */
export interface TemplateNodeModel extends Record<string, unknown> {
  id: string
  shape: TemplateShape
  role: TemplateRole
  label: string
  detail: string
  kind?: HierarchyKind
  link?: string
  order?: number
  transition?: string

  // display state
  /** false after Accept — a committed node. */
  isGhost: boolean
  /** handle (label only) vs depth (label + detail) layer. */
  isDetailOpen: boolean
  position: { x: number; y: number }

  // relationships
  parentId: string | null
  childIds: string[]
}

/** Fixed handle ids every template node renders — edges name the two they
 * attach to so routing is deterministic (no reliance on React Flow's default
 * handle pick when a node carries several). */
export type TemplateHandle = "t" | "b" | "l" | "r"

export interface TemplateEdgeModel {
  id: string
  sourceId: string
  targetId: string
  sourceHandle: TemplateHandle
  targetHandle: TemplateHandle
  /** `link` (hierarchy) or `transition` (sequence) text. */
  label: string
  /** true for sequence edges (arrowhead), false for hierarchy (associative). */
  isDirected: boolean
  isGhost: boolean
}
