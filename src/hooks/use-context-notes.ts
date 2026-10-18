import { useEffect } from "react"
import { useCanvasStore, type CanvasNode } from "@/stores/canvas-store"
import { useSessionStore } from "@/stores/session-store"
import { useCanvasUiStore } from "@/stores/canvas-ui-store"
import {
  draftKey,
  noteCount,
  sameTarget,
  useContextStore,
  type FocusTarget,
  type RemovalPrompt,
} from "@/stores/context-store"
import { contextRepository, type ContextLinkPatch } from "@/lib/context-repository"
import { fetchContextRemote } from "@/lib/context-repository-supabase"
import { CONTEXT_SETTINGS } from "@/lib/context-settings"
import { supabase } from "@/lib/supabase"
import { logger } from "@/lib/logger"
import type { ComponentRemoval, ContextEntry, ContextLink, ContextTargetType } from "@/types"

// Orchestration for Text-Only Context Capture: focus + composer rules,
// shortcuts, saving/editing/moving/deleting notes with one-step undo, edge
// "?" prompts and the "Why remove this?" record. Components render; this
// file decides. Everything is module-scope (like use-canvas-persistence's
// decideGhost) so timers and undo closures outlive any one component.

const USE_MOCK_PERSISTENCE = process.env.NEXT_PUBLIC_USE_MOCK_PERSISTENCE === "true"

let currentUserId: string | null = null

function canvasKey(): string {
  return useSessionStore.getState().canvasId ?? "mock"
}

function nowIso() {
  return new Date().toISOString()
}

// ─────────────────────────────────────────────
// Labels
// ─────────────────────────────────────────────

export function seqLabel(nodeId: string): string {
  const seq = useContextStore.getState().seqByNode[nodeId]
  return seq ? `n${seq}` : "n?"
}

function excerpt(text: string, max = 22): string {
  const first = (text.split("\n")[0] ?? "").trim()
  if (!first) return "Untitled"
  return first.length > max ? `${first.slice(0, max)}…` : first
}

/** Chip text: "n2 · Pricing" for a node, "n1 to n3" for an edge (§5.1). */
export function targetLabel(target: FocusTarget | null): string {
  if (!target) return "Canvas"
  const { nodes, edges } = useCanvasStore.getState()
  if (target.kind === "node") {
    const node = nodes.find((n) => n.id === target.id)
    return `${seqLabel(target.id)} · ${excerpt(node?.data.content ?? "")}`
  }
  const edge = edges.find((e) => e.id === target.id)
  if (!edge) return "Edge"
  return `${seqLabel(edge.source)} to ${seqLabel(edge.target)}`
}

/** Short form for toasts: "n2" / "n1 to n3". */
export function shortTargetLabel(target: FocusTarget | null): string {
  if (!target) return "canvas context"
  if (target.kind === "node") return seqLabel(target.id)
  return targetLabel(target)
}

function targetExists(target: FocusTarget): boolean {
  const { nodes, edges } = useCanvasStore.getState()
  return target.kind === "node" ? nodes.some((n) => n.id === target.id) : edges.some((e) => e.id === target.id)
}

// ─────────────────────────────────────────────
// Focus + composer (§5.2)
// ─────────────────────────────────────────────

export function openComposer(
  target: FocusTarget,
  opts: { autoFocus?: boolean; previous?: FocusTarget | null; } = {},
) {
  const s = useContextStore.getState()
  s.setFocus(target)
  s.setComposer({
    target,
    previous: opts.previous,
    autoFocus: opts.autoFocus ?? true,
    openedAt: Date.now(),
  })
  // Re-opening an edge's composer is the user "opening it" — a dismissed
  // "Why do these connect?" may ask again only through this path (§5.6).
  if (target.kind === "edge") removeEdgePrompt(target.id)
}

export function closeComposer() {
  useContextStore.getState().setComposer(null)
}

/** Click on a component. Focuses it; only if a composer is already open does
 * a composer follow (§5.2 "Following focus"), and that one never steals the
 * caret. With no composer open nothing on the canvas shifts. */
export function focusFromClick(target: FocusTarget) {
  const s = useContextStore.getState()
  if (sameTarget(s.focus, target)) return
  s.setFocus(target)
  if (s.composer && !sameTarget(s.composer.target, target)) {
    openComposer(target, { autoFocus: false })
  }
}

/** Typing inside a node focuses it, nothing more. */
export function focusFromTyping(nodeId: string) {
  const s = useContextStore.getState()
  if (s.focus?.kind === "node" && s.focus.id === nodeId) return
  focusFromClick({ kind: "node", id: nodeId })
}

/** A newly created node takes focus; creating the next node is one of the
 * ways to skip an open composer (§5.2 "Never a block"). */
export function focusFromCreateNode(nodeId: string) {
  closeComposer()
  useContextStore.getState().setFocus({ kind: "node", id: nodeId })
}

/** A new edge takes focus and its composer opens by itself at its middle. */
export function focusFromCreateEdge(edgeId: string) {
  useContextStore.getState().markEdgePromptEligible(edgeId)
  openComposer({ kind: "edge", id: edgeId }, { autoFocus: true })
}

/** Node text confirmed with Enter/Tab → composer opens with the caret in it. */
export function openComposerAfterNodeText(nodeId: string) {
  openComposer({ kind: "node", id: nodeId }, { autoFocus: true })
}

/** Click on empty canvas: nothing focused, composer closes, draft kept. */
export function clearFocus() {
  const s = useContextStore.getState()
  s.setFocus(null)
  closeComposer()
}

// ─────────────────────────────────────────────
// Shortcuts (§5.3) — only at the very start of a note
// ─────────────────────────────────────────────

export type Shortcut =
  | { type: "at"; seq: number; rest: string }
  | { type: "hash"; query: string; rest: string }
  | { type: "all"; rest: string }

/** `@n2` + space, `/all` + space — complete shortcuts that act immediately.
 * `#query` is returned while the caret is still inside the query so the
 * caller can show the autocomplete list. Anything else: plain text. */
export function parseShortcut(text: string, caret: number): Shortcut | null {
  const at = /^@n(\d+) /.exec(text)
  if (at) return { type: "at", seq: Number(at[1]), rest: text.slice(at[0].length) }
  const all = /^\/all /.exec(text)
  if (all) return { type: "all", rest: text.slice(all[0].length) }
  if (text.startsWith("#") && caret >= 1) {
    const query = text.slice(1, caret)
    if (!query.includes("\n")) return { type: "hash", query, rest: text.slice(caret).replace(/^ /, "") }
  }
  return null
}

/** `@n2` typed alone and confirmed with Enter. */
export function parseBareAt(text: string): number | null {
  const m = /^@n(\d+)$/.exec(text.trim())
  return m ? Number(m[1]) : null
}

export function findNodeBySeq(seq: number): CanvasNode | undefined {
  const { seqByNode } = useContextStore.getState()
  const id = Object.keys(seqByNode).find((k) => seqByNode[k] === seq)
  return id ? useCanvasStore.getState().nodes.find((n) => n.id === id) : undefined
}

export interface NodeMatch {
  id: string
  seq: number | undefined
  text: string
  notes: number
}

/** `#text` matches — nodes whose text contains the query, up to [5] rows,
 * same-text nodes listed separately (told apart by number). */
export function searchNodes(query: string, limit = CONTEXT_SETTINGS.hashAutocompleteRows): NodeMatch[] {
  const q = query.trim().toLowerCase()
  const s = useContextStore.getState()
  return useCanvasStore
    .getState()
    .nodes.filter((n) => !n.data.setAsideAt && (!q || n.data.content.toLowerCase().includes(q)))
    .slice(0, limit)
    .map((n) => ({ id: n.id, seq: s.seqByNode[n.id], text: n.data.content, notes: noteCount(s, "node", n.id) }))
}

/** Aims the note at a node (from `@n` or a `#` pick), moving any typed text
 * along with it. From the bar, the note is handed to the composer under that
 * node (§5.4). The view brings the node on screen via the composer's own
 * keep-in-view effect. Returns false (and says so) for an unknown number. */
export function aimAtNode(
  nodeId: string,
  rest: string,
  from: { kind: "composer"; target: FocusTarget } | { kind: "bar" },
) {
  const s = useContextStore.getState()
  const target: FocusTarget = { kind: "node", id: nodeId }
  const key = draftKey(target)
  const carried = [s.drafts[key] ?? "", rest].filter((t) => t.trim()).join(" ")
  if (from.kind === "composer") {
    s.setDraft(draftKey(from.target), "")
  } else {
    s.setDraft("canvas", "")
  }
  s.setDraft(key, carried)
  openComposer(target, {
    autoFocus: true,
    previous: from.kind === "composer" ? from.target : null,
  })
  markShortcutUsed()
}

export function aimAtSeq(
  seq: number,
  rest: string,
  from: { kind: "composer"; target: FocusTarget } | { kind: "bar" },
): boolean {
  const node = findNodeBySeq(seq)
  if (!node) {
    showNotice(`There's no node n${seq}. Nothing changed.`)
    return false
  }
  aimAtNode(node.id, rest, from)
  return true
}

/** Chip "back" / Backspace-in-empty / Esc after a shortcut: return the text
 * to where it was aimed before. */
export function composerBack() {
  const s = useContextStore.getState()
  const c = s.composer
  if (!c || c.previous === undefined) return
  const text = s.drafts[draftKey(c.target)] ?? ""
  s.setDraft(draftKey(c.target), "")
  if (c.previous === null) {
    s.setDraft("canvas", [s.drafts.canvas ?? "", text].filter(Boolean).join(" "))
    closeComposer()
    s.requestBarFocus()
    return
  }
  const prev = c.previous
  s.setDraft(draftKey(prev), [s.drafts[draftKey(prev)] ?? "", text].filter(Boolean).join(" "))
  if (targetExists(prev)) openComposer(prev, { autoFocus: true })
  else closeComposer()
}

/** `/all` — one note for every node, written in the canvas bar (§5.3). */
export function enterAllMode(rest: string, from: FocusTarget | null) {
  const s = useContextStore.getState()
  if (from) {
    s.setDraft(draftKey(from), "")
    closeComposer()
  }
  // From the bar, `rest` already is the bar's text; from a composer it is
  // that composer's text, joined onto anything the bar already held.
  s.setDraft("canvas", from ? [s.drafts.canvas ?? "", rest].filter((t) => t.trim()).join(" ") : rest)
  s.setBar({ allMode: true, allPrevious: from })
  s.requestBarFocus()
  markShortcutUsed()
}

/** Back/Esc on `/all`: nothing saved, text returns to the previous target. */
export function exitAllMode() {
  const s = useContextStore.getState()
  const prev = s.bar.allPrevious
  s.setBar({ allMode: false, allPrevious: null })
  if (prev && targetExists(prev)) {
    const text = s.drafts.canvas ?? ""
    s.setDraft("canvas", "")
    s.setDraft(draftKey(prev), text)
    openComposer(prev, { autoFocus: true })
  }
}

const SHORTCUT_HINT_KEY = "tc.context.shortcut-explained"
const BAR_INTRO_KEY = "tc.context.bar-intro-dismissed"

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}
function safeSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Best-effort UI preference only.
  }
}

export function shortcutExplained(): boolean {
  return safeGet(SHORTCUT_HINT_KEY) === "1"
}
function markShortcutUsed() {
  if (!shortcutExplained()) {
    showNotice("Shortcuts only work at the very start of a note: @n2 aims at node 2, #text finds a node, /all writes one note for every node.")
    safeSet(SHORTCUT_HINT_KEY, "1")
  }
}
export function barIntroDismissed(): boolean {
  return safeGet(BAR_INTRO_KEY) === "1"
}
export function dismissBarIntro() {
  safeSet(BAR_INTRO_KEY, "1")
}

let noticeTimer: ReturnType<typeof setTimeout> | null = null
export function showNotice(message: string) {
  useContextStore.getState().setNotice(message)
  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => useContextStore.getState().setNotice(null), 5000)
}

// ─────────────────────────────────────────────
// Notes — save / edit / move / delete, each undoable in one step (§5.5, §5.8)
// ─────────────────────────────────────────────

let toastTimer: ReturnType<typeof setTimeout> | null = null
function toast(message: string, undo?: () => void) {
  const s = useContextStore.getState()
  s.showToast(message, undo)
  const id = useContextStore.getState().toast?.id
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => useContextStore.getState().clearToast(id), CONTEXT_SETTINGS.savedToastMs)
}

// A question to the AI typed into the canvas bar gets a gentle reminder —
// never a block (§5.4).
export function looksLikeQuestion(text: string): boolean {
  const t = text.trim().toLowerCase()
  return (
    t.endsWith("?") ||
    /^(can|could|would|will) you\b/.test(t) ||
    /^(please|tell me|explain|help me|what do you think)\b/.test(t)
  )
}

export interface SaveResult {
  ok: boolean
  /** Text past the max length — kept in the draft as the next note (§5.5). */
  remainder: string
}

// A failed save keeps its ids: pressing Retry with the same text and targets
// re-sends the SAME entry/link ids, so if the first attempt actually reached
// the database, create_context_entry completes it instead of duplicating.
// Changing the text (or targets) starts a new note with new ids.
let lastAttempt: { key: string; entryId: string; linkIds: string[] } | null = null

/** Saves a typed note linked to one or more targets. Optimistic: the badge
 * goes up immediately; a failed write rolls back and the caller keeps the
 * draft and offers Retry (§8 "Failure"). */
export async function saveNote(
  text: string,
  links: { kind: ContextTargetType; id: string | null }[],
  savedLabel: string,
): Promise<SaveResult> {
  const trimmed = text.trim()
  if (!trimmed || links.length === 0) return { ok: true, remainder: "" }
  const max = CONTEXT_SETTINGS.noteMaxChars
  const content = trimmed.length > max ? trimmed.slice(0, max) : trimmed
  const remainder = trimmed.length > max ? trimmed.slice(max).trim() : ""

  const canvasId = canvasKey()
  const now = nowIso()
  const attemptKey = JSON.stringify([canvasId, content, links.map((l) => [l.kind, l.id])])
  const attempt =
    lastAttempt?.key === attemptKey
      ? lastAttempt
      : { key: attemptKey, entryId: crypto.randomUUID(), linkIds: links.map(() => crypto.randomUUID()) }
  lastAttempt = attempt
  const entry: ContextEntry = {
    id: attempt.entryId,
    canvas_id: canvasId,
    session_id: useSessionStore.getState().sessionId,
    content,
    source: "typed",
    author_id: currentUserId,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  }
  const linkRows: ContextLink[] = links.map((l, i) => ({
    id: attempt.linkIds[i],
    entry_id: entry.id,
    canvas_id: canvasId,
    target_type: l.kind,
    target_id: l.kind === "canvas" ? null : l.id,
    origin_status: "OWNED",
    state: "active",
    created_at: now,
    updated_at: now,
  }))

  const s = useContextStore.getState()
  s.setEntries([...s.entries, entry], [...s.links, ...linkRows])
  try {
    await contextRepository.insertEntry(canvasId, entry, linkRows)
  } catch (error) {
    const after = useContextStore.getState()
    after.setEntries(
      after.entries.filter((e) => e.id !== entry.id),
      after.links.filter((l) => l.entry_id !== entry.id),
    )
    // 23514 = the database refused the note itself (over the limit, blank, no
    // link) — its message says why. 42501 = RLS refused it: the canvas or
    // entry id isn't ours, which is a bug here, not something to retry.
    const { code, message } = error as { code?: string; message?: string }
    if (code === "42501") logger.error("[context] note save refused by RLS", { entryId: entry.id, canvasId, error })
    else logger.warn("[context] note save failed", { entryId: entry.id, code, message })
    showNotice(
      code === "23514" && message
        ? `Couldn't save the note: ${message}.`
        : "Couldn't save the note. Your text is still here — try again.",
    )
    return { ok: false, remainder }
  }
  lastAttempt = null
  logger.info("[context] note saved", { entryId: entry.id, links: links.length })

  const lengthNote = remainder ? ` — first ${max.toLocaleString()} characters; the rest is still in the box` : ""
  toast(`Saved to ${savedLabel}${lengthNote}`, () => void softDelete(entry.id))
  return { ok: true, remainder }
}

async function softDelete(entryId: string) {
  const s = useContextStore.getState()
  const at = nowIso()
  s.setEntries(
    s.entries.map((e) => (e.id === entryId ? { ...e, deleted_at: at } : e)),
    s.links,
  )
  try {
    await contextRepository.updateEntry(canvasKey(), entryId, { deleted_at: at })
  } catch {
    restoreLocal(entryId)
    showNotice("Couldn't remove the note. Try again.")
    return false
  }
  return true
}

function restoreLocal(entryId: string) {
  const s = useContextStore.getState()
  s.setEntries(
    s.entries.map((e) => (e.id === entryId ? { ...e, deleted_at: null } : e)),
    s.links,
  )
}

async function restoreNote(entryId: string) {
  restoreLocal(entryId)
  try {
    await contextRepository.updateEntry(canvasKey(), entryId, { deleted_at: null })
  } catch {
    showNotice("Couldn't restore the note. Try again.")
    return
  }
}

/** Panel "Delete" — gone for agents immediately; Undo restores (§7 Notes). */
export async function deleteNote(entryId: string) {
  if (await softDelete(entryId)) toast("Note deleted", () => void restoreNote(entryId))
}

/** Panel "Edit" — the edit stands; agents see only the latest version. */
export async function editNote(entryId: string, text: string): Promise<boolean> {
  const content = text.trim().slice(0, CONTEXT_SETTINGS.noteMaxChars)
  const s = useContextStore.getState()
  const before = s.entries.find((e) => e.id === entryId)
  if (!before || !content || content === before.content) return true
  // Attachment-only entries have no text (content is null); a text edit restores to "".
  const previous = before.content ?? ""
  const apply = async (value: string) => {
    const now = nowIso()
    const st = useContextStore.getState()
    st.setEntries(
      st.entries.map((e) => (e.id === entryId ? { ...e, content: value, updated_at: now } : e)),
      st.links,
    )
    await contextRepository.updateEntry(canvasKey(), entryId, { content: value, updated_at: now })
  }
  try {
    await apply(content)
  } catch (error) {
    await apply(previous).catch(() => {})
    // 23514 = the database refused the text itself (over the limit, blank).
    const { code, message } = error as { code?: string; message?: string }
    logger.warn("[context] note edit failed", { entryId, code, message })
    showNotice(
      code === "23514" && message ? `Couldn't save the edit: ${message}.` : "Couldn't save the edit. Try again.",
    )
    return false
  }
  toast("Note edited", () => {
    void apply(previous).catch(() => showNotice("Couldn't undo the edit."))
  })
  return true
}

/** Panel "Move to" — moves the link from the component being viewed to
 * another node by updating that ONE link in place (target + origin_status
 * 'MOVED'); one undo puts the old values back. A note linked to several
 * nodes (`/all`) only moves off the one being viewed (pm_handoff.md PM-9). If
 * the note is already on the destination, the moved link is marked deleted
 * instead — no duplicate, no error shown. */
export async function moveNote(entryId: string, from: { kind: ContextTargetType; id: string | null }, toNodeId: string) {
  const s = useContextStore.getState()
  const active = s.links.filter((l) => l.entry_id === entryId && l.state === "active")
  const link = active.find((l) => l.target_type === from.kind && (from.kind === "canvas" || l.target_id === from.id))
  if (!link || (link.target_type === "node" && link.target_id === toNodeId)) return

  const alreadyThere = active.some((l) => l.target_type === "node" && l.target_id === toNodeId)
  const moveTo: ContextLinkPatch = alreadyThere
    ? { state: "deleted" }
    : { target_type: "node", target_id: toNodeId, origin_status: "MOVED" }
  const back: ContextLinkPatch = {
    target_type: link.target_type,
    target_id: link.target_id,
    origin_status: link.origin_status,
    state: link.state,
  }

  const apply = async (patch: ContextLinkPatch) => {
    const st = useContextStore.getState()
    const at = nowIso()
    st.setEntries(st.entries, st.links.map((l) => (l.id === link.id ? { ...l, ...patch, updated_at: at } : l)))
    await contextRepository.updateLink(canvasKey(), link.id, patch)
  }
  try {
    try {
      await apply(moveTo)
    } catch (error) {
      // 23505: the database already has this entry active on the destination
      // (the store didn't know) — same outcome as alreadyThere.
      if ((error as { code?: string }).code !== "23505" || alreadyThere) throw error
      await apply({ state: "deleted" })
    }
  } catch (error) {
    logger.warn("[context] note move failed", { entryId, error })
    await apply(back).catch(() => {})
    showNotice("Couldn't move the note. Try again.")
    return
  }
  toast(`Moved to ${seqLabel(toNodeId)}`, () => {
    void apply(back).catch(() => showNotice("Couldn't undo the move."))
  })
}

// ─────────────────────────────────────────────
// Component deletion (§5.7) — called from use-canvas-persistence.ts
// ─────────────────────────────────────────────

/** A node/edge just left the canvas (optimistically — still undoable). A
 * draft open on it moves to the canvas bar, labelled, never lost; a short
 * "Why remove this?" prompt appears where it was. */
export function onComponentsRemoved(kind: "node" | "edge", ids: string[], label: string, position: { x: number; y: number } | null) {
  const s = useContextStore.getState()
  const removed = new Set(ids)
  const focusGone = s.focus && removed.has(s.focus.id)
  // Edges cascade with their nodes; any of them may hold the focus/draft.
  const cascaded = kind === "node"
    ? useCanvasStore.getState().edges.filter((e) => removed.has(e.source) || removed.has(e.target)).map((e) => e.id)
    : []
  const allGone = new Set([...ids, ...cascaded])

  for (const id of allGone) {
    for (const k of ["node", "edge"] as const) {
      const key = `${k}:${id}`
      const draft = useContextStore.getState().drafts[key]
      if (draft?.trim()) {
        const st = useContextStore.getState()
        st.setDraft("canvas", [st.drafts.canvas ?? "", draft].filter((t) => t.trim()).join("\n"))
        st.setDraft(key, "")
        st.setBar({ deletedFromLabel: k === "node" ? seqLabel(id) : "a deleted edge" })
      }
    }
  }
  if (focusGone || (s.composer && allGone.has(s.composer.target.id))) clearFocus()
  if (s.edgePromptQueue.some((id) => allGone.has(id))) {
    s.setEdgePromptQueue(s.edgePromptQueue.filter((id) => !allGone.has(id)))
  }
  if (position) {
    useContextStore.getState().setRemovalPrompt({ kind, ids, label, position, shownAt: Date.now() })
  }
}

// Links that onComponentsDeleteCommitted retired in the store, by target id —
// so a delete that FAILED (the node/edge comes back) can reactivate exactly
// those and nothing else (a link the user removed or moved stays removed).
const retiredByCommit = new Map<string, string[]>()

/** The delete was undone — or failed and the component came back: the
 * component, its number and its notes are back; the "Why remove this?" prompt
 * goes away. An undo inside the window never reached the database; after a
 * failed delete the links we retired locally are put back. */
export function onComponentsRestored(ids: string[]) {
  const s = useContextStore.getState()
  if (s.removalPrompt?.ids.some((id) => ids.includes(id))) s.setRemovalPrompt(null)
  const back = new Set(ids.flatMap((id) => retiredByCommit.get(id) ?? []))
  for (const id of ids) retiredByCommit.delete(id)
  if (back.size === 0) return
  s.setEntries(
    s.entries,
    s.links.map((l) => (back.has(l.id) ? { ...l, state: "active" } : l)),
  )
}

/** The delete's undo window elapsed: its notes go with it for good. On a real
 * canvas the database retires the links itself when the row is deleted (a
 * trigger) — here we only mirror that in the store. Mock mode persists it. */
export function onComponentsDeleteCommitted(ids: string[], cascadedEdgeIds: string[] = []) {
  void contextRepository.setLinksStateForTargets(canvasKey(), [...ids, ...cascadedEdgeIds], "deleted").catch(() => {})
  const s = useContextStore.getState()
  const gone = new Set([...ids, ...cascadedEdgeIds])
  for (const l of s.links) {
    if (l.state === "active" && l.target_id && gone.has(l.target_id)) {
      retiredByCommit.set(l.target_id, [...(retiredByCommit.get(l.target_id) ?? []), l.id])
    }
  }
  s.setEntries(
    s.entries,
    s.links.map((l) => (l.target_id && gone.has(l.target_id) ? { ...l, state: "deleted" } : l)),
  )
}

export function saveRemovalReason(prompt: RemovalPrompt, reason: string) {
  const text = reason.trim()
  useContextStore.getState().setRemovalPrompt(null)
  if (!text) return
  // Stored against the deleted component itself — never against a
  // component that still exists (§5.7).
  for (const id of prompt.ids) {
    const row: ComponentRemoval = {
      id: crypto.randomUUID(),
      canvas_id: canvasKey(),
      session_id: useSessionStore.getState().sessionId,
      component_type: prompt.kind,
      component_id: id,
      component_label: prompt.label,
      reason: text,
      created_by: currentUserId,
      created_at: nowIso(),
    }
    void contextRepository.insertComponentRemoval(canvasKey(), row).catch(() => {})
  }
  toast("Reason saved")
}

// ─────────────────────────────────────────────
// Edge "?" prompts (§5.6)
// ─────────────────────────────────────────────

const edgePromptTimers = new Map<string, ReturnType<typeof setTimeout>>()

function removeEdgePrompt(edgeId: string) {
  const s = useContextStore.getState()
  if (s.edgePromptQueue.includes(edgeId)) s.setEdgePromptQueue(s.edgePromptQueue.filter((id) => id !== edgeId))
  const t = edgePromptTimers.get(edgeId)
  if (t) {
    clearTimeout(t)
    edgePromptTimers.delete(edgeId)
  }
}

function edgeQualifies(edgeId: string): boolean {
  const s = useContextStore.getState()
  return (
    s.promptEligibleEdges.includes(edgeId) &&
    !s.dismissedEdgePrompts.includes(edgeId) &&
    !s.edgePromptQueue.includes(edgeId) &&
    noteCount(s, "edge", edgeId) === 0 &&
    useCanvasStore.getState().edges.some((e) => e.id === edgeId)
  )
}

function scheduleEdgePrompt(edgeId: string) {
  if (!edgeQualifies(edgeId) || edgePromptTimers.has(edgeId)) return
  edgePromptTimers.set(
    edgeId,
    setTimeout(() => {
      edgePromptTimers.delete(edgeId)
      const s = useContextStore.getState()
      // Still unexplained and the user is still elsewhere → ask, quietly.
      if (!edgeQualifies(edgeId) || (s.focus?.kind === "edge" && s.focus.id === edgeId)) return
      s.setEdgePromptQueue([...s.edgePromptQueue, edgeId])
    }, CONTEXT_SETTINGS.edgePromptDelayMs),
  )
}

export async function answerEdgePrompt(edgeId: string, text: string): Promise<boolean> {
  const result = await saveNote(text, [{ kind: "edge", id: edgeId }], targetLabel({ kind: "edge", id: edgeId }))
  if (!result.ok) return false
  removeEdgePrompt(edgeId)
  return true
}

/** Skipping is always allowed; a dismissed edge is not asked again. */
export function dismissEdgePrompt(edgeId: string) {
  removeEdgePrompt(edgeId)
  const s = useContextStore.getState()
  s.setDismissedEdgePrompts([...s.dismissedEdgePrompts, edgeId])
  void contextRepository.dismissEdgePrompt(canvasKey(), edgeId, true).catch(() => {})
}

/** Opens the right-hand panel on a tab, stepping the threads rail aside —
 * they share the right edge (§5.5). */
export function openPanel(tab: "notes" | "needs", view: "focus" | "canvas" = "focus") {
  useCanvasUiStore.getState().setThreadsRailOpen(false)
  useContextStore.getState().setPanel({ open: true, tab, view })
}

/** Badge click: opens the panel on that component's notes; clicking the
 * same badge again closes it (§5.5). */
export function toggleNotesFor(target: FocusTarget | null) {
  const s = useContextStore.getState()
  const showingThis =
    s.panel.open &&
    s.panel.tab === "notes" &&
    (target ? s.panel.view === "focus" && sameTarget(s.focus, target) : s.panel.view === "canvas" || !s.focus)
  if (showingThis) {
    s.setPanel({ open: false })
    return
  }
  if (target) {
    if (!sameTarget(s.focus, target)) focusFromClick(target)
    openPanel("notes", "focus")
  } else {
    openPanel("notes", "canvas")
  }
}

// ─────────────────────────────────────────────
// Mount-once hook: loading, sequence numbers, cross-tab sync, prompt timing
// ─────────────────────────────────────────────

/** Mounted once by Canvas. Loads this canvas's notes/drafts, assigns node
 * sequence numbers, keeps tabs in sync, and watches focus for edge "?"s. */
export function useContextLifecycle() {
  const canvasId = useSessionStore((s) => s.canvasId) ?? "mock"
  const nodes = useCanvasStore((s) => s.nodes)
  const loadedFor = useContextStore((s) => s.loadedFor)

  // 1. Load (and reload when another tab writes — the stand-in's version of
  //    §8 "Live updates"; the real one arrives over SSE, backend-requirements
  //    B11).
  useEffect(() => {
    function load() {
      const snap = contextRepository.load(canvasId)
      useContextStore.getState().load(canvasId, {
        // Real canvases: notes come from Supabase (fetched below), never from
        // whatever an earlier build left in localStorage.
        entries: USE_MOCK_PERSISTENCE ? snap.entries : [],
        links: USE_MOCK_PERSISTENCE ? snap.links : [],
        // Real canvases get node numbers from the database (CanvasNodeData.seq,
        // merged in effect 2 below); the stored map is mock-mode only.
        seqByNode: USE_MOCK_PERSISTENCE ? snap.seqByNode : {},
        nextSeq: USE_MOCK_PERSISTENCE ? snap.nextSeq : 1,
        dismissedEdgePrompts: snap.dismissedEdgePrompts,
        drafts: contextRepository.loadDrafts(canvasId),
      })
    }
    load()
    if (!USE_MOCK_PERSISTENCE && canvasId !== "mock") {
      void fetchContextRemote(canvasId)
        .then(({ entries, links }) => {
          const s = useContextStore.getState()
          if (s.loadedFor !== canvasId) return
          // Keep anything saved while the fetch was in flight.
          const haveE = new Set(entries.map((e) => e.id))
          const haveL = new Set(links.map((l) => l.id))
          s.setEntries(
            [...entries, ...s.entries.filter((e) => !haveE.has(e.id))],
            [...links, ...s.links.filter((l) => !haveL.has(l.id))],
          )
        })
        .catch((error) => {
          logger.error("[context] loading notes failed", { canvasId, error })
          showNotice("Couldn't load this canvas's notes. Reload to try again.")
        })
    }
    if (!USE_MOCK_PERSISTENCE) {
      void supabase.auth.getSession().then(({ data }) => {
        currentUserId = data.session?.user.id ?? null
      })
    }
    function onStorage(e: StorageEvent) {
      // Cross-tab sync through localStorage is the mock-mode stand-in only;
      // on real canvases notes live in Supabase.
      if (!USE_MOCK_PERSISTENCE || e.key !== contextRepository.storageKey(canvasId)) return
      const snap = contextRepository.load(canvasId)
      const s = useContextStore.getState()
      s.setEntries(snap.entries, snap.links)
      s.setSequence(snap.seqByNode, snap.nextSeq)
      s.setDismissedEdgePrompts(snap.dismissedEdgePrompts)
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [canvasId])

  // 2. Sequence numbers — unique per canvas, never reused.
  //    Real canvases: the database assigns them (nodes.seq); they arrive on
  //    CanvasNodeData.seq via hydration or the first write. This only merges
  //    them into seqByNode, never removing one — a deleted node keeps its
  //    number so "Draft from deleted n4" and an undone delete still read right.
  //    Mock mode: assigned here in creation order and kept in localStorage
  //    (nodes are appended in creation order and hydrated by created_at).
  useEffect(() => {
    if (loadedFor !== canvasId) return
    const s = useContextStore.getState()
    if (!USE_MOCK_PERSISTENCE) {
      let merged: Record<string, number> | null = null
      for (const n of nodes) {
        const seq = n.data.seq
        if (seq != null && s.seqByNode[n.id] !== seq) (merged ??= { ...s.seqByNode })[n.id] = seq
      }
      if (merged) s.setSequence(merged, s.nextSeq)
      return
    }
    let next = s.nextSeq
    let changed = false
    const seqByNode = { ...s.seqByNode }
    for (const n of nodes) {
      if (seqByNode[n.id] === undefined) {
        seqByNode[n.id] = next++
        changed = true
      }
    }
    if (!changed) return
    s.setSequence(seqByNode, next)
    void contextRepository.saveSequence(canvasId, seqByNode, next).catch(() => {})
  }, [nodes, loadedFor, canvasId])

  // 3. Drafts autosave on every change and survive a refresh (§5.5).
  useEffect(
    () =>
      useContextStore.subscribe((s, prev) => {
        if (s.drafts !== prev.drafts && s.loadedFor) contextRepository.saveDrafts(s.loadedFor, s.drafts)
      }),
    [],
  )

  // 4. Edge "?" — when focus moves off an unexplained new edge, start its
  //    timer; it only shows after the user has moved on (§5.6).
  useEffect(
    () =>
      useContextStore.subscribe((s, prev) => {
        if (s.focus === prev.focus) return
        if (prev.focus?.kind === "edge" && !sameTarget(prev.focus, s.focus)) scheduleEdgePrompt(prev.focus.id)
        if (s.focus?.kind === "edge") {
          const t = edgePromptTimers.get(s.focus.id)
          if (t) {
            clearTimeout(t)
            edgePromptTimers.delete(s.focus.id)
          }
        }
      }),
    [],
  )
}
