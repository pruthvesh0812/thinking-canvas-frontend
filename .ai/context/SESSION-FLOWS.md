---
last-verified: 2026-08-05
verified-against: backend src/routes/session.ts + src/pipeline/session-complete.ts + TechnicalBuild.docx §6.9/§6.12; frontend session-lifecycle story
stale-after-days: 60
---

# SESSION-FLOWS.md

> **Load this when:** Working on canvas creation, north star capture, session
> start, phase toggle, Session Complete, carry-forward, the dashboard, or auth
> gating.

---

## Canvas Creation — North Star Capture (`/canvas/new`)

A single full-screen prompt before any canvas appears:

> **"What are you trying to figure out?"** *(This becomes your north star for this canvas.)*

```
1. User types intent → frontend inserts the canvases row directly to Supabase:
   { id, user_id, title, original_intent }
   (original_intent is INSERT-once — RLS blocks UPDATE; there is no edit UI, ever)
2. POST /api/session/start { canvas_id } → { session_id }
3. Navigate to /canvas/[canvasId] — NorthStarHeader shows the intent, read-only
```

If the user wants a different north star, they create a new canvas. Don't build
an edit affordance "just in case" — immutability is the feature.

---

## Session Start (reopening an existing canvas)

```
1. Load canvas + look for a session with status='active'
2. Active session exists → resume it (hydrate canvas, open SSE)
3. None → POST /api/session/start
     backend creates the row and, if prior sessions exist, drops a
     session-boundary marker into every agent thread (invisible to the UI)
4. Load carried-forward learnings (see Carry-Forward below)
```

A canvas has at most one active session. The frontend never creates session
rows directly — session lifecycle is backend-owned (it has thread side effects).

---

## Phase Toggle

`diverging` (default) ⇄ `converging`, rendered as a visible switch — the user
always knows which mode the AI is in. Flipping it writes
`sessions.current_phase` to Supabase directly. Switching to converging is what
makes the Stress-Tester eligible to fire; expect challenge-type ghosts after.

---

## Session Complete — the 3-Screen Modal

Triggered by a deliberate button click. Never automatic, never on tab close.
This is the most significant UI moment in a session — a distinct modal flow,
not an inline panel.

```
Click "Session Complete"
  │
  ├── POST /api/session/complete { session_id, canvas_id, carry_forward_ids: [] }
  │     → { ok: true } immediately; Observer runs ASYNC backend-side and
  │       persists observations as session_learnings rows, then closes the session
  │
  ├── Screen 1 — OBSERVER SUGGESTIONS
  │     Data: poll/read session_learnings for this session (the pipeline is
  │     async — show a brief "the Observer is reading your canvas" state).
  │     Each observation is a card; contradictions are labeled as such.
  │     Actions: Accept to canvas / Dismiss / Skip all
  │     Note: the full interactive Observer-structure UI (anchors, per-edge
  │     accept) is a later story — see observer-structure-ui + Known Gap #2.
  │
  ├── Screen 2 — UNRESOLVED THREADS
  │     Frontend-computed from canvas state:
  │       · question edges never answered (no follow-up node at the target)
  │       · human nodes with empty content
  │       · accepted contradiction nodes with no follow-up human node
  │     Actions per item: Carry Forward / Resolve now / Discard
  │
  └── Screen 3 — SESSION CLOSED
        Confirmation. North star preserved. [Start New Session] carries the
        selected items forward.
```

> Ordering note: today's backend accepts `carry_forward_ids` on the complete
> call itself, but the user picks carry-forwards *during* the modal (screen 2).
> v1 approach: send `carry_forward_ids: []` on complete, then write the user's
> screen-2 choices as `session_learnings` rows directly from the frontend.
> Flag this asymmetry when building the story — it may warrant a backend tweak.

**As built** (`session-store.ts` + `src/components/session/`):
- Screen 1 polls `session_learnings` every 2s for ~30s, then stops waiting —
  an empty result is a normal outcome (the Observer is Pro-only).
- Accepting an observation writes a `nodes` row **reusing the learning's id**,
  then notifies `ghost.accepted` with `agent_role: 'observer'`. The id reuse is
  what makes "already on the canvas" an exact test at carry-forward time.
- Screen 2's third action, **Resolve now**, is deliberately in-memory: it means
  "surface this the moment I'm back on the canvas", not "store it forever".
  Only Carry Forward writes a row.
- The screen-2 `session_learnings` insert is not in API-CONTRACT.md's
  frontend-write list, so RLS may refuse it until the backend honours
  `carry_forward_ids`. The failure surfaces on screen 3; it is never swallowed.

---

## Carry-Forward (next session start)

On starting a new session on the same canvas, load `session_learnings` rows
that haven't been resolved and render them as **pre-loaded unresolved nodes** —
visually distinct from fresh nodes (e.g. a "carried from last session" badge),
positioned in a dedicated area, ready to continue.

**As built:** the source is the **most recent non-active session only** — the
badge is literally "carried from last session", and `session_learnings` has no
resolved/consumed column to walk further back safely. Rows whose id already
exists in `nodes` (accepted on screen 1) are filtered out. Rendered by
`CarriedForwardNode` in a dedicated column left of the graph. These are the
human's own loose ends, not AI suggestions, so the ghost visual contract
(40-50% opacity, dashed) deliberately does not apply.

---

## Multi-Canvas Dashboard (`/`)

- Grid/list of the user's canvases: title, original_intent excerpt, last
  session date, node count.
- [New Canvas] → `/canvas/new`. Opening a canvas → Session Start flow above.
- Canvases are permanent — no delete in MVP (archive at most).

---

## Auth Gating

```
First visit           → signInAnonymously() silently; user thinks, no friction
First Session Complete→ after screen 3: "Create an account to save and continue"
                        anonymous user converts to permanent (same uid — data stays)
Session 2+            → middleware.ts: no permanent account → redirect /login
```

The gate lives in `middleware.ts` and applies to `/canvas/*` routes. The
dashboard may render for anonymous users with their single canvas.
