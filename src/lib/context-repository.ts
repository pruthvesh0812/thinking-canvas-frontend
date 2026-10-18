import { logger } from "@/lib/logger"
import { createEntryRemote, updateEntryRemote } from "@/lib/context-repository-supabase"
import type { ComponentRemoval, ContextEntry, ContextLink } from "@/types"

// Persistence seam for context entries, links, sequence numbers and drafts.
//
// Two implementations behind one shape. Mock mode (NEXT_PUBLIC_USE_MOCK_PERSISTENCE)
// keeps everything in localStorage, one key per canvas. Real canvases write
// notes to Supabase (context-repository-supabase.ts) — slice by slice: only
// the methods overridden below are real so far; the rest log "not persisted"
// and resolve, so the in-memory store still behaves but a reload forgets them.
// Callers (use-context-notes.ts) never touch storage directly. Every write is
// async and may reject; callers keep the draft and offer Retry.

export interface ContextSnapshot {
  entries: ContextEntry[]
  links: ContextLink[]
  /** "Why remove this?" answers — stand-in for the component_removals table. */
  removals: ComponentRemoval[]
  /** Node id → sequence number. Never pruned: a number is never reused, and
   * an undone delete brings its node (same id) back to the same number. */
  seqByNode: Record<string, number>
  nextSeq: number
  /** Edge ids whose "Why do these connect?" item the user dismissed — not
   * asked again unless they open the edge's composer themselves. */
  dismissedEdgePrompts: string[]
}

// v2: rev-3 shapes (target_type / origin_status). Old v1 data is not read.
const PREFIX = "tc.context.v2."
const DRAFTS_PREFIX = "tc.context-drafts.v1."

function emptySnapshot(): ContextSnapshot {
  return { entries: [], links: [], removals: [], seqByNode: {}, nextSeq: 1, dismissedEdgePrompts: [] }
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback
  } catch (error) {
    logger.warn("[context-repo] read failed", { key, error: String(error) })
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  // Throws on quota/blocked storage — callers surface that as a failed save.
  window.localStorage.setItem(key, JSON.stringify(value))
}

function mutate(canvasId: string, fn: (s: ContextSnapshot) => void): Promise<void> {
  try {
    const snapshot = readJson(PREFIX + canvasId, emptySnapshot())
    fn(snapshot)
    writeJson(PREFIX + canvasId, snapshot)
    return Promise.resolve()
  } catch (error) {
    logger.error("[context-repo] write failed", { canvasId, error: String(error) })
    return Promise.reject(error)
  }
}

const localContextRepository = {
  storageKey: (canvasId: string) => PREFIX + canvasId,

  load(canvasId: string): ContextSnapshot {
    return readJson(PREFIX + canvasId, emptySnapshot())
  },

  insertEntry(canvasId: string, entry: ContextEntry, links: ContextLink[]) {
    return mutate(canvasId, (s) => {
      s.entries = [...s.entries.filter((e) => e.id !== entry.id), entry]
      s.links = [...s.links.filter((l) => l.entry_id !== entry.id), ...links]
    })
  },

  updateEntry(canvasId: string, entryId: string, patch: Partial<Pick<ContextEntry, "content" | "updated_at" | "deleted_at">>) {
    return mutate(canvasId, (s) => {
      s.entries = s.entries.map((e) => (e.id === entryId ? { ...e, ...patch } : e))
    })
  },

  /** Replaces every link of one entry — used by move and its undo. */
  setEntryLinks(canvasId: string, entryId: string, links: ContextLink[]) {
    return mutate(canvasId, (s) => {
      s.links = [...s.links.filter((l) => l.entry_id !== entryId), ...links]
    })
  },

  /** Component deleted (state 'deleted') or its delete undone ('active'). */
  setLinksStateForTargets(canvasId: string, targetIds: string[], state: ContextLink["state"]) {
    const ids = new Set(targetIds)
    return mutate(canvasId, (s) => {
      s.links = s.links.map((l) => (l.target_id && ids.has(l.target_id) ? { ...l, state } : l))
    })
  },

  insertComponentRemoval(canvasId: string, removal: ComponentRemoval) {
    return mutate(canvasId, (s) => {
      s.removals = [...s.removals, removal]
    })
  },

  saveSequence(canvasId: string, seqByNode: Record<string, number>, nextSeq: number) {
    return mutate(canvasId, (s) => {
      s.seqByNode = seqByNode
      s.nextSeq = nextSeq
    })
  },

  dismissEdgePrompt(canvasId: string, edgeId: string, dismissed: boolean) {
    return mutate(canvasId, (s) => {
      const rest = s.dismissedEdgePrompts.filter((id) => id !== edgeId)
      s.dismissedEdgePrompts = dismissed ? [...rest, edgeId] : rest
    })
  },

  // Drafts are synchronous and best-effort: they're written on every
  // keystroke and must survive a refresh or a dropped connection, which is
  // exactly what localStorage is good at (backend-requirements.md B10).
  loadDrafts(canvasId: string): Record<string, string> {
    return readJson<Record<string, string>>(DRAFTS_PREFIX + canvasId, {})
  },

  saveDrafts(canvasId: string, drafts: Record<string, string>) {
    try {
      writeJson(DRAFTS_PREFIX + canvasId, drafts)
    } catch (error) {
      logger.warn("[context-repo] draft write failed", { canvasId, error: String(error) })
    }
  },
}

const USE_MOCK_PERSISTENCE = process.env.NEXT_PUBLIC_USE_MOCK_PERSISTENCE === "true"

function notPersisted(what: string) {
  return () => {
    logger.warn(`[context-repo] ${what} is not persisted to Supabase yet`)
    return Promise.resolve()
  }
}

export type ContextRepository = typeof localContextRepository

export const contextRepository: ContextRepository = USE_MOCK_PERSISTENCE
  ? localContextRepository
  : {
      ...localContextRepository,
      insertEntry: (_canvasId, entry, links) => createEntryRemote(entry, links),
      updateEntry: (_canvasId, entryId, patch) =>
        updateEntryRemote(entryId, {
          ...(patch.content !== undefined && { content: patch.content }),
          ...(patch.deleted_at !== undefined && { deleted_at: patch.deleted_at }),
        }),
      setEntryLinks: notPersisted("moving a note (slice S07)"),
      setLinksStateForTargets: notPersisted("retiring links of a deleted node/edge (slice S08)"),
      insertComponentRemoval: notPersisted("the removal reason (slice S08)"),
      saveSequence: notPersisted("node numbering (assigned by the database)"),
    }
