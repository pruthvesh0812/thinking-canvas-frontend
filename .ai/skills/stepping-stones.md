---
last-verified: 2026-09-26
stale-after-days: 90
---

# Skill: Stepping-Stones Walkthrough

> Load this when the human wants to walk an actual flow's real code, function
> by function, at their own pace — to find where a bug is really coming from,
> to look for something to optimize, or just to understand how something
> works at the lowest level. They ask for this by name ("let's do a
> stepping-stones walkthrough of X"), or by describing it — "walk me through
> the code", "take me through this one function at a time", "let's go
> step by step through the flow."

This is **not** the same thing as `code-alignment-doc.md`. That skill writes
one doc, once, after a feature ships, and asks comprehension questions about
the *concepts*. This skill is a live, back-and-forth conversation through the
*real code*, usable any time, as many times as needed, in either repo.

---

## The idea

The flow is a river. Each function is a stone in it. You put down ONE stone
(or a small handful — see sizing below), the human reads it and stands on
it fully — actually understands it, not just skimmed it — before you place
the next one. Never the whole crossing at once.

The output of a run of this skill is not a document — it's understanding,
built up turn by turn in the conversation itself.

---

## Sizing — how many functions per stone

Judge by how much is going on inside the function, not its line count.

| Size | What it looks like | How many shown at once |
|---|---|---|
| Big | The brain of a stage — several branches, several steps, the thing that actually decides something | 1 |
| Medium | One clear job, maybe one branch | 2 |
| Small | A one-liner, a getter, a guard clause, a thin wrapper | 3-4 |

When unsure, round down (treat it as smaller, show fewer).

---

## Before the first stone

1. Figure out the real order of stones — trace the flow as it actually
   executes at runtime, not the order files happen to sit in a folder. If a
   doc like `.ai/context/INTERVENTION-SPECTRUM.md` already maps this flow,
   reuse its stage names so the two stay consistent in the human's head.
2. For a **debugging** walk specifically: decide which direction to walk —
   from where the symptom is first noticed, forward through what *should*
   happen next; or backward from where it's supposed to land. Say out loud
   which direction and why before starting.
3. Give a short table of contents — stone names only, no content yet — so
   the human has a map of how many stops there are. Do not explain any of
   them yet; that happens one stone at a time below.
4. If the flow crosses into another repo (e.g. the backend), say so before
   crossing. If that repo isn't already something you can read in this
   session, stop and ask the human for its path or for access — never guess
   or reconstruct backend code from memory.

---

## Each stone

1. Announce it: "Stone N of ~M: `functionName` — the thing that does X."
2. Show the REAL code — `Read` the actual file, quote the actual function,
   with its `file:line`. Never paraphrase code into pseudocode.
3. Explain what it does in plain words — same bar as `CODING-STANDARDS.md`'s
   comment rule: short sentences, everyday language, one idea at a time. Say
   how it connects to the stone before it (what calls it, with what) and
   what it hands to the stone after it.
4. On a debugging walk: name the ONE concrete thing worth checking right
   here — a log line to look for, a Network tab entry, a value to print.
   Prefer actually checking it together (console/network/logs, or firing up
   the preview and watching it happen) over guessing what "should" happen.
5. **Stop.** Wait for the human to confirm they've got it before moving on —
   "ok", "next", a question, or them spotting the actual bug. Never
   auto-advance to the next stone in the same turn.
6. If a question comes up, resolve it completely here. Don't carry a loose
   thread forward to the next stone.

---

## Landing on the far bank

Once the last stone is placed: one short paragraph on what they now know,
and — this matters more than the summary — one concrete next action: the
exact line to change, or the exact thing to test next, not just "now you
understand it."

---

## Checklist

1. Stones sized by how much a function actually does, not its length.
2. Table of contents given up front; each stone's content only shown one at
   a time.
3. Never advanced without an explicit go-ahead from the human.
4. Real code, real `file:line`, every time — never pseudocode.
5. Cross-repo moves announced before crossing; access asked for if missing.
6. Plain language throughout — same bar as `CODING-STANDARDS.md`.
7. Ends in a concrete next action, not just a recap.
