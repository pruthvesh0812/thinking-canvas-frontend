import { create } from "zustand"
import { logger } from "@/lib/logger"
import { layoutTemplate } from "@/lib/template-layout"
import type { TemplateEdgeModel, TemplateNodeModel, TemplateResponse } from "@/lib/template-types"

// State for the standalone templates module. One store per concern, same as
// the main canvas (STATE-MANAGEMENT.md) — but entirely separate from
// canvas-store so this experiment can't disturb the real graph.
//
// Nodes are held as a Record keyed by id (the templates doc sketches a Map;
// a plain Record keeps Zustand updates and selectors straightforward while
// giving the same O(1) by-id access). Edges stay an array.

interface TemplateStore {
  nodes: Record<string, TemplateNodeModel>
  edges: TemplateEdgeModel[]
  /** A query/expansion is in flight. */
  isLoading: boolean
  /** The committed node currently expanding (pulses its border); null when a
   * fresh chat-box query is loading instead. */
  loadingNodeId: string | null
  /** Ids of the most recent fresh expansion — drives the "Accept all /
   * Dismiss all" toolbar while every one of them is still a ghost. */
  lastBatchIds: string[]
  /** aria-live announcement for screen readers (e.g. "3 new ideas added"). */
  announcement: string

  startQueryLoad: () => void
  startExpandLoad: (nodeId: string) => void
  failLoad: () => void
  /** Insert a laid-out response as ghosts. `origin` is the viewport center for
   * a fresh query; for an expansion pass the parent id and origin is derived
   * from it. */
  addTemplate: (response: TemplateResponse, origin: { x: number; y: number }, parentId?: string | null) => void

  toggleDetail: (id: string) => void
  updateNodePosition: (id: string, position: { x: number; y: number }) => void

  acceptNode: (id: string) => void
  dismissNode: (id: string) => void
  acceptAll: (ids: string[]) => void
  dismissAll: (ids: string[]) => void

  reset: () => void
}

// How far below a parent an expansion's root/title lands.
const EXPAND_DROP_Y = 240

function countLabel(response: TemplateResponse): string {
  if (response.shape === "hierarchy") {
    const n = response.children.length
    return `${n} new ${n === 1 ? "idea" : "ideas"} added`
  }
  const n = response.steps.length
  return `${n} new ${n === 1 ? "step" : "steps"} added`
}

export const useTemplateStore = create<TemplateStore>()((set, get) => ({
  nodes: {},
  edges: [],
  isLoading: false,
  loadingNodeId: null,
  lastBatchIds: [],
  announcement: "",

  startQueryLoad: () => set({ isLoading: true, loadingNodeId: null }),
  startExpandLoad: (nodeId) => set({ isLoading: true, loadingNodeId: nodeId }),
  failLoad: () => set({ isLoading: false, loadingNodeId: null }),

  addTemplate: (response, origin, parentId = null) => {
    // An expansion drops below its parent; a fresh query lands at `origin`.
    const parent = parentId ? get().nodes[parentId] : null
    const anchor = parent ? { x: parent.position.x, y: parent.position.y + EXPAND_DROP_Y } : origin

    const { nodes: laidOut, edges: laidOutEdges, rootId } = layoutTemplate(response, anchor, parentId)

    set((s) => {
      const nextNodes = { ...s.nodes }
      for (const n of laidOut) nextNodes[n.id] = n
      // Wire the expansion's root/title under its parent (committed → ghost),
      // matching the child structure's directionality.
      let nextEdges = [...s.edges, ...laidOutEdges]
      if (parent) {
        nextNodes[parent.id] = { ...parent, childIds: [...parent.childIds, rootId] }
        nextEdges = [
          ...nextEdges,
          {
            id: crypto.randomUUID(),
            sourceId: parent.id,
            targetId: rootId,
            sourceHandle: "b",
            targetHandle: "t",
            label: "",
            isDirected: response.shape === "sequence",
            isGhost: true,
          },
        ]
      }
      return {
        nodes: nextNodes,
        edges: nextEdges,
        isLoading: false,
        loadingNodeId: null,
        lastBatchIds: laidOut.map((n) => n.id),
        announcement: countLabel(response),
      }
    })
    logger.info("[template] rendered", { shape: response.shape, count: laidOut.length, expanded: !!parent })
  },

  toggleDetail: (id) =>
    set((s) => {
      const node = s.nodes[id]
      if (!node) return s
      // Multiple details may stay open at once (templates doc) — this toggles
      // only the clicked node.
      return { nodes: { ...s.nodes, [id]: { ...node, isDetailOpen: !node.isDetailOpen } } }
    }),

  updateNodePosition: (id, position) =>
    set((s) => {
      const node = s.nodes[id]
      if (!node) return s
      return { nodes: { ...s.nodes, [id]: { ...node, position } } }
    }),

  acceptNode: (id) =>
    set((s) => {
      const node = s.nodes[id]
      if (!node) return s
      // Committing a node also commits any ghost edge wholly between committed
      // nodes — an edge commits with its node (templates doc). We flip the
      // node, then settle edges whose both endpoints are now committed.
      const nodes = { ...s.nodes, [id]: { ...node, isGhost: false } }
      const edges = s.edges.map((e) =>
        e.isGhost && !nodes[e.sourceId]?.isGhost && !nodes[e.targetId]?.isGhost ? { ...e, isGhost: false } : e,
      )
      logger.info("[template] node accepted", { id, role: node.role })
      return { nodes, edges }
    }),

  dismissNode: (id) =>
    set((s) => {
      if (!s.nodes[id]) return s
      const nodes = { ...s.nodes }
      delete nodes[id]
      // A dismissed ghost takes its touching ghost edges with it (ghost edges
      // commit or disappear with their node). A committed edge is never
      // touched here — a ghost can't sit between two committed nodes.
      const edges = s.edges.filter((e) => e.sourceId !== id && e.targetId !== id)
      logger.info("[template] node dismissed", { id })
      return { nodes, edges }
    }),

  acceptAll: (ids) =>
    set((s) => {
      const nodes = { ...s.nodes }
      for (const id of ids) if (nodes[id]) nodes[id] = { ...nodes[id], isGhost: false }
      const edges = s.edges.map((e) =>
        e.isGhost && !nodes[e.sourceId]?.isGhost && !nodes[e.targetId]?.isGhost ? { ...e, isGhost: false } : e,
      )
      logger.info("[template] batch accepted", { count: ids.length })
      return { nodes, edges, lastBatchIds: [] }
    }),

  dismissAll: (ids) =>
    set((s) => {
      const drop = new Set(ids)
      const nodes = { ...s.nodes }
      for (const id of ids) delete nodes[id]
      const edges = s.edges.filter((e) => !drop.has(e.sourceId) && !drop.has(e.targetId))
      logger.info("[template] batch dismissed", { count: ids.length })
      return { nodes, edges, lastBatchIds: [] }
    }),

  reset: () => set({ nodes: {}, edges: [], isLoading: false, loadingNodeId: null, lastBatchIds: [], announcement: "" }),
}))
