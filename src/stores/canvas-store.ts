import { create } from "zustand"
import type { EdgeType } from "@/types"
import { CURRENT_SESSION_NUMBER } from "@/lib/mock-sessions"

// The two human-drawable edge types (CORE-CONCEPTS.md) — a restriction of the
// backend's full EdgeType; `doubt`/`associative` are AI-drawn only and never
// offered on the pen rack.
export type HumanEdgeType = Extract<EdgeType, "logical" | "question">

export interface CanvasNodeData extends Record<string, unknown> {
  content: string
  owner: "human" | "ai"
  /** Persistent marker so an accepted-AI node stays identifiable forever
   * (CANVAS-RENDERING.md — "Accepted AI nodes ... keep a subtle persistent
   * marker"). Unset for human nodes. */
  aiMarker?: boolean
  /** The session a node was CREATED in. A node belongs to the canvas, not
   * the session (CORE-CONCEPTS.md) — this only drives historical
   * time-travel: viewing session N dims earlier nodes and hides later ones. */
  sessionNumber: number
  /** True once this node has a real Supabase row. A freshly-added node
   * (addNode) starts false and stays local-only until its first non-empty
   * content commit succeeds — never write an empty node to Supabase just
   * because it exists on the canvas (use-canvas-persistence.ts). */
  synced?: boolean
}

export interface CanvasNode {
  id: string
  position: { x: number; y: number }
  width: number
  /** Manual height (HumanNode's bottom-right corner resize). Undefined
   * means "auto-fit content" — the default; once the user drags the
   * corner it's set and the node stops shrinking below that value.
   * Not persisted to Supabase — render-only, like width. */
  height?: number
  data: CanvasNodeData
}

export interface CanvasEdge {
  id: string
  source: string
  target: string
  edgeType: HumanEdgeType
  sourceHandle?: string
  targetHandle?: string
  /** True once this edge has a real Supabase row. An edge drawn to/from a
   * node that isn't synced yet starts false and stays local-only until a
   * retry succeeds (use-canvas-persistence.ts — retryPendingEdges). */
  synced?: boolean
}

interface CanvasStore {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  highlightedNodeId: string | null
  updateNodePosition: (id: string, position: { x: number; y: number }) => void
  updateNodeContent: (id: string, content: string) => void
  /** Manual horizontal resize (HumanNode's left/right resize handles and
   * the bottom-right corner). Not persisted to Supabase — the nodes table
   * has no width column, this is render-only. */
  updateNodeWidth: (id: string, width: number) => void
  /** Manual vertical resize (bottom-right corner). Undefined restores
   * auto-fit. Not persisted to Supabase — render-only. */
  updateNodeHeight: (id: string, height: number | undefined) => void
  /** Combined width+height update from the corner handle — one store
   * write per drag frame instead of two. */
  updateNodeSize: (id: string, width: number, height: number) => void
  /** Flips data.synced true after a node's first successful Supabase write
   * (use-canvas-persistence.ts) — never set any other way. */
  markNodeSynced: (id: string) => void
  setHighlightedNode: (id: string | null) => void
  /** click-empty-canvas / "+ New node" — empty node in edit mode
   * (CANVAS-RENDERING.md Canvas Interactions). */
  addNode: (position: { x: number; y: number }) => CanvasNode
  /** User-drawn edge via the pen rack — type is picked before the drag, so
   * there is no post-hoc type popover (design's edge-creation model).
   * Returns the created edge (its client-generated id is what persistence
   * writes to Supabase), or undefined if source/target were already
   * connected (dedupe — nothing to persist). */
  addEdge: (
    source: string,
    target: string,
    edgeType: HumanEdgeType,
    sourceHandle?: string,
    targetHandle?: string,
  ) => CanvasEdge | undefined
  /** Rollback for a failed Supabase edge write (STATE-MANAGEMENT.md — the
   * store is optimistic, Supabase is authoritative). */
  removeEdge: (id: string) => void
  /** Flips data.synced true after an edge's first successful Supabase write
   * (use-canvas-persistence.ts) — never set any other way. */
  markEdgeSynced: (id: string) => void
  /** Deletes a node and cascades to any edge touching it (local only — the
   * hook decides whether/how to mirror this to Supabase). Only human-owned
   * nodes are ever passed here (CANVAS-RENDERING.md — "Delete: only
   * human-owned elements"). */
  removeNode: (id: string) => void
  /** Rollback for a failed Supabase node delete — re-adds the node, and
   * optionally the edges that were cascaded away with it. */
  restoreNode: (node: CanvasNode, edges?: CanvasEdge[]) => void
  /** Materializes an accepted ghost as a real owner:'ai' node + connecting
   * edge — the ghost→real ownership transfer (CORE-CONCEPTS.md). */
  addAiNode: (node: CanvasNode, edge: CanvasEdge) => void
  /** North-star capture (2b) pairs this with session-store.startNewCanvas —
   * a freshly created canvas starts blank, never with the seeded demo graph. */
  resetToEmpty: () => void
}

// Seeded retention canvas — mirrors the demo scenario in ThinkingCanvas.dc.html
// turn 1a exactly (same node text, positions, and edge shape) until
// canvas-dashboard/session-lifecycle land and canvases are loaded for real.
const SEED_NODES: CanvasNode[] = [
  { id: "n1", position: { x: 130, y: 110 }, width: 250, data: { content: "Retention drops sharply between day 9 and 11 — before that the curve looks healthy.", owner: "human", sessionNumber: 1 } },
  { id: "n2", position: { x: 170, y: 330 }, width: 260, data: { content: "Onboarding ends on day 7. After that, nothing is scheduled to bring people back.", owner: "human", sessionNumber: 2 } },
  { id: "n3", position: { x: 560, y: 170 }, width: 250, data: { content: "The drop is steepest for users who never invited a teammate.", owner: "human", sessionNumber: 1 } },
  { id: "n4", position: { x: 620, y: 400 }, width: 270, data: { content: "Do referral users survive week 2 better than organic signups?", owner: "human", sessionNumber: 3 } },
  { id: "n5", position: { x: 1010, y: 140 }, width: 240, data: { content: "Week-2 usage is almost entirely solo sessions — teams barely churn.", owner: "human", sessionNumber: 2 } },
  { id: "n6", position: { x: 1060, y: 380 }, width: 190, data: { content: "", owner: "human", sessionNumber: 3 } },
]

const SEED_EDGES: CanvasEdge[] = [
  { id: "e-n1-n2", source: "n1", target: "n2", edgeType: "logical" },
  { id: "e-n1-n3", source: "n1", target: "n3", edgeType: "logical" },
  { id: "e-n3-n5", source: "n3", target: "n5", edgeType: "logical" },
  { id: "e-n3-n4", source: "n3", target: "n4", edgeType: "question" },
  { id: "e-n5-n6", source: "n5", target: "n6", edgeType: "question" },
]

export const useCanvasStore = create<CanvasStore>()((set, get) => ({
  nodes: SEED_NODES,
  edges: SEED_EDGES,
  highlightedNodeId: null,
  updateNodePosition: (id, position) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, position } : n)),
    })),
  updateNodeContent: (id, content) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, content } } : n)),
    })),
  updateNodeWidth: (id, width) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, width } : n)),
    })),
  updateNodeHeight: (id, height) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, height } : n)),
    })),
  updateNodeSize: (id, width, height) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, width, height } : n)),
    })),
  markNodeSynced: (id) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, synced: true } } : n)),
    })),
  setHighlightedNode: (id) => set({ highlightedNodeId: id }),
  addNode: (position) => {
    const node: CanvasNode = {
      id: crypto.randomUUID(),
      position,
      width: 240,
      data: { content: "", owner: "human", sessionNumber: CURRENT_SESSION_NUMBER },
    }
    set((s) => ({ nodes: [...s.nodes, node] }))
    return node
  },
  addEdge: (source, target, edgeType, sourceHandle, targetHandle) => {
    if (get().edges.some((e) => e.source === source && e.target === target)) return undefined
    const edge: CanvasEdge = {
      id: crypto.randomUUID(),
      source,
      target,
      edgeType,
      ...(sourceHandle ? { sourceHandle } : {}),
      ...(targetHandle ? { targetHandle } : {}),
    }
    set((s) => ({ edges: [...s.edges, edge] }))
    return edge
  },
  removeEdge: (id) => set((s) => ({ edges: s.edges.filter((e) => e.id !== id) })),
  markEdgeSynced: (id) =>
    set((s) => ({ edges: s.edges.map((e) => (e.id === id ? { ...e, synced: true } : e)) })),
  removeNode: (id) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      highlightedNodeId: s.highlightedNodeId === id ? null : s.highlightedNodeId,
    })),
  restoreNode: (node, edges = []) =>
    set((s) => ({ nodes: [...s.nodes, node], edges: [...s.edges, ...edges] })),
  addAiNode: (node, edge) =>
    set((s) => ({ nodes: [...s.nodes, node], edges: [...s.edges, edge] })),
  resetToEmpty: () => set({ nodes: [], edges: [], highlightedNodeId: null }),
}))
