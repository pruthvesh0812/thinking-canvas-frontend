# PM handoff — Text-Only Context Capture

Decisions I had to make to keep building. Each one is **already implemented as
described** and is easy to change. Please confirm or overrule; overrules go into
the next iteration.

Spec: "Text-Only Context Capture — Requirements" (Oct 16, 2026).
Tracker: `.ai/features/text-context-capture/story.md`.

## Decisions taken

| ID | Question | Decision taken (current behaviour) | Why | Where to change |
|---|---|---|---|---|
| PM-1 | "Needs you" panel is described as existing, but it doesn't exist. | New right-hand **context panel** with two tabs, **Notes** and **Needs you**. The old "Threads" rail stays; whichever opens last wins the right edge. When something waits in Needs you and the panel is closed, a small "Needs you · N" tab shows on the right edge. | Matches §5.5 ("two tabs") with the least disruption. | `ContextPanel.tsx` |
| PM-2 | Highlight colour shared by the focused component and composer. | Muted blue `#3f6db3` (`--tc-focus`). Not amber, because amber means "the AI" in this product. The canvas bar stays neutral (never blue). | Colour can't be the only cue, so the chip and pointer name the target too. | `globals.css` |
| PM-3 | Enter inside a **node** used to insert a new line. Spec says Enter/Tab confirms node text and opens the composer. | **Enter or Tab confirms node text** and opens the composer. **Shift+Enter** adds a new line inside a node. | Required by §5.2; Shift+Enter keeps multi-line nodes possible. | `HumanNode.tsx` |
| PM-4 | Which keyboard shortcut moves the cursor into the canvas bar? | **Alt/Option + C**. | It's free in the app and browsers. ⌘K, ⌘J and Ctrl+Shift+K clash with browser or devtools shortcuts. | `CanvasContextBar.tsx` |
| PM-5 | Modifier key for a new line in the composer and bar. | **Shift+Enter** (Alt+Enter also works). | Common convention. | `use-note-input.ts` |
| PM-6 | Note over [1,000] chars: shorten it, or ask the user to split it? | **Keep and split.** Saving stores the first 1,000 characters as one note. The rest stays in the box as the next note's draft, and a message says so. A live counter warns before saving. Pasted text is never split by itself. | It's the only option where nothing is lost and nothing is silently cut off. | `saveNote` in `use-context-notes.ts` |
| PM-7 | Which edges can get a "?"? | Only **human-drawn edges created in this browser session** that have no note and weren't dismissed. The "?" shows ~10 s after focus leaves the edge. Old edges loaded with the canvas never get one. | Otherwise opening an old canvas with many unlabelled edges would flood "Needs you". The spec also gives this rule to the backend (B8). | `use-context-notes.ts` |
| PM-8 | Quick labels on "Why do these connect?" | **"leads to", "depends on", "contradicts"**. Tapping one saves it as the note. | The spec says "two or three optional quick labels" without naming them. | `ContextPanel.tsx` (`QUICK_LABELS`) |
| PM-9 | "Move to" on a note linked to many nodes (an `/all` note). | Moves **only the link being viewed** (from this node to the chosen node). **Delete** on such a note deletes it everywhere. The panel shows "on N nodes". | "Move" is about the component you're looking at; `/all` is meant to be one note. | `moveNote` / `NoteItem` |
| PM-10 | Draft on a deleted component, then the delete is undone. | The draft moves to the canvas bar when the component is deleted (labelled "Draft from deleted n4") and **stays there after undo**. The user can aim it back with `@n4`. This applies to drafts on *any* deleted component, not only the focused one. | "Never lost" is the hard rule; moving the draft back silently would be surprising. | `onComponentsRemoved` |
| PM-11 | Where drafts live. | **DECIDED by product (2026-10-17): browser `localStorage` only — no cross-device drafts, no `context_drafts` table.** | Confirmed. | `context-repository.ts` |
| PM-12 | "Why remove this?" on by default, or opt-in? (open question §9) | **On by default.** Shown for ~10 s where the component was, and kept open while the user types in it. Esc or × dismisses it. | The spec leans on it. It's non-blocking and easy to ignore. | `ContextOverlays.tsx` |
| PM-13 | Should a plain click on an existing component open the composer? (open question §9) | **No.** A click only focuses and highlights. The composer **follows** focus only if one is already open (per spec). | Per spec, so clicking around doesn't shift the layout. | `focusFromClick` |
| PM-14 | Should components that made room go back when the composer closes? (open question §9) | **Yes, they go back** (recommended in the spec). | — | `MakeRoom.tsx` |
| PM-15 | `@`/`#` already mean agent/bucket in the canvas primitives spec. | `@n<number>` is reserved for nodes. `#` lists **nodes only** (buckets don't exist in this codebase yet). Anything else after `@` or `#` stays plain text. | Lets both specs coexist. Buckets can be added to the `#` list later. | `parseShortcut` |
| PM-16 | Shortcuts aimed at edges / `/all` including edges. | Not supported (out of scope for v1, per spec). | — | — |
| PM-17 | Who shows as author? | "You" (single author in v1). | Sharing is out of scope. | `ContextPanel.tsx` |
| PM-18 | Which nodes count as "every node" for `/all`? | Every node on the canvas, **excluding set-aside AI nodes** (the AI already ignores those). | Consistent with set-aside semantics. | `CanvasContextBar.tsx` |
| PM-19 | Question reminder rule in the canvas bar. | Shows "Saved as a note. Nothing replies here." when the text ends with "?" or starts with "can/could/would/will you", "please", "tell me", "explain", "help me", or "what do you think". | Spec examples, slightly widened. | `looksLikeQuestion` |
| PM-20 | Small-screen breakpoint. | ≤ 640px wide: the composer docks above the keyboard, the canvas bar becomes a strip, and the panel becomes a full-width sheet. | Common phone breakpoint. | `context-settings.ts` (`SMALL_SCREEN_QUERY`) |
| PM-21 | Where the badge and sequence number sit on a node. | `n3` sits just **outside the top-right** corner (spec). The note badge sits just **outside the bottom-left** corner. A focused node with no notes shows "+ Add context" in that same spot. | Keeps both off the node text and away from the AI/Set-aside chips and the resize corner. | `HumanNode.tsx`, `ContextBadge.tsx` |

## Still open (needs product, not blocking the build)

- Should typed notes count as **stronger** context than voice for agents, or equal? (§9 — backend implements whichever you pick)
- Is ~10 s the right wait before an unlabelled edge's "?" (§9)? It's a setting: `NEXT_PUBLIC_CONTEXT_EDGE_PROMPT_DELAY_MS`.
- Voice doc alignment: should stored voice context also move to badge + panel only (§9)?
- Images/files: types, sizes, counts and storage per plan (§9, after voice).
- Shared canvases: whose notes come first, who can edit (§9, out of scope for v1).
