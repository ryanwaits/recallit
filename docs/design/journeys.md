# Worked examples: two weeks with recallit

> Four people, four subjects, four ways to practice, one honest grade. This shows how the *same* product feels different across a book, a topic, a language, and a paper, and how spaced repetition (the "Remember" verb) actually plays out day to day. Plain-language on purpose; the real mechanics are footnoted per journey.

## The model these all share

**Describe → Practice → Remember.**

- **Describe** — you say what you want to learn; recallit builds the pack (citing where each card came from).
- **Practice** — each session you choose *how*: a quick **drill** or a back-and-forth **conversation**. Your call, and you can switch any day.
- **Remember** — the grade you earn sets when each item comes back. Do well, it returns later; struggle, it returns sooner. **The grade is identical no matter how you practiced**, and it's what drives the spacing.

One honest boundary running through every journey: **recallit decides what's due when you open it; it doesn't tap you on the shoulder yet.** These timelines are "the days you choose to show up." (Reminders on a schedule are coming, not shipping.)

*Under the hood (our terms, never the learner's): "drill" vs "conversation" = the `regimen`; the grade is the code-owned `EvalResult` from the grader registry (lexical for facts, the examiner for free-recall); "comes back in N days" = FSRS computing the next interval from that grade. Intervals below are illustrative.*

---

## 1. A book — Maya reads *Thinking, Fast and Slow*

She wants to actually retain the ideas, not just highlight them.

**Describe:** `recallit quickstart thinking-fast-slow-notes.md` → recallit reads her notes and builds mostly **checkable items** ("Explain the difference between System 1 and System 2") plus a few fact cards. Each cites the line it came from.

**Her choice:** **conversation.** She doesn't want to memorize sentences; she wants to explain ideas in her own words. `daily --regimen converse`.

| Day | What's waiting | How she practiced | A moment |
|---|---|---|---|
| 1 | 9 fresh ideas | Conversation | Explains "anchoring" loosely. Graded **Hard** (hit 2 of 3 points, missed the adjustment bias). It'll come back soon. |
| 2 | 4 (the shaky ones) | Conversation | Nails anchoring this time → **Good**. Pushed out a week. |
| 4 | 3 | Conversation | "Loss aversion" still fuzzy → **Again**. Back tomorrow. |
| 7 | 5 (a mix resurfacing) | Drill (busy day) | Quick pass; the facts she's solid on jump to ~2 weeks out. |
| 11 | 2 | Conversation | Explains System 1/2 cleanly, citing her own example → **Good**. |
| 14 | 1 | Conversation | Only the trickiest idea remains due. The rest are spaced weeks out. |

**Takeaway:** by week two she's *talking* about the book and the shaky ideas are the only thing in front of her. The examiner credited her paraphrases, never her wording.

---

## 2. A topic — Devin says "teach me World War 2"

No document, just curiosity on a commute.

**Describe:** `recallit quickstart "World War 2"`. recallit researches the web, builds a mix of **fact flashcards** (dates, names) and **checkable items** ("Explain why the invasion of Poland triggered declarations of war"), and flags it honestly: *web-grounded, attribution-only, verify before relying on it.* A few cards it couldn't pin to a source are held back, not invented.

**His choice:** **drill on weekdays** (fast facts on the train), **conversation on weekends** (the "why").

| Day | What's waiting | How he practiced | A moment |
|---|---|---|---|
| 1 | 14 fresh | Drill | Dates and names; misses a few → those return tomorrow. |
| 2 | 6 | Drill | The missed dates stick now → **Good**, spaced out. |
| 3 | 4 | Drill | Down to the stubborn ones. |
| 6 | 7 | Conversation | Weekend: explains the causes of the war out loud. One cause-and-effect is muddled → **Hard**. |
| 9 | 3 | Drill | Facts mostly weeks out now. |
| 13 | 4 | Conversation | The muddled causal chain, re-explained → **Good**. |

**Takeaway:** same pack, two modes depending on the day. Facts drilled fast; the reasoning earned a conversation. The honest "verify this" label kept him from trusting it blindly.

---

## 3. A language — Sofía keeps up her Mexican Spanish

The original use case, now just one option among many.

**Describe:** `recallit quickstart packs/spanish-mx-rgv` (a voice pack). Cards carry native audio. *(Voice needs a speech key; without it, it falls back to text.)*

**Her choice:** **voice / full** — she wants to hear it and say it. The session warms up by shadowing, drills due phrases, then a short roleplay.

| Day | What's waiting | How she practiced | A moment |
|---|---|---|---|
| 1 | 12 phrases | Voice (full) | Hears each, repeats aloud, answers spoken. A couple mispronounced → back soon. |
| 2 | 5 | Voice | Roleplay: ordering tacos. Produces a new phrase; recallit mines it into a card. |
| 5 | 8 | Voice | Solid phrases jump weeks out; two tricky ones linger. |
| 8 | 4 | Conversation | Tired of drilling — switches to pure conversation. Same grading, no flashcards. |
| 11 | 3 | Voice | The lingering phrases finally stick → **Good**. |
| 14 | 2 | Voice | Mostly maintenance now; a short roleplay to keep it warm. |

**Takeaway:** voice is a *choice*, not the whole product. She drilled, roleplayed, and one day just talked. The grade behind a spoken answer is the same code-owned score as a typed one.

---

## 4. A paper — Theo needs to present "Attention Is All You Need"

He has to explain it to his team Friday.

**Describe:** `recallit quickstart https://arxiv.org/abs/1706.03762` → **checkable items** ("Explain what self-attention replaces and why") plus key-term flashcards, each citing the paper.

**His choice:** **conversation**, because the test is whether he can *explain* it, not recite it.

| Day | What's waiting | How he practiced | A moment |
|---|---|---|---|
| 1 | 8 | Conversation | Explains self-attention; vague on positional encoding → **Hard**. recallit notes the weak spot. |
| 2 | 5 | Conversation | Re-explains positional encoding with the cited line in mind → **Good**. |
| 4 | 4 | Drill | Quick term check (Q, K, V) before a meeting. |
| 6 | 3 | Conversation | The "why no recurrence" answer is now crisp → **Good**. |
| 9 | 2 | Conversation | Dress rehearsal: explains the whole architecture end to end. |
| 13 | 1 | Conversation | One edge detail left due; he's ready for Friday. |

**Takeaway:** the conversation surfaced exactly what he *couldn't* explain, and kept resurfacing it until he could, with the paper's own lines as the check.

---

## The pattern across all four

- **Same engine, different feel.** A book felt like a seminar; a topic like a flashcard app then a debate; a language like a tutor you talk to; a paper like a rehearsal. The difference was one choice (`--regimen`), not four products.
- **The grade never moved with the modality.** Drill or conversation, typed or spoken, the score came from code checking the answer against the source, never from the model's mood.
- **Spacing did the remembering.** What you knew drifted weeks out; what you didn't kept showing up. Nobody scheduled it; it's just what was due when they opened the app.
- **Honesty was constant.** Web packs were labeled "verify me," unverifiable cards were held back, and a weak explanation was told it was weak, then brought back sooner.

> Marketing note: these journeys are the consumption story made concrete. "Practice your way" and "the right card at the right time when you show up" are true today. "It reminds you / brings you back on a schedule" is **not** — keep it a "coming" line until a scheduler ships.
