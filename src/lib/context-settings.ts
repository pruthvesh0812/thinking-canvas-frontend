// The bracketed defaults from the Text-Only Context Capture spec (§5) — the
// ONE place they live. The spec requires these be changeable without a
// release; until the backend serves them (backend-requirements.md B7) each
// can be overridden per deploy via NEXT_PUBLIC_CONTEXT_<KEY>.
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

// Below this width the composer docks above the keyboard, the canvas bar
// collapses to a strip, and the context panel opens as a full-width sheet
// (§5.1, §5.4, §5.5 small screens).
export const SMALL_SCREEN_QUERY = "(max-width: 640px)"
