---
last-verified: 2026-09-26
stale-after-days: 90
---

# Skill: Code-Alignment Doc + Session

> Load this when a feature's **Definition of Done** (from its `story.md`) is
> met — before telling the human the feature is finished. Skip it only for a
> genuinely trivial change (typo, one-line config, no new logic).

---

## Why this exists

A diff review tells the human *what changed*. It doesn't leave them able to
explain *why* it works, or *what decision* would need to change if a bug
shows up in it next month. This skill closes that gap: write a plain-language
doc of the feature, then walk the human through it, so the feature's logic
lives in their head — not just in the code.

This is the same doc style already proven on
[`.ai/context/INTERVENTION-SPECTRUM.md`](../context/INTERVENTION-SPECTRUM.md) — read
that one first as the reference example.

---

## Where it lives

```
.ai/features/<name>/alignment.md     # sibling to that feature's story.md
```

One per feature, written once the feature is actually done (not upfront —
`story.md` is the plan, `alignment.md` is what actually got built).

---

## What the doc must contain

Same shape every time, in this order:

1. **What problem this solves** — one paragraph, no jargon. What could the
   human not do before this, that they can do now?
2. **The cast** — a one-line-per-file table: file → job. Enough that the
   human knows where to look next time, without re-reading the code.
3. **The flow, step by step** — plain sentences, in the order things actually
   happen at runtime. Name every decision point and what happens on each
   branch (including the "nothing happens" branches — those are often where
   bugs get reported as "silence").
4. **One diagram** — ASCII is fine — tracing the same flow visually. If the
   step-by-step section needed more than ~7 steps, the diagram is what makes
   it click.
5. **Rules worth remembering** — the gotchas and invariants a future change
   could accidentally break (one-per-X limits, ordering guarantees, what's
   optimistic vs. confirmed).
6. **Debugging checklist** — "if X seems broken, check these in order."
7. **Comprehension check** — 3 to 6 questions the human should be able to
   answer after reading, in their own words. Not a written quiz to submit —
   they're what you ask out loud in the session (§ below). Write questions
   that probe *decisions*, not trivia:
   - ❌ "What SSE message type starts the countdown?" (recall)
   - ✅ "If the human ignores the countdown and closes the tab, what happens
     on the backend — and why does it matter for their receptivity score?"
     (understanding)

Language rule: same bar as `CODING-STANDARDS.md`'s comment rule — every
sentence should read like something said out loud to a teammate, not written
for another model. If a sentence needs a re-read to parse, shorten it.

---

## Running the session

1. Write the doc, publish/save it, tell the human it's ready and link it.
2. Ask them to read it once, fully, before replying.
3. Once they've read it, pick 2-3 of the comprehension questions and ask
   them conversationally — one at a time, not as a list. The goal is a real
   answer in their own words, not a lookup in the doc.
4. Where their answer is off, correct it in plain language right there —
   this is the actual alignment moment, more than the doc itself.
5. Only after this does the feature count as closed.

Keep it short — this is a 5-minute conversation, not an exam. The doc is the
artifact that survives; the questions are just how you confirm it landed.

---

## Checklist

1. Doc lives at `.ai/features/<name>/alignment.md`.
2. All 7 sections present, in order.
3. At least one diagram.
4. Comprehension questions test decisions, not recall.
5. No sentence needs a second read to parse.
6. The session (§ above) actually happened before the story is marked done —
   writing the doc alone doesn't satisfy this skill.
