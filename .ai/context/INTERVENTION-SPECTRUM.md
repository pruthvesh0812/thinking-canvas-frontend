# Intervention Spectrum — How It Works

> Plain-language walkthrough of one full round trip: from "the human stopped
> typing" to "a ghost pair shows up, or nothing happens." Read top to bottom,
> in order — each section builds on the one before it.

---

## 1. What problem this solves

Ghost pairs (Expander / Stress-Tester nodes) used to just... appear, with no
warm-up. The intervention spectrum adds a **waiting room** in between:

> backend decides it wants to help → human gets a few seconds of notice → human
> lets it happen, pulls it forward, or waves it off → *then* the ghost pair
> generates.

That waiting room is the whole feature. Nothing about how a ghost pair is
generated, streamed, or accepted/rejected changed — this just adds a gate in
front of it.

**Two repos are involved.** This doc covers both sides of the wire.

| Repo | What it owns |
|---|---|
| `thinking-canvas-frontend` (this repo) | Notices the human paused, shows the countdown, sends `/trigger` `/process` `/dismiss` |
| `thinking-canvas-be` | Decides if it's worth intervening, runs the countdown timer, generates the ghost pair |

---

## 2. The cast (one line each)

**Frontend:**
| File | Job |
|---|---|
| [`use-intervention-trigger.ts`](../../src/hooks/use-intervention-trigger.ts) | Watches for a human node that's been left alone for 2.5s → calls `/trigger` |
| [`api.ts`](../../src/lib/api.ts) | `interventionTrigger` / `interventionProcess` / `interventionDismiss` — the three POST calls |
| [`use-ghost-stream.ts`](../../src/hooks/use-ghost-stream.ts) | The one SSE connection for the session. Routes `waiting`/`offer`/`withdraw` frames into the store below |
| [`intervention-store.ts`](../../src/stores/intervention-store.ts) | Holds the current offer's state: `waiting` or `shown` |
| [`use-intervention.ts`](../../src/hooks/use-intervention.ts) | The countdown UI's brain: ticks the timer, calls `/process` or `/dismiss` |
| [`use-intervention-offer-surface.ts`](../../src/hooks/use-intervention-offer-surface.ts) + [`InterventionOfferCard.tsx`](../../src/components/canvas/InterventionOfferCard.tsx) | If the node the offer is about has scrolled off-screen, shows a small "something's ready, click to jump" card |

**Backend:**
| File | Job |
|---|---|
| `src/routes/intervention.ts` | The three HTTP endpoints — `/trigger` `/process` `/dismiss`. Each just validates and fires an internal event; no real work happens in the route itself |
| `src/pipeline/agent-pipeline.ts` (`intervention-pipeline`) | The actual brain. One long-running job per offer: judge → wait → maybe re-judge → generate |
| `src/streaming/offer.ts` | Publishes the `waiting` / `offer` / `withdraw` SSE frames |

---

## 3. The flow, step by step

### Step 0 — Something has to notice

`useInterventionTrigger` watches the canvas store. When a human-owned node's
content stops changing for **2.5 seconds** (`DWELL_MS`), and that node hasn't
already been asked about, it calls:

```
POST /api/intervention/trigger  { canvas_id, session_id, node_id }
```

This is *only* a "hey, might be worth looking at this" signal. The frontend
never decides whether help is actually warranted — that's step 2.

### Step 1 — Backend takes the ticket

The route handler does three small things and returns immediately
(`202`, not waiting around):
1. Makes up a fresh `offer_id`.
2. Fires an internal event (`canvas/intervention.trigger`) carrying
   `{ canvas_id, session_id, node_id, offer_id }`.
3. Hands that same `offer_id` back to the frontend in the response.

Everything interesting happens in the background job this event kicks off —
the **intervention-pipeline**.

### Step 2 — Judge: is this worth interrupting for?

The pipeline runs two AI calls:
- **Attunement** — reads the last 5 nodes, figures out what cognitive mode /
  question style the human is in right now.
- **Judge** — given that, plus the whole canvas, decides: is there a mature
  thought here worth intervening on, and if so, which agent (Expander or
  Stress-Tester) should respond?

Three outcomes:
- **Not mature** → pipeline just stops. Nothing reaches the frontend at all.
  This is the silent majority of triggers.
- **Mature, but the right agent is Pro-only and the user's on a lower tier**
  → skips straight to showing an "upgrade to unlock this" card. No countdown,
  no generation.
- **Mature, and the agent is available** → continues to step 3.

### Step 3 — "Waiting": the countdown starts

The pipeline creates an **offer** row (status `waiting`) and publishes a
`waiting` SSE frame with a `timer_ms` value (10s normally, 5s if the backend
thinks this person is unusually receptive right now — never hard-coded on
the frontend).

On the frontend, `use-ghost-stream.ts` receives that frame and calls
`intervention-store`'s `setWaiting(offer, timer_ms)`. `use-intervention.ts`
sees the new "waiting" offer and starts a real countdown (`remaining`,
ticking every 100ms). This is what the pulsing `DebounceIndicator` UI shows.

**Backend is now literally parked**, doing nothing, waiting for one of three
things to happen next.

### Step 4 — Three ways the wait can end

| What happens | Frontend calls | `reason` sent |
|---|---|---|
| Countdown reaches 0 on its own | `/api/intervention/process` | `"lapse"` |
| Human clicks "process now" (or un-pauses and it finishes) | `/api/intervention/process` | `"manual"` |
| Human clicks "dismiss" / waves it off | `/api/intervention/dismiss` | — |

- **`/process`** wakes the parked backend job (it's specifically waiting for
  an event matching this `offer_id`). `reason` matters: `"manual"` means the
  human was actually watching, so the ghost pair can be shown more directly;
  `"lapse"` means they weren't, so it should be subtler.
- **`/dismiss`** ends it right there. The offer is marked `dismissed`. This is
  *not* a rejection of content (nothing was generated yet) — it only feeds
  "this person doesn't want to be bothered right now" into their receptivity
  score, which is what makes future timers 5s instead of 10s (or vice versa).
- If **neither** happens for a full 10 minutes (tab left open and ignored),
  the backend expires the offer itself and sends `withdraw`.

If dismissed or expired, the frontend's `intervention-store.withdraw(offerId)`
removes it and nothing more happens for this node until it's edited again.

### Step 5 — Re-check before generating

If `/process` woke it up, the backend checks: *did the canvas actually change
while we were waiting?* (someone added/edited nodes elsewhere). If not, it
reuses the original judgment. If it did change, it re-runs Attunement + Judge
from scratch — and if the thought is no longer mature, it withdraws instead of
generating anything.

This is also the point where, if a *newer* trigger came in for the same
session while this one was parked, this older one gets superseded — marked
cancelled, `withdraw` sent, and the newer one takes over. Only one offer is
ever in flight per session.

### Step 6 — Generate (this part is the old, unchanged ghost pair flow)

From here it's exactly what already happens for any ghost pair:
1. `spawn` SSE — the ghost node/edge shapes appear (empty, dashed).
2. `chunk` SSE (repeated) — text streams in token by token.
3. Somewhere in here, `offer` SSE also fires — carrying `directness` (subtle
   vs. direct) and a `headline`. This is the "show" signal for the
   intervention UI specifically (separate from the ghost pair's own visuals).
4. `done` SSE — streaming finished.

`intervention-store.setOffer(offer)` flips this offer's phase from `waiting`
to `shown`. On the frontend, `use-intervention-offer-surface.ts` checks: is
the node this is anchored to currently visible on screen?
   - **Yes** → the ghost pair's own glow/halo is enough, no extra UI.
   - **No** → `InterventionOfferCard` shows a small "something's ready — click
     to jump to it" card in the corner.

### Step 7 — Accept / reject (also unchanged)

The human looks at the ghost pair and accepts or rejects it exactly like any
other ghost — through the existing `ghost-store` / `GhostControls` flow
covered in `GHOST-STREAMING.md`. The intervention spectrum's job ends the
moment `offer`/`done` land; it never touches acceptance.

---

## 4. The whole thing as one diagram

```
Human stops editing a node (2.5s dwell)
        │
        ▼
FRONTEND  POST /api/intervention/trigger ───────────────────┐
                                                              ▼
                                                    BACKEND creates offer_id,
                                                    fires internal event,
                                                    returns 202 immediately
                                                              │
                                                              ▼
                                                    Attunement + Judge
                                                    ┌─────────┴─────────┐
                                              not mature           mature
                                                    │                   │
                                              (nothing happens)         ▼
                                                              create offer,
                                                              SSE: "waiting" (timer_ms)
                                                              │
                                                              ▼
FRONTEND shows countdown  ◄───────────────────────────────────┘
        │
        ├── timer hits 0 ───────────► POST /process  {reason:"lapse"}  ──┐
        ├── user clicks "now" ─────► POST /process  {reason:"manual"} ──┤
        └── user dismisses ────────► POST /dismiss ──► SSE: "withdraw"  │
                                                                          ▼
                                                              BACKEND wakes up,
                                                              re-checks canvas,
                                                              still mature?
                                                              ┌─────┴─────┐
                                                            no            yes
                                                              │             │
                                                    SSE: "withdraw"   generate:
                                                                       SSE spawn → chunk* → offer → done
                                                                              │
                                                                              ▼
                                                                  FRONTEND: ghost pair appears
                                                                  (existing accept/reject flow)
```

---

## 5. Rules worth remembering

- **One offer per node at a time.** A new trigger for a node that already has
  a pending offer or ghost pair is simply not sent (`use-intervention-trigger.ts`).
- **One offer per *session* in flight on the backend.** A fresh mature
  judgment always supersedes whatever was still parked.
- **`seq` guards against out-of-order SSE frames.** Every offer carries an
  increasing sequence number; a `waiting`/`offer` frame that's behind what the
  store already has is dropped as stale.
- **Dismiss ≠ reject.** Dismissing a still-waiting offer only affects the
  receptivity score (how eager future timers are). Rejecting a *generated*
  ghost pair is a completely separate, existing flow with its own reasons.
- **Unknown SSE message types are always ignored, never thrown on** — this
  protocol is expected to keep growing.
- **The frontend never judges "is this worth intervening on."** It only
  decides *when* to ask (the dwell timer). The backend's Judge step is the
  only place maturity is decided.

---

## 6. If you're debugging "nothing happens after I stop typing"

Check, in order:
1. Is `/api/intervention/trigger` actually reaching the backend? (404 usually
   means the frontend URL and the backend's mount path don't agree — the
   route must be registered under `/api`.)
2. Backend logs for `[route:intervention] trigger fired` — confirms the event
   was sent.
3. Backend logs for `[pipeline:agent] step:judge ruled` — shows `mature`,
   `route`, `tier_locked`. If `mature: false`, that's the end of the line by
   design — nothing is broken.
4. If mature, look for `step:waiting published` — if that's missing, the
   pipeline crashed before it could publish; check the step before it.
5. On the frontend, `[ghost-stream] unhandled message type` in the console
   means a new SSE type shipped on the backend that the frontend doesn't
   handle yet — add a case in `use-ghost-stream.ts`'s switch.
