import { supabase } from "@/lib/supabase"
import type { ContextEntry, ContextLink, CreateContextEntryArgs } from "@/types"

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
