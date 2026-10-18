import { supabase } from "@/lib/supabase"
import type { ComponentRemoval, ContextEntry, ContextLink, CreateContextEntryArgs } from "@/types"

// Supabase side of the context repository (real canvases). Writes go straight
// to Supabase over the anon key (RLS = canvas owner); there is NO canvas-event
// notify for context. The one atomic note write is the create_context_entry
// Postgres function — entry + its links in one call, idempotent on the
// client-generated ids (a retry with the same ids completes a half-finished
// write and never duplicates).

/** Throws the PostgREST error as-is, so callers can read `.code` / `.message`. */
export async function createEntryRemote(entry: ContextEntry, links: ContextLink[]): Promise<void> {
  const args: CreateContextEntryArgs = {
    p_entry: {
      id: entry.id,
      canvas_id: entry.canvas_id,
      session_id: entry.session_id,
      source: entry.source,
      content: entry.content,
    },
    p_links: links.map((l) => ({
      id: l.id,
      target_type: l.target_type,
      // A canvas note has no target_id (the function requires it null/absent).
      ...(l.target_id ? { target_id: l.target_id } : {}),
      origin_status: l.origin_status,
    })),
  }
  // author_id and the timestamps are deliberately not sent — the database
  // defaults them.
  const { error } = await supabase.rpc("create_context_entry", args)
  if (error) throw error
}

/** Edit a note's text, or delete / restore it. Deleting is ONLY entries.deleted_at
 * (and undo clears it) — a note's links are never touched by a user delete.
 * `updated_at` is bumped by the database. Throws the PostgREST error as-is
 * (23514 = text over the limit or blank). */
export async function updateEntryRemote(
  entryId: string,
  patch: { content?: string | null; deleted_at?: string | null },
): Promise<void> {
  const { data, error } = await supabase.from("context_entries").update(patch).eq("id", entryId).select("id")
  if (error) throw error
  // An UPDATE that RLS hides doesn't error — it changes 0 rows. Treat that as
  // a failed write so the caller rolls back instead of showing a lie.
  if (!data?.length) throw new Error("update changed no rows")
}

/** Move a note (or undo the move), or mark a link deleted: update ONE link in
 * place — never delete and re-insert. A move sets target_type/target_id and
 * origin_status='MOVED'; moving onto a target the entry already has trips the
 * one-active-link-per-target index (23505) — the caller then marks the moved
 * link deleted instead. Throws the PostgREST error as-is. */
export async function updateLinkRemote(
  linkId: string,
  patch: Partial<Pick<ContextLink, "target_type" | "target_id" | "origin_status" | "state">>,
): Promise<void> {
  const { data, error } = await supabase.from("context_links").update(patch).eq("id", linkId).select("id")
  if (error) throw error
  if (!data?.length) throw new Error("update changed no rows")
}

/** "Why remove this?" — insert-only, stored against the DELETED component's type
 * and id (no FK: it no longer exists) with a snapshot label. created_by and
 * created_at are defaulted by the database. */
export async function insertComponentRemovalRemote(removal: ComponentRemoval): Promise<void> {
  const { error } = await supabase.from("component_removals").insert({
    id: removal.id,
    canvas_id: removal.canvas_id,
    session_id: removal.session_id,
    component_type: removal.component_type,
    component_id: removal.component_id,
    // The table caps these (label ≤ 500, reason 1–1000).
    component_label: removal.component_label.slice(0, 500),
    reason: removal.reason.slice(0, 1000),
  })
  if (error) throw error
}

/** The global tunables (read-only for clients). */
export async function fetchSystemConfigRemote(): Promise<{ key: string; value: unknown }[]> {
  const { data, error } = await supabase.from("system_config").select("key, value")
  if (error) throw error
  return data ?? []
}

// PostgREST returns at most 1000 rows per request — page until a short page.
const PAGE = 1000

async function pageAll<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: Error | null }>,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGE) return rows
  }
}

/** A note is visible only through an ACTIVE link and only while its entry has
 * deleted_at = null — so load both flat (links carry canvas_id, no join
 * needed) and keep just the links whose entry is live. */
export async function fetchContextRemote(canvasId: string): Promise<{ entries: ContextEntry[]; links: ContextLink[] }> {
  const [entries, links] = await Promise.all([
    pageAll<ContextEntry>((a, b) =>
      supabase
        .from("context_entries")
        .select("*")
        .eq("canvas_id", canvasId)
        .is("deleted_at", null)
        .order("created_at")
        .order("id")
        .range(a, b),
    ),
    pageAll<ContextLink>((a, b) =>
      supabase
        .from("context_links")
        .select("*")
        .eq("canvas_id", canvasId)
        .eq("state", "active")
        .order("created_at")
        .order("id")
        .range(a, b),
    ),
  ])
  const live = new Set(entries.map((e) => e.id))
  return { entries, links: links.filter((l) => live.has(l.entry_id)) }
}
