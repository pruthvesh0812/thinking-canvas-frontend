import { create } from "zustand"
import type { ContextEntry, ContextLink, ContextTargetType } from "@/types"

/** A component that can hold focus (v1: nodes and edges — §4 "Component"). */
export interface FocusTarget {
  kind: "node" | "edge"
  id: string
}

export interface ComposerState {
  target: FocusTarget
  /** Where the note was aimed before a shortcut retargeted it — the chip's
   * "back" action returns here. null = came from the canvas context bar. */
  previous: FocusTarget | null | undefined
  /** Only the cursor-bearing openings (after node text, new edge, on
   * request, shortcut) take keyboard focus. Following focus on a click must
   * NOT steal the caret from whatever the user clicked into. */
  autoFocus: boolean
  /** Bumped on every (re)open so the composer re-runs its open effects
   * (scroll into view, focus) even when the target is unchanged. */
  openedAt: number
}

export interface BarState {
  /** `/all` is active: the bar's next save links to every node. */
  allMode: boolean
  /** Where `/all` came from, so Back/Esc returns the text there. */
  allPrevious: FocusTarget | null
  /** Set when a focused component was deleted while its composer held a
   * draft — the draft moved here, labelled (§7 "Target" edge case). */
  deletedFromLabel: string | null
}

export interface ContextToast {
  id: number
  message: string
  undo?: () => void
}

export interface RemovalPrompt {
  kind: "node" | "edge"
  ids: string[]
  label: string
  /** Flow coordinates of where the component was. */
  position: { x: number; y: number }
  shownAt: number
}

export type PanelTab = "notes" | "needs"

export interface PanelState {
  open: boolean
  tab: PanelTab
  /** "focus" follows the focused component (canvas notes when nothing is
   * focused); "canvas" pins the canvas notes until focus changes again. */
  view: "focus" | "canvas"
}

/** Draft key for a target. The canvas context bar's draft is "canvas". */
export function draftKey(target: FocusTarget | null): string {
  return target ? `${target.kind}:${target.id}` : "canvas"
}

interface ContextStore {
  /** Which canvas the data below belongs to (real canvas id or "mock"). */
  loadedFor: string | null
  entries: ContextEntry[]
  links: ContextLink[]
  seqByNode: Record<string, number>
  nextSeq: number
  dismissedEdgePrompts: string[]
  drafts: Record<string, string>

  focus: FocusTarget | null
  composer: ComposerState | null
  /** Screen-pixel size of the open composer box — drives "making room". */
  composerSize: { width: number; height: number } | null
  /** Display-only vertical offsets (flow px) for components moved out of the
   * composer's way. Never persisted — the saved layout never changes. */
  roomOffsets: Record<string, number>
  bar: BarState
  /** Incremented to ask the canvas bar to take keyboard focus. */
  barFocusRequest: number
  panel: PanelState
  toast: ContextToast | null
  /** One short, non-blocking message (e.g. "There's no node n9"). */
  notice: string | null
  /** Edges with an open "?" / "Needs you" item, oldest first. */
  edgePromptQueue: string[]
  /** Edges drawn in this browser session — the only ones that can earn a
   * "?" (pm_handoff.md PM-7: never flood an old canvas with prompts). */
  promptEligibleEdges: string[]
  removalPrompt: RemovalPrompt | null

  load: (
    canvasId: string,
    data: Pick<ContextStore, "entries" | "links" | "seqByNode" | "nextSeq" | "dismissedEdgePrompts" | "drafts">,
  ) => void
  setEntries: (entries: ContextEntry[], links: ContextLink[]) => void
  setSequence: (seqByNode: Record<string, number>, nextSeq: number) => void
  setDismissedEdgePrompts: (ids: string[]) => void
  setDraft: (key: string, text: string) => void
  setFocus: (focus: FocusTarget | null) => void
  setComposer: (composer: ComposerState | null) => void
  setComposerSize: (size: { width: number; height: number } | null) => void
  setRoomOffsets: (offsets: Record<string, number>) => void
  setBar: (bar: Partial<BarState>) => void
  requestBarFocus: () => void
  setPanel: (panel: Partial<PanelState>) => void
  showToast: (message: string, undo?: () => void) => void
  clearToast: (id?: number) => void
  setNotice: (notice: string | null) => void
  setEdgePromptQueue: (ids: string[]) => void
  markEdgePromptEligible: (id: string) => void
  setRemovalPrompt: (prompt: RemovalPrompt | null) => void
}

let toastSeq = 0

export const useContextStore = create<ContextStore>()((set) => ({
  loadedFor: null,
  entries: [],
  links: [],
  seqByNode: {},
  nextSeq: 1,
  dismissedEdgePrompts: [],
  drafts: {},
  focus: null,
  composer: null,
  composerSize: null,
  roomOffsets: {},
  bar: { allMode: false, allPrevious: null, deletedFromLabel: null },
  barFocusRequest: 0,
  panel: { open: false, tab: "notes", view: "focus" },
  toast: null,
  notice: null,
  edgePromptQueue: [],
  promptEligibleEdges: [],
  removalPrompt: null,

  load: (canvasId, data) =>
    set({
      loadedFor: canvasId,
      ...data,
      focus: null,
      composer: null,
      roomOffsets: {},
      edgePromptQueue: [],
      promptEligibleEdges: [],
      removalPrompt: null,
    }),
  setEntries: (entries, links) => set({ entries, links }),
  setSequence: (seqByNode, nextSeq) => set({ seqByNode, nextSeq }),
  setDismissedEdgePrompts: (ids) => set({ dismissedEdgePrompts: ids }),
  setDraft: (key, text) =>
    set((s) => {
      const drafts = { ...s.drafts }
      // Leaving a draft empty discards it silently (§5.5).
      if (text.trim()) drafts[key] = text
      else delete drafts[key]
      return { drafts }
    }),
  setFocus: (focus) =>
    set((s) => ({
      focus,
      // The panel follows focus — a pinned "canvas" view lasts only until
      // the user focuses something else.
      panel: s.panel.view === "canvas" && focus ? { ...s.panel, view: "focus" } : s.panel,
    })),
  setComposer: (composer) => set(composer ? { composer } : { composer, composerSize: null, roomOffsets: {} }),
  setComposerSize: (composerSize) => set({ composerSize }),
  setRoomOffsets: (roomOffsets) => set({ roomOffsets }),
  setBar: (bar) => set((s) => ({ bar: { ...s.bar, ...bar } })),
  requestBarFocus: () => set((s) => ({ barFocusRequest: s.barFocusRequest + 1 })),
  setPanel: (panel) => set((s) => ({ panel: { ...s.panel, ...panel } })),
  showToast: (message, undo) => set({ toast: { id: ++toastSeq, message, undo } }),
  clearToast: (id) => set((s) => (id === undefined || s.toast?.id === id ? { toast: null } : {})),
  setNotice: (notice) => set({ notice }),
  setEdgePromptQueue: (edgePromptQueue) => set({ edgePromptQueue }),
  markEdgePromptEligible: (id) => set((s) => ({ promptEligibleEdges: [...s.promptEligibleEdges, id] })),
  setRemovalPrompt: (removalPrompt) => set({ removalPrompt }),
}))

type NotesSlice = Pick<ContextStore, "entries" | "links">

/** Active notes on one target, newest first. Badge counts and the panel list
 * both come from here, so they always match (§8 "Counts"). */
export function notesFor(s: NotesSlice, kind: ContextTargetType, id: string | null): ContextEntry[] {
  const entryIds = new Set(
    s.links
      .filter((l) => l.state === "active" && l.target_type === kind && (kind === "canvas" || l.target_id === id))
      .map((l) => l.entry_id),
  )
  return s.entries
    .filter((e) => entryIds.has(e.id) && !e.deleted_at)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export function noteCount(s: NotesSlice, kind: ContextTargetType, id: string | null): number {
  return notesFor(s, kind, id).length
}

export function sameTarget(a: FocusTarget | null | undefined, b: FocusTarget | null | undefined): boolean {
  if (!a || !b) return a === b
  return a.kind === b.kind && a.id === b.id
}
