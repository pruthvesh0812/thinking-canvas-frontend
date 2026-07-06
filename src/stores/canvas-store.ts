import { create } from 'zustand'
import type { Edge, Node } from '@xyflow/react'
import { logger } from '@/lib/logger'

// Owns the REAL graph — React Flow-shaped nodes/edges the human sees as
// permanent. Deliberately does NOT contain: ghost pairs (ghost-store),
// session meta (session-store).

export type HumanNodeData = {
  content: string
  owner: 'human' | 'ai'
}

export type CanvasNode = Node<HumanNodeData>
export type CanvasEdge = Edge

type CanvasStore = {
  nodes: CanvasNode[]
  edges: CanvasEdge[]

  setGraph(nodes: CanvasNode[], edges: CanvasEdge[]): void
  addNode(node: CanvasNode): void
  updateNodeContent(id: string, content: string): void
  updateNodePosition(id: string, position: { x: number; y: number }): void
  removeNode(id: string): void
  addEdge(edge: CanvasEdge): void
  removeEdge(id: string): void
}

export const useCanvasStore = create<CanvasStore>()((set) => ({
  nodes: [],
  edges: [],

  setGraph(nodes, edges) {
    set({ nodes, edges })
  },

  addNode(node) {
    set((s) => ({ nodes: [...s.nodes, node] }))
  },

  updateNodeContent(id, content) {
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, content } } : n,
      ),
    }))
  },

  updateNodePosition(id, position) {
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, position } : n)),
    }))
  },

  removeNode(id) {
    logger.info('[store:canvas] removeNode', { id })
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
    }))
  },

  addEdge(edge) {
    set((s) => ({ edges: [...s.edges, edge] }))
  },

  removeEdge(id) {
    set((s) => ({ edges: s.edges.filter((e) => e.id !== id) }))
  },
}))
