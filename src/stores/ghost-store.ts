import { create } from 'zustand'
import { logger } from '@/lib/logger'
import type { ContextNodeType, SpawnDescriptor } from '@/types'

// Pending ghost pairs keyed by trigger_node_id. Keying by trigger enforces the
// one-pair-per-real-node rule structurally — a new spawn for the same trigger
// simply overwrites the entry (CORE-CONCEPTS.md).

export type GhostPairState = {
  descriptor: SpawnDescriptor
  raw: string
  nodeType: ContextNodeType
  contextText: string
  questionText: string
  articulations?: string[]
  streamed: boolean
  meta?: { thread_id: string; turn_index: number } // pending Known Gap #1
}

type GhostStore = {
  pairs: Record<string, GhostPairState>

  spawn(descriptor: SpawnDescriptor): void
  appendChunk(ghostId: string, data: string): void
  markDone(): void
  resolve(triggerNodeId: string): void
  discardUnfinished(): void // called on SSE reconnect (Known Gap #6b)
  reset(): void
}

// ---- Marker grammar (see GHOST-STREAMING.md → Content Delivery) -------------
// [NODE_TYPE: reframe|mirror|pattern|reference|contradiction|appreciation]
// <context paragraph>
// [QUESTION]
// <question sentence>
//
// Articulator variant (no [QUESTION]):
// [NODE_TYPE: …]
// [ARTICULATION 1] … [ARTICULATION 2] … [ARTICULATION 3?]
//
// Rules:
//  1. Buffer, then parse — markers may split across chunk boundaries.
//  2. Never render a partial "[" bracket sequence as ghost text.

const NODE_TYPE_RE = /\[NODE_TYPE:\s*([a-zA-Z_]+)\]\s*/
const QUESTION_MARKER = '[QUESTION]'
const ARTICULATION_RE = /\[ARTICULATION\s*\d+\]/g

function stripPartialTrailingBracket(text: string): string {
  // Hold anything that could be the start of a marker until it resolves.
  const openIdx = text.lastIndexOf('[')
  if (openIdx === -1) return text
  if (text.indexOf(']', openIdx) !== -1) return text
  return text.slice(0, openIdx)
}

type Parsed = {
  nodeType: ContextNodeType | null
  contextText: string
  questionText: string
  articulations: string[] | undefined
}

export function parseGhostBuffer(
  raw: string,
  defaultNodeType: ContextNodeType,
): Parsed {
  let nodeType: ContextNodeType | null = null
  let rest = raw
  const m = NODE_TYPE_RE.exec(rest)
  if (m) {
    nodeType = m[1] as ContextNodeType
    rest = rest.slice(m.index + m[0].length)
  }

  if (ARTICULATION_RE.test(rest)) {
    ARTICULATION_RE.lastIndex = 0
    const parts = rest.split(ARTICULATION_RE).slice(1).map((s) => s.trim())
    return {
      nodeType: nodeType ?? defaultNodeType,
      contextText: '',
      questionText: '',
      articulations: parts.filter(Boolean),
    }
  }

  const qIdx = rest.indexOf(QUESTION_MARKER)
  if (qIdx === -1) {
    return {
      nodeType: nodeType ?? defaultNodeType,
      contextText: stripPartialTrailingBracket(rest).trim(),
      questionText: '',
      articulations: undefined,
    }
  }
  const context = rest.slice(0, qIdx)
  const question = rest.slice(qIdx + QUESTION_MARKER.length)
  return {
    nodeType: nodeType ?? defaultNodeType,
    contextText: context.trim(),
    questionText: stripPartialTrailingBracket(question).trim(),
    articulations: undefined,
  }
}

export const useGhostStore = create<GhostStore>()((set, get) => ({
  pairs: {},

  spawn(descriptor) {
    logger.info('[store:ghost] spawn', {
      trigger_node_id: descriptor.trigger_node_id,
      context_ghost_id: descriptor.context_node.ghost_id,
    })
    set((s) => ({
      pairs: {
        ...s.pairs,
        [descriptor.trigger_node_id]: {
          descriptor,
          raw: '',
          nodeType: descriptor.context_node.node_type,
          contextText: '',
          questionText: '',
          articulations: undefined,
          streamed: false,
        },
      },
    }))
  },

  appendChunk(ghostId, data) {
    const pairs = get().pairs
    // Every chunk targets the context ghost id — find the pair by that id.
    const entry = Object.entries(pairs).find(
      ([, p]) => p.descriptor.context_node.ghost_id === ghostId,
    )
    if (!entry) {
      logger.warn('[store:ghost] chunk for unknown ghost id (dropped)', { ghostId })
      return
    }
    const [triggerId, pair] = entry
    const raw = pair.raw + data
    const parsed = parseGhostBuffer(raw, pair.descriptor.context_node.node_type)
    set((s) => ({
      pairs: {
        ...s.pairs,
        [triggerId]: {
          ...pair,
          raw,
          nodeType: parsed.nodeType ?? pair.nodeType,
          contextText: parsed.contextText,
          questionText: parsed.questionText,
          articulations: parsed.articulations,
        },
      },
    }))
  },

  markDone() {
    set((s) => ({
      pairs: Object.fromEntries(
        Object.entries(s.pairs).map(([k, p]) => [k, p.streamed ? p : { ...p, streamed: true }]),
      ),
    }))
  },

  resolve(triggerNodeId) {
    set((s) => {
      const rest = { ...s.pairs }
      delete rest[triggerNodeId]
      return { pairs: rest }
    })
  },

  discardUnfinished() {
    set((s) => ({
      pairs: Object.fromEntries(
        Object.entries(s.pairs).filter(([, p]) => p.streamed),
      ),
    }))
  },

  reset() {
    set({ pairs: {} })
  },
}))
