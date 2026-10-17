# S09 — Settings from `system_config`

**Goal:** the numbers in the spec (max lines, 1000 chars, 10 s prompts…) come from the database so they change without a release.
**Why a slice:** one read at canvas load; the visible effect is easy to test by editing a row.
**Depends on:** S01 (best after S03, because of the note limit).

## What changes
- `loadSystemConfig()` reads `system_config` once on canvas load; env vars stay as fallback; defaults if the read fails.
- Keys: `context.composer_max_lines`, `context.canvas_bar_max_lines`, `context.hash_autocomplete_rows`, `context.note_max_chars`, `context.panel_note_collapsed_lines`, `context.removal_prompt_visible_ms`, `edge.clarification_delay_ms`, `edge.needs_you_max_visible` (JSON numbers).
- Re-key `context-settings.ts` to these names.
- The composer limit uses the same number the DB enforces.

## Test (for you)
Change `context.note_max_chars` (service role) → reload → composer counter and the DB limit both follow. Change `edge.needs_you_max_visible` → the panel follows. Remove a row → default applies.

## Done when
`tsc` + `lint` clean; checks pass.

## Rollback
Revert the commit.
