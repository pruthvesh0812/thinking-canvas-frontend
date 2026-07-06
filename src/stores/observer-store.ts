import { create } from 'zustand'
import { logger } from '@/lib/logger'

// Observer structures + per-edge accept/reject state. Rejects BATCH — the
// pending structure stays visible while the user flags, tears down only when
// they finish (CORE-CONCEPTS.md → Observer Structure). Already-accepted nodes
// stay committed even if the rest of the structure is torn down.

export type EdgeFeedback =
  | 'not_related'
  | 'wrong_direction'
  | 'too_indirect'
  | 'already_obvious'

export type EdgeStatus = 'pending' | 'accepted' | 'rejected'

export type ObserverEdge = {
  id: string
  from_node_id: string
  to_node_id: string
  level: number
  status: EdgeStatus
  feedback?: EdgeFeedback
}

export type ObserverNode = {
  id: string
  content: string
  level: number
  anchor: boolean
  materialized: boolean
}

export type ObserverStructure = {
  id: string
  session_id: string
  nodes: ObserverNode[]
  edges: ObserverEdge[]
  flagging: boolean
}

type ObserverStore = {
  structures: Record<string, ObserverStructure>
  hoveredAnchorId: string | null

  setStructures(list: ObserverStructure[]): void
  setHovered(id: string | null): void
  acceptEdge(structureId: string, edgeId: string): void
  rejectEdge(structureId: string, edgeId: string, feedback: EdgeFeedback): void
  beginFlagging(structureId: string): void
  finishFlagging(structureId: string): void
  markNodeMaterialized(structureId: string, nodeId: string): void
  reset(): void
}

export const useObserverStore = create<ObserverStore>()((set, get) => ({
  structures: {},
  hoveredAnchorId: null,

  setStructures(list) {
    set({ structures: Object.fromEntries(list.map((s) => [s.id, s])) })
  },

  setHovered(id) {
    set({ hoveredAnchorId: id })
  },

  acceptEdge(structureId, edgeId) {
    const structure = get().structures[structureId]
    if (!structure) return
    set({
      structures: {
        ...get().structures,
        [structureId]: {
          ...structure,
          edges: structure.edges.map((e) =>
            e.id === edgeId ? { ...e, status: 'accepted' } : e,
          ),
        },
      },
    })
  },

  rejectEdge(structureId, edgeId, feedback) {
    const structure = get().structures[structureId]
    if (!structure) return
    logger.info('[store:observer] rejectEdge (batching)', { edgeId, feedback })
    set({
      structures: {
        ...get().structures,
        [structureId]: {
          ...structure,
          flagging: true,
          edges: structure.edges.map((e) =>
            e.id === edgeId ? { ...e, status: 'rejected', feedback } : e,
          ),
        },
      },
    })
  },

  beginFlagging(structureId) {
    const s = get().structures[structureId]
    if (!s) return
    set({ structures: { ...get().structures, [structureId]: { ...s, flagging: true } } })
  },

  finishFlagging(structureId) {
    const structure = get().structures[structureId]
    if (!structure) return
    // Tear down remaining pending edges + non-materialized nodes; already
    // accepted / materialized items stay.
    const acceptedEdges = structure.edges.filter((e) => e.status === 'accepted')
    const survivingNodeIds = new Set(
      structure.nodes.filter((n) => n.materialized || n.anchor).map((n) => n.id),
    )
    acceptedEdges.forEach((e) => {
      survivingNodeIds.add(e.from_node_id)
      survivingNodeIds.add(e.to_node_id)
    })
    set({
      structures: {
        ...get().structures,
        [structureId]: {
          ...structure,
          flagging: false,
          nodes: structure.nodes.filter((n) => survivingNodeIds.has(n.id)),
          edges: acceptedEdges,
        },
      },
    })
  },

  markNodeMaterialized(structureId, nodeId) {
    const structure = get().structures[structureId]
    if (!structure) return
    set({
      structures: {
        ...get().structures,
        [structureId]: {
          ...structure,
          nodes: structure.nodes.map((n) =>
            n.id === nodeId ? { ...n, materialized: true } : n,
          ),
        },
      },
    })
  },

  reset() {
    set({ structures: {}, hoveredAnchorId: null })
  },
}))
