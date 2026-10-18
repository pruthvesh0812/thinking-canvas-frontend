// The bracketed defaults from the Text-Only Context Capture spec (§5) — the
// ONE place they live. The spec requires these be changeable without a
// release: real canvases read the global `system_config` table once on canvas
// load (applySystemConfig below); each default can also be overridden per
// deploy via NEXT_PUBLIC_CONTEXT_<KEY>, which is the fallback when the table
// is unreachable or a key is missing.
function num(envValue: string | undefined, fallback: number): number {
  const n = envValue ? Number(envValue) : NaN
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export const CONTEXT_SETTINGS = {
  composerMaxLines: num(process.env.NEXT_PUBLIC_CONTEXT_COMPOSER_MAX_LINES, 5),
  canvasBarMaxLines: num(process.env.NEXT_PUBLIC_CONTEXT_CANVAS_BAR_MAX_LINES, 5),
  hashAutocompleteRows: num(process.env.NEXT_PUBLIC_CONTEXT_HASH_ROWS, 5),
  noteMaxChars: num(process.env.NEXT_PUBLIC_CONTEXT_NOTE_MAX_CHARS, 1000),
  panelNoteCollapsedLines: num(process.env.NEXT_PUBLIC_CONTEXT_PANEL_COLLAPSED_LINES, 4),
  edgePromptDelayMs: num(process.env.NEXT_PUBLIC_CONTEXT_EDGE_PROMPT_DELAY_MS, 10_000),
  needsYouMaxVisible: num(process.env.NEXT_PUBLIC_CONTEXT_NEEDS_YOU_MAX, 3),
  removalPromptVisibleMs: num(process.env.NEXT_PUBLIC_CONTEXT_REMOVAL_PROMPT_MS, 10_000),
  // Not a spec number — how long "Saved to n2 · Undo" stays up.
  savedToastMs: 6000,
}

const DEFAULTS = { ...CONTEXT_SETTINGS }

// system_config key → CONTEXT_SETTINGS field. Values in the table are JSON
// numbers. `context.note_max_chars` is also what the database enforces.
const SYSTEM_CONFIG_KEYS: Record<string, keyof typeof CONTEXT_SETTINGS> = {
  "context.composer_max_lines": "composerMaxLines",
  "context.canvas_bar_max_lines": "canvasBarMaxLines",
  "context.hash_autocomplete_rows": "hashAutocompleteRows",
  "context.note_max_chars": "noteMaxChars",
  "context.panel_note_collapsed_lines": "panelNoteCollapsedLines",
  "context.removal_prompt_visible_ms": "removalPromptVisibleMs",
  "edge.clarification_delay_ms": "edgePromptDelayMs",
  "edge.needs_you_max_visible": "needsYouMaxVisible",
}

/** Applies rows read from `system_config` on top of the defaults (a missing or
 * malformed row leaves that setting at its default). Mutates CONTEXT_SETTINGS
 * in place — callers then bump the store's settingsVersion so mounted
 * components re-read. Keys we don't know are ignored. */
export function applySystemConfig(rows: { key: string; value: unknown }[]) {
  Object.assign(CONTEXT_SETTINGS, DEFAULTS)
  for (const row of rows) {
    const field = SYSTEM_CONFIG_KEYS[row.key]
    if (field && typeof row.value === "number" && Number.isFinite(row.value) && row.value > 0) {
      CONTEXT_SETTINGS[field] = row.value
    }
  }
}

// Below this width the composer docks above the keyboard, the canvas bar
// collapses to a strip, and the context panel opens as a full-width sheet
// (§5.1, §5.4, §5.5 small screens).
export const SMALL_SCREEN_QUERY = "(max-width: 640px)"
