# Test checklist — Text-Only Context Capture (v1)

**Setup**
- `npm install && npm run dev` (port 9000).
- You can test either way:
  - Mock: `NEXT_PUBLIC_USE_MOCK_PERSISTENCE=true` — the seeded Retention canvas, numbered n1–n6.
  - Real: open a real canvas.
- Notes live in browser `localStorage` for now (blocker.md BL-1). To start clean, clear site data, or delete the `tc.context.v2.*` and `tc.context-drafts.v1.*` keys. (Notes saved before slice S01 used `tc.context.v1.*` and are no longer read.)
- Defaults under test (spec brackets): composer and bar 5 lines, `#` list 5 rows, 1,000 characters per note, 4 lines before "Show more", "?" after 10 s, 3 "Needs you" items visible, "Why remove this?" for 10 s.

Mark each line ✅ or ❌, with a note.

---

## Slice S01 — types mirror + rev-3 names (regression only, mock mode)
Nothing should look or behave differently. Run these once:
1. Save a note on a node, on an edge and in the canvas bar → each shows in the panel with the right badge.
2. Move a note to another node, then Undo → it goes there and comes back.
3. Edit a note, then Undo → text returns. Delete a note, then Undo → it returns.
4. Delete a node that has a note, wait out the undo toast → the note no longer shows on that node. Answer "Why remove this?" → "Reason saved".
5. `/all` and `@n2` shortcuts still save to the right nodes.
6. Real canvas (local DB, not required to have the new migrations): ghosts still stream in and the connection stays open (no console warnings every ~25 s).
7. Expected, not a bug: notes saved before this slice are gone (storage key changed).

---

## Slice S02 — node numbers from the database (real canvas, local DB with the 3 backend migrations applied)
Mock mode is unchanged (numbers still assigned in the browser) — only check item 8 there.
1. New canvas: type text in 3 nodes → `n1`, `n2`, `n3`. A node you haven't typed in yet shows **no** number until its text is first saved (the number comes from the database).
2. Reload → the same numbers.
3. Open the same canvas in a second browser → the same numbers.
4. Delete `n3`, wait out the undo toast, add a node and type in it → it is `n4`, never `n3`.
5. Delete a node and click Undo → it returns with its same number.
6. Edit a node's text → its number does not change.
7. Duplicate a node → the copy gets a new, higher number. Accept an AI ghost → the new AI node gets a number too.
8. Mock mode (`NEXT_PUBLIC_USE_MOCK_PERSISTENCE=true`): numbers still `n1…n6` as before.
9. If a number shows as nothing/`n?` where you expect one, open the browser console and look for a `[persistence] insert failed` warning — that means the database rejected the node write (e.g. migrations not applied).

---

## Slice S03 — save a note on a node, for real (real canvas, local DB with the 3 backend migrations)
**Known gap until S07–S08:** moving a note and deleting a node/edge are still not persisted on a real canvas (the console shows "not persisted to Supabase yet"). Edit / delete / Undo are persisted from S04.
1. Focus a node that has text, type a note in the composer, save → the badge shows 1 and the panel lists the note.
2. Reload → the note, the badge and the panel entry are still there.
3. Open the same canvas in a second browser → same note and same badge count.
4. In Supabase (Studio / SQL): `context_entries` has one row (your text, `source='typed'`, `deleted_at` null) and `context_links` has one row (`target_type='node'`, your node id, `origin_status='OWNED'`, `state='active'`).
5. Go offline (devtools → Network → Offline), save a note → the draft stays in the box, a "Couldn't save the note…" message shows, and the note is not listed. Go back online and press save again → exactly **one** note exists (check `context_entries` for no duplicate).
6. Paste more than 1,000 characters and save → the first 1,000 are saved, the rest stays in the box as the next draft (PM-6).
7. A note that is only spaces can't be saved (nothing happens).
8. Mock mode: notes still work offline from `localStorage`, exactly as before.
9. Side effect to glance at (formally tested in S05/S06): a canvas-bar note, an edge note and `/all` also save through the same database call and should survive a reload. Tell me if they don't.
10. If saving always fails: look at the console. `42501` = the database refused it (canvas id not yours / not signed in); a PostgREST 400/404 about `create_context_entry` means the migrations aren't applied or the call shape is wrong — send me the message.

---

## Slice S04 — edit, delete and undo a note (real canvas, local DB)
**Known gap until S07–S08:** move a note, and deleting a node/edge, are still not persisted.
1. Edit a note in the panel (Edit → change → Save) → the new text shows; reload → the new text is still there; the second browser shows it after a reload.
2. Edit, then click **Undo** on the "Note edited" toast → the old text returns; reload → still the old text.
3. Delete a note → the badge count drops and the panel loses it; reload → still gone. In Supabase, the `context_entries` row has `deleted_at` set and its `context_links` row is **unchanged** (`state` still `active`).
4. Delete a note, then **Undo** → the note and badge return; reload → still there; `deleted_at` is null again.
5. Save a note and immediately click **Undo** on the "Saved" toast → the note disappears; reload → still gone.
6. Edit a note to more than 1,000 characters (paste) → a "Couldn't save the edit…" message, and the text is unchanged after you cancel; the database row is unchanged.
7. Go offline and delete a note → "Couldn't remove the note. Try again." and the note stays listed. Go online, delete again → it works.
8. Mock mode: edit/delete/undo still work exactly as before, from `localStorage`.
9. If anything silently "works" on screen but is back after a reload, tell me — that means a database update changed no rows (it should show an error instead).

---

## A. Sequence numbers (§5.3)
1. Every node shows `n1`, `n2`, … just outside its top-right corner, in creation order.
2. Create a node: it gets the next number.
3. Delete the highest-numbered node, wait for the undo toast to go, then create a node. The new node gets a **new** number; the deleted one's number is not reused.
4. Delete a node, then click **Undo**: the same node comes back with the **same** number.
5. Duplicate a node (kebab → Duplicate): the copy gets a new number.
6. Refresh the page: all numbers stay the same.
7. Accept an AI ghost: the new AI node gets a number too.

## B. Focus (§5.2, §7 Target)
1. Click a node: a **blue outline** appears on it. No composer opens and nothing on the canvas moves.
2. Click an edge's line: the edge turns **blue**.
3. Drag a node, pan the canvas, resize a node, or Shift-click / ⌘-drag to multi-select: the focus doesn't change.
4. Click empty canvas: nothing is focused and any open composer closes.
5. "+ New node": the new node is focused (outlined).
6. Type inside a node: that node becomes focused.

## C. Composer opening (§5.2)
1. Type node text and press **Enter**: the node text saves and the composer opens **below the node** with the cursor in it.
2. Same with **Tab**.
3. **Shift+Enter** in a node adds a new line and doesn't open the composer.
4. Press Enter on an **empty** node: no composer opens.
5. Draw an edge between two nodes: the composer opens **at the middle of the edge** by itself. The chip reads `nX to nY`.
6. Click a node that already has text, or click an edge's line, then press **Tab**: the composer opens.
7. Focus a node with no notes: a small **"+ Add context"** button appears below its bottom-left corner. Click it: the composer opens.
8. With a composer open on n1, click n3: the composer closes under n1 and a **new** one opens under n3. It doesn't slide across.
9. With **no** composer open, click around between nodes: no composer opens and nothing shifts.
10. Skip a composer with Esc, a click on empty canvas, or "+ New node": nothing is saved and nothing is lost.

## D. Composer look and behaviour (§5.1)
1. The composer and the focused node share the blue colour, and a small pointer points at the component.
2. The chip reads e.g. `n2 · Onboarding ends on day…` (number + short excerpt).
3. Type 7+ lines (Shift+Enter): the box grows to 5 lines, then scrolls.
4. **Enter** saves. **Esc** closes and keeps the draft.
5. A hint line under the box lists the shortcuts.
6. Zoom far in, then far out: the composer stays a readable size under the component.
7. Drag the node while its composer is open: the composer moves with it.
8. Open the composer on a node near the **bottom** of the view: the view scrolls just enough to show the whole composer, without zooming.
9. Open it on a node near the **left or right edge**: the box shifts sideways to stay on screen, and the pointer still points at the node.
10. **Making room:** put nodes directly below the focused node, including a stack of two or three, then open the composer.
    - Each node in the way slides down just enough, and none overlap.
    - Nodes off to the side don't move.
    - Connected edges follow.
11. Close the composer: the moved nodes slide back.
12. Refresh after step 10: positions are the originals (the saved layout never changed).
13. Turn on OS "reduce motion": nodes still make room, but jump instead of animating.

## E. Saving notes and badges (§5.5)
1. Save a note on n2: the composer closes, a toast says **"Saved to n2 · Undo"**, and n2 shows a badge **1** below its bottom-left corner.
2. No note text appears on the canvas itself.
3. Click **Undo** on the toast: the note is gone and the badge disappears.
4. Save two notes on an edge: the edge shows a badge **2** just right of its middle.
5. Saving an empty or whitespace-only note creates nothing.
6. Paste 1,200 characters and save. One note with the first 1,000 characters is saved, the remaining 200 stay in the box, and the toast and counter explain this.

## F. Drafts (§5.2, §5.5, §7 Drafts)
1. Type in n2's composer, then click n4: the draft stays with n2 (a **dot** on n2's badge) and n4's composer opens empty.
2. Reopen n2's composer (Tab / Add context / badge): the draft is restored.
3. Close a composer with text using Esc: the dot shows on the badge.
4. Refresh with an unsaved composer draft: the draft is still there when you reopen it.
5. Refresh with text in the canvas bar: the text is restored.
6. Clear a draft completely and move on: the dot disappears.

## G. Shortcuts (§5.3)
1. In a composer, type `@n3 ` (with the space): the composer moves under n3 and text typed after the shortcut goes with it. The chip shows **← back**.
2. Type `@n3`, then press Enter: same as step 1.
3. Type `@n99 `: a short message "There's no node n99. Nothing changed." appears and the text stays.
4. Click **← back**, or press Backspace in an empty box, or Esc: the note goes back to the previous target.
5. Type `#ret`:
   - Up to 5 matching nodes are listed, each with number, text and note count.
   - ↑/↓ and Enter pick one; the composer moves there.
   - Clicking a row works too.
6. Type `#` and text that matches nothing: the list says "No node matches." Esc closes the list and leaves the text.
7. Use two nodes with the same text: both are listed, told apart by number.
8. Write a note, move the cursor to the very start and type `@n2 `: the existing text moves to n2.
9. Type a shortcut in the **middle** of a note (e.g. "see @n2 later"): it stays plain text.
10. Pick a node that's off screen: the view brings it on screen without changing the zoom.
11. Type `/all ` (with the space):
    - The text moves to the **canvas bar**.
    - The chip reads **"Every node (N)"**.
    - All nodes are outlined.
12. Save the `/all` note: every node's badge goes up by 1, and the toast says "Saved to every node (N)".
13. Undo that save: the note disappears from **every** node in one step.
14. Type `/all `, then Esc or ← back: nothing is saved and the text returns to where it was.
15. First shortcut ever used: a one-time explanation appears. It doesn't appear again after that.

## H. Canvas context bar (§5.4)
1. The bar is visible at the bottom at all times, including while a composer is open, and is one line when idle.
2. It reads **"Canvas context"** with the line "Notes about the whole canvas, not about one node. This is not a chat and nothing will reply."
3. It has a note icon, a neutral (not blue) look, a **"Save note"** button, and an example placeholder.
4. It has no avatar, no typing dots and no reply area.
5. First visit shows a dismissible explainer. After "Got it" and a refresh, it doesn't come back.
6. Save a note: the toast says "Saved to canvas context · Undo" and the bar's count badge goes up.
7. Nothing else happens, and the focus doesn't change.
8. Save "can you summarise this?": it saves, and the message "Saved as a note. Nothing replies here." appears.
9. Press **Alt/Option + C** from anywhere: the cursor jumps into the bar.
10. In the bar, type `@n2 hello`: the text is handed to the composer under n2.
11. In the bar, type `#onb` and pick a node: same hand-off as step 10.
12. In the bar, type `/all `: the text stays in the bar in "every node" mode.
13. Type 7+ lines: the bar grows upward to 5 lines, then scrolls.
14. Type in the bar while a composer is open: both are visible, text goes where the cursor is, and they look different.

## I. Context panel (§5.5)
1. Click a node's badge: the right panel opens on **Notes**, headed "Notes on n2 · …", newest first.
2. Each note shows its text, a **Typed** tag, "You" and the time.
3. Click the same badge again: the panel closes. Esc and × also close it.
4. With the panel open, click another node: the panel switches to that node's notes.
5. Click empty canvas: the panel shows the canvas notes.
6. Click **"Canvas notes →"**: the panel shows the canvas notes.
7. Click the canvas bar's count badge: the panel opens on the canvas notes.
8. A note longer than 4 lines is cut off with **Show more** / Show less.
9. With many notes, the panel scrolls and the canvas is unaffected.
10. **Edit:** change a note and press Enter. The toast says "Note edited · Undo", and Undo restores the old text.
11. **Delete:** the note is removed and the toast says "Note deleted · Undo". Undo brings it back.
12. **Move to:**
    - The `#`-style picker opens.
    - Choose n5: the note moves to n5 and both badges update.
    - Undo puts it back.
13. Move on an `/all` note: only the link for the node you're viewing moves. The note shows "on N nodes".
14. A component with no notes shows "No notes on … yet." and an **Add context** button that opens its composer.
15. Saving a note never opens the panel by itself.
16. Open the **Threads** rail while the panel is open: the panel closes. Opening the panel closes the rail.

## J. Edges "?" and Needs you (§5.6)
1. Draw an edge, press Esc on its composer, then click elsewhere. After about 10 s a small **"?"** appears next to the edge middle, and a "Needs you · 1" tab appears on the right edge.
2. While the edge stays focused, no "?" appears.
3. Click the "?": the panel opens on **Needs you** with "Why do these connect?", a one-line box and the quick labels "leads to", "depends on", "contradicts".
4. Type an answer and press Enter, or tap a quick label: a note is saved on the edge, the badge shows 1, and the "?" disappears.
5. **Skip:** the "?" disappears and doesn't come back after a refresh.
6. Reopen that edge's composer yourself: you can still add a note.
7. Draw 5 unexplained edges and move on: at most **3** items are visible, with "2 more after these".
8. Edges that were already on the canvas when you opened it never get a "?".

## K. Deleting components (§5.7, §7)
1. Delete a node: a small **"Why remove …?"** box appears where it was.
2. Ignore it: it disappears after about 10 s.
3. Typing in it keeps it open. Enter saves the reason, with the toast "Reason saved".
4. Delete a node that has notes, then click **Undo** on the delete toast: the node, its number and its notes (badge count) all come back.
5. Delete a node with notes and let the undo window pass: its notes are gone, and no other component gains any text.
6. With an unsaved draft in a node's composer, delete that node:
    - The draft appears in the canvas bar with the chip **"Draft from deleted nX"**.
    - "Save note" saves it to the canvas, or `@n2` aims it at another node.
7. Delete an edge: the same "Why remove…" prompt appears near where the edge was.
8. Group-delete 3 nodes: one prompt appears ("Why remove 3 nodes?").

## L. Cross-tab, failure and history
1. Open the same canvas in two tabs and save a note in tab A: tab B's badge updates without a refresh.
2. Failure path: in devtools, fill localStorage until it's full (or block site storage), then save.
    - You see "Couldn't save. Your note is still here. Retry".
    - The draft is kept.
3. Open a past session (history view): no composer, bar, badges or panel appear, and sequence numbers still show.
4. Return to the live canvas: everything is back.

## M. Small screen (≤ 640px — devtools device mode)
1. Open a composer: it docks at the bottom, just above the on-screen keyboard. The target stays outlined and named in the chip.
2. With a composer open, the canvas bar shrinks to a one-line strip.
3. With no composer open, the bar is compact (no sub-line text).
4. The context panel opens as a full-width sheet, and × returns to the canvas.

## N. Keyboard and screen reader
1. Keyboard only, with no mouse:
    - Tab opens the composer on the focused component.
    - Enter saves and Esc closes.
    - Alt+C jumps to the bar.
    - Badges and "Needs you" items can be reached with Tab.
2. Screen reader:
    - The composer announces "Writing a note for n2 · …".
    - Badges read like "2 notes on n3 — open notes", including "unsaved draft" when there is one.

## O. Regression checks (existing features touched)
1. Node text editing still works: click to edit, blur to save, and the Supabase write happens.
2. Edge click still shows the delete button and bend dot. Bending and deleting still work.
3. Question edge "Q" pulse and relate-edge diamond still render, and the context badge doesn't cover them.
4. Node drag and group drag still persist positions, including a node that had been pushed down by a composer: after dragging, refresh. It should be where you dropped it.
5. Ghost accept/reject and Set aside still work.
6. The delete undo toast still appears, and context toasts appear just above it rather than on top of it.
