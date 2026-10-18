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

## What actually changed (built)
- `context-repository-supabase.ts`: `fetchSystemConfigRemote()` (`select key, value`).
- `context-settings.ts`: `applySystemConfig(rows)` maps the eight `context.*` / `edge.*` keys onto `CONTEXT_SETTINGS` (on top of the env/default values; unknown keys, non-numbers and values ≤ 0 are ignored, so a missing row means the default). The internal field names are unchanged — a key map connects them to the table names.
- `use-context-notes.ts`: on real canvases the lifecycle reads the table once per canvas load, applies it, and bumps `settingsVersion` in the context store; a failed read logs a warning and keeps defaults.
- `context-store.ts` + `ContextComposer` / `ContextPanel` / `CanvasContextBar`: subscribe to `settingsVersion` so values read while rendering update after the load.
- The composer limit and the database limit now follow the same row (`context.note_max_chars`).
- Not changed: a composer that is already open keeps its current textarea height until the next keystroke; timers already running keep their old delay.
- Checks run: `npx tsc --noEmit` and `npm run lint` — clean. Behaviour not tested (yours; `test.md` → Slice S09).
