# Blockers — Text-Only Context Capture

Feature tracker: `.ai/features/text-context-capture/story.md`
Backend asks in detail: `.ai/features/text-context-capture/backend-requirements.md`

The frontend v1 is built and usable **without** these, on a local stand-in
(browser `localStorage`, per canvas). Each blocker says what is stubbed today and
what unblocks it.

| ID | Blocker | Owner | Stubbed today as | Unblocked by |
|---|---|---|---|---|
| BL-1 | **No context tables.** No `context_entries` / `context_links` in the DB, so notes don't reach Supabase, other devices, or agents. | Backend | `src/lib/context-repository.ts` writes to `localStorage` (`tc.context.v1.<canvasId>`). Notes survive refresh on the same browser only. | B1 + B2 migrations + RLS. Then swap the repository internals (one file). |
| BL-2 | **No notify / API contract for notes.** Unknown whether notes are written direct-to-Supabase + `canvas-event` notify (our write-then-notify rule) or via new `/api/context` routes. | Backend + FE | Nothing is sent to the backend at all. | Decision on B6; then mirror the new `CanvasEvent` members. |
| BL-3 | **Sequence numbers are client-assigned.** Spec puts this on the backend ("unique on a canvas, never reused, arrive with node data"). Today two browsers/devices on the same canvas can show different numbers, and clearing site data renumbers. | Backend | `useContextLifecycle` assigns `n1…` in creation order and stores the map in `localStorage`. | `nodes.seq` + per-canvas counter (B3) and returning it in the hydration select. |
| BL-4 | **Contract types can't be mirrored.** CLAUDE.md rule 7 forbids local contract types, but the backend hasn't defined them. | Backend | `src/lib/context-contract.ts`, clearly marked PROVISIONAL, imported only by the context feature. | Backend adds the types to its `types/index.ts`; run sync-contract-types.md; delete the provisional file. |
| BL-5 | **Settings "changeable without a release".** | Backend | `src/lib/context-settings.ts` — all bracketed numbers in one place, each overridable by a `NEXT_PUBLIC_CONTEXT_*` env var (still needs a redeploy). | Settings endpoint / table (B7). |
| BL-6 | **"Needs you" panel doesn't exist** in this codebase (spec calls it "existing"). The only right-hand surface was the Threads rail. | PM / Design | Built a new right-hand panel with two tabs: **Notes** and **Needs you**. The Threads rail is untouched; opening one closes the other. | Design confirmation (PM-1). |
| BL-7 | **No edge labels.** Spec: "the user may also type a short label on the edge itself" and the "?" rule is "no label and no note". There is no `edges.label` column and no label UI. | Backend + FE | Edge labels not built; the "?" rule uses "no note" only. | `edges.label` column (B13), then a small inline label editor on the edge. |
| BL-8 | **Live updates across devices.** Supabase Realtime is prohibited (non-negotiable #2). | Backend | Other *tabs* in the same browser sync via the `storage` event. Other devices don't. | New SSE message (B11) on the existing stream. |
| BL-9 | **Agents don't see notes.** §5.8 (agents use notes like voice; canvas notes feed the rolling summary; deleted notes never used) is entirely backend. | Backend | — | B12. |
| BL-10 | **Voice mode isn't in this repo.** §5.9 needs a shared focus model and one list of typed + spoken entries. | Voice team | Focus lives in `src/stores/context-store.ts` (`focus`), and the panel already renders `source: 'spoken'` entries — voice can plug into both. | Voice-mode doc + integration; agree the focus-event list (§8 shared contract). |
| BL-11 | **Author display.** Only "You" is shown; there's no profile/display-name source and v1 is single-author. | Backend (later) | `author_id` stored (Supabase user id, null in mock mode); UI shows "You". | Needed only when sharing lands (out of scope v1). |
