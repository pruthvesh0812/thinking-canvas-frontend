---
feature: "text-context-capture"
type: story
created: 2026-10-16
status: in-progress — frontend v1 built against a local stand-in repository; waiting on backend (see blocker.md)
git_branch: "ccr-dffed412-k09857 (session-designated branch, cut from main @ 67a08d2)"
source: "Text-Only Context Capture — Requirements (Oct 16, 2026)"
---

## What
Let a typing user attach the "why" to a node, an edge, or the whole canvas —
an anchored composer under the focused component, an always-present canvas
context bar, and a right-hand context panel for reading/editing notes.

## Why
Product pivot (spec §1–§2): typists have no natural place for the thinking
behind a node, so agents only see labels. Text is the counterpart of voice
mode; both feed one context store.

## Context to Load
`CORE-CONCEPTS.md` + `CANVAS-RENDERING.md` + `STATE-MANAGEMENT.md`; this folder's
`backend-requirements.md`; root `blocker.md`, `pm_handoff.md`, `test.md`.

## Depends On
Backend B1–B3, B6 for real persistence (backend-requirements.md). The UI does
not wait on them — it runs on the stand-in.

## Files
New:
- `src/lib/context-contract.ts` — PROVISIONAL contract types (delete on mirror sync)
- `src/lib/context-repository.ts` — persistence seam (localStorage stand-in)
- `src/lib/context-settings.ts` — every bracketed default, one place
- `src/lib/make-room.ts` — display-only "making room" layout
- `src/stores/context-store.ts` — notes, links, seq numbers, drafts, focus, composer, panel, prompts
- `src/hooks/use-context-notes.ts` — orchestration (focus rules, shortcuts, save/edit/move/delete + undo, edge "?", deletion)
- `src/hooks/use-note-input.ts` — shared keyboard model for composer + bar
- `src/hooks/use-media-query.ts`
- `src/components/context/` — `ContextComposer`, `CanvasContextBar`, `ContextPanel`, `ContextBadge` (+ edge "?"), `EdgeContextMarkers`, `MakeRoom`, `NodeMatchList`, `ContextOverlays` (toasts, "Why remove this?")

Touched:
- `Canvas.tsx` — mounts everything, focus on pane click / new edge, Tab to open, room offsets
- `HumanNode.tsx` — seq number, badge, focus outline, Enter/Tab confirm opens composer, click/typing focus
- `LogicalEdge.tsx` / `QuestionEdge.tsx` / `RelateEdge.tsx` — focus on click, focus stroke, badge + "?"
- `CanvasFooter.tsx` — "+ New node" focuses the new node
- `use-canvas-persistence.ts` — `persistEdge` returns the edge; delete/undo/commit notify the context layer
- `globals.css` — `--tc-focus*` tokens, making-room transition (reduced-motion aware)

## Progress (spec §5 v1 = 5.1–5.9)

| § | Requirement | Status |
|---|---|---|
| 5.1 | One composer at a time, below focused node / middle of focused edge | ✅ |
| 5.1 | Appears in place, never slides (remounts per target) | ✅ |
| 5.1 | Attached while dragging; grows downward only | ✅ (ViewportPortal anchored to live node position) |
| 5.1 | Shared highlight colour + pointer; colour not the only cue | ✅ (`--tc-focus`, pointer, chip) |
| 5.1 | Target chip "n2 · Pricing" / "n1 to n3" | ✅ |
| 5.1 | Grows to [5] lines then scrolls; Enter saves, Shift/Alt+Enter newline, Esc closes keeping draft | ✅ |
| 5.1 | One-line shortcut hint | ✅ |
| 5.1 | Making room: in-the-way components move down smoothly, return on close, saved layout unchanged | ✅ display-only offsets |
| 5.1 | Staying in view: view scrolls just enough; side shift keeps pointer on component | ✅ |
| 5.1 | Small screens: docked above keyboard | ✅ (≤640px, visualViewport) |
| 5.1 | Reduced motion | ✅ |
| 5.2 | Focus: create / click / type → focus; drag/pan/resize/multi-select → no change; empty-canvas click → none | ✅ (duplicate-node does not take focus — minor gap) |
| 5.2 | Opens after node text (Enter/Tab), on new edge, on request (Tab / "Add context" / shortcut), following focus | ✅ |
| 5.2 | Never a block: Esc / click elsewhere / next node | ✅ |
| 5.2 | Drafts stay with their component, dot on badge, restored on reopen | ✅ |
| 5.3 | `@n2` + space/Enter, `#text` autocomplete ([5] rows, ↑/↓/Enter, Esc), `/all` + space | ✅ |
| 5.3 | `/all` = one note, many links, one undo; edges excluded | ✅ |
| 5.3 | Chip "back"; Backspace-in-empty / Esc returns | ✅ |
| 5.3 | Unknown number → message, nothing changes | ✅ |
| 5.3 | First-use explanation once | ✅ |
| 5.3 | Sequence numbers top-right, never reused, undo-delete restores, copy gets new | ✅ locally (BL-3: backend must own) |
| 5.4 | Canvas bar always visible, 1 line idle → [5] lines, label + sub-line, neutral look, note icon, "Save note", example placeholder | ✅ |
| 5.4 | "Saved to canvas context" + Undo, badge; first-time message; question reminder | ✅ |
| 5.4 | Shortcuts in bar (`@n`/`#` hand to composer; `/all` stays) | ✅ |
| 5.4 | Keyboard shortcut into the bar | ✅ Alt/Option+C (PM-4) |
| 5.4 | Draft autosaves, survives refresh | ✅ |
| 5.4 | Small screen: one-line strip, gives way to composer | ✅ |
| 5.5 | Saved note linked + source/time/author; "Saved to n2" + Undo; badge +1 | ✅ |
| 5.5 | Badge only on canvas; dot = draft | ✅ |
| 5.5 | Context panel: newest first, follows focus, header + "Canvas notes" link | ✅ |
| 5.5 | Shares right area with "Needs you" as two tabs with counts | ✅ ("Needs you" did not exist — built new; BL-6) |
| 5.5 | Text/source/author/time, "Show more" over [4] lines, scrolls | ✅ |
| 5.5 | Edit / Delete / Move to (same picker as `#`), each one-step undo, move logged | ✅ |
| 5.5 | Never opens itself; closes via ×, Esc, same badge | ✅ |
| 5.5 | Empty state + "Add context" | ✅ |
| 5.5 | Max [1,000] chars: keep the rest, tell the user | ✅ (PM-6) |
| 5.5 | Small screen: full-width sheet | ✅ |
| 5.6 | New edge → composer at middle | ✅ |
| 5.6 | Edge label on the edge itself | ❌ blocked (BL-7, no `edges.label`) |
| 5.6 | "?" after ~[10 s] once focus moved on; "Needs you" item w/ one-line box + quick labels; dismiss not asked again; ≤[3] visible | ✅ (PM-7: only edges drawn this session) |
| 5.7 | "Why remove this?" where it was, ~[10 s], stored against the deleted component | ✅ (decision log, stand-in) |
| 5.7 | Notes go with the component; undo brings component, number, notes back | ✅ |
| 5.8 | Agents use notes like voice context; canvas notes feed the rolling summary; agents never see deleted notes | ⛔ backend (B12) |
| 5.8 | Every note change undoable in one step; text never changed by the system | ✅ |
| 5.9 | Voice + text share one focus | ✅ focus lives in `context-store` ready for voice; voice not in this repo |
| 5.9 | Typed + spoken in one list, each with source | ✅ rendering supports `source: 'spoken'`; no spoken data yet |
| §8 | Live updates incl. other tabs | ✅ stand-in via `storage` event; real one needs SSE (B11) |
| §8 | Settings changeable without release | ⚠️ env-overridable; needs backend (B7 / BL-5) |
| §8 | Failure: draft kept + Retry | ✅ |
| §7 | Access: keyboard + screen reader | ✅ basic (aria labels, live region naming target, Tab/Alt+C); needs an a11y pass |

## Not in v1 (spec)
Group notes, suggestions from notes, thin-canvas hints (v2 §6.1–6.3); images/files (§6.4, after voice);
multi-author; rich text; shortcuts aimed at edges.

## Next steps
Schema is agreed on the frontend side as **`schema.md` rev 3**; the existing code predates it.
The remaining frontend work (align to rev 3 → real Supabase persistence → P1 items → attachments)
is written up for the next session in **[`frontend-requirements.md`](./frontend-requirements.md)**.
Backend work list: [`backend-requirements.md`](./backend-requirements.md).
