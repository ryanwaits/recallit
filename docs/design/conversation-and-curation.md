# The conversation layer + the adaptive card curator

> Status: decided (design, 2026-06-07). Captures two calls: (1) the conversation layer stays **separate and ungraded** — no "graded converse," and (2) conversation instead **feeds an adaptive, source-grounded card curator** that runs in the background and only acts at a threshold. Grading never leaves the code-owned card path. See also [tutor-multimodal.md](./tutor-multimodal.md) (the grading/examiner contract this builds on).

## The core decision: grading stays on the card path
We considered making a multi-turn conversation itself **gradeable** — talk about a topic, and the agent synthesizes a grade that drives the schedule. **We are not doing that.** It strains the one guarantee that defines recallit: *code owns the grade; the model can't talk its way to a better one.* When the agent both **asks** and **grades**, the failure mode is leading the witness (hint the answer, get agreement, credit it) — exactly the over-crediting our variance + stress tests flagged. So:

- **Grading is always a card turn** — lexical, or the examiner re-verifying a literal evidence span in the learner's own answer (`turn.ts` → `gradeResponse`). Free-recall is already graded this way; that's the conversational *answer* we keep.
- **The conversation never emits a grade and never moves a schedule.** It is a coach and a gap-finder.

## What the conversation layer *does*
The `converse` / socratic / roleplay phases (ungraded today) stay ungraded, and gain a job: **discovery and targeting.**
1. **Transparent depth-memory** — weak-spot/breakthrough notes to `context.md` (already shipped; today passive, read by the next session).
2. **Propose new or improved cards** aimed at the gaps it heard. It decides *what is worth assessing*; the card path still decides *the grade*.

The conversation has no grading power, so "leading the witness" simply has nowhere to land.

## Mined cards are source-grounded
`mine_card` (`src/mining.ts`) already mines **flashcards** from conversation (one-new-thing / i+1, dup-aware), used in roleplay. The extension: also mine **checkable items (rubric cards)**, with one honesty constraint —

> A rubric checkpoint must cite a verbatim line from the **source corpus**, not the chat. So the conversation **surfaces the gap**; the generator **grounds the new rubric in the pack's saved source** (`packs/<id>/.author/source.txt`) via the existing honesty gate (`packgen/gate.ts`).

The gate works *for* us here: it can only mint a rubric card for a gap the source can back. A conversation-only insight the source doesn't cover stays a depth-memory note, not a graded card. The constraint *is* the honesty.

## The adaptive curator (anti-bloat, by design)
Bloat is not solved by string dedup. It's solved by a **two-LLM, classify-and-act curation pass** that can also *improve* the deck, not just append to it:

- **Proposer (LLM #1)** drafts a candidate item from the conversation + source.
- **Classifier (LLM #2), independent of the proposer,** judges the candidate against the **existing card/item set** and assigns one of:
  - **new** — a genuine gap, not covered → add it (gated, lands `needs-review`).
  - **enhance** — overlaps an existing card but corrects/sharpens/extends it → **merge into that card** (not append-only) via the additive `pack edit` path, **preserving FSRS history**.
  - **redundant** — already covered → drop.
  - **conflict** — contradicts an existing card → flag for human review.
- **Separation of powers:** the proposer cannot approve its own card; the classifier cannot grade the learner. Mirrors the examiner's "model proposes, code verifies" — here "model proposes, an *independent* model classifies, then the gate + the learner confirm."
- **Code/gate still own the outcome:** every add/merge passes the source-grounding gate before landing; merges preserve schedule; nothing silently overwrites — changes land `needs-review` for a one-tap confirm (until the classifier is validated, see below).

## Background + threshold-gated (an ever-improving course)
The curator is a **low-priority background gardener**, not a constant process. It does nothing by default and **only springs into action above a threshold**:
- a gap repeatedly surfaced (depth-memory weight / recurrence),
- an importance/centrality signal for the topic,
- enough accumulated evidence to be worth a pass.

Result: the tutor's content/course quietly improves over time without churn or deck bloat — and respects the one-deploy-one-user model (a local background pass, never a server). It's the same shape as a periodic cadence pass: idle until it matters.

## Guardrails (the honesty contract, restated for this loop)
1. The conversation never grades and never moves a schedule.
2. Every mined or merged card is **source-grounded or held** (the gate).
3. The **classifier is independent of the proposer** (no self-approval).
4. Merges are **additive / FSRS-preserving** (the `pack edit` path), never destructive without a receipt.
5. **Threshold-gated and idle by default**; acts only above an importance/gap threshold.
6. Changes land **`needs-review`** (human confirm) until the classifier is validated.

## Real today vs. the build
- **Real:** `mine_card` (flashcards from conversation, one-new-thing, dup-aware); the depth-memory (`context.md` weak-spot notes); the honesty gate; the examiner; the additive, FSRS-preserving `pack edit` merge.
- **Build (gated):** mine **checkable/rubric** items grounded in the saved source; the **two-LLM classify-and-act curator** (new / enhance / redundant / conflict); the **background threshold trigger**; the merge-not-just-append path wired from curation; a `needs-review` confirm surface.

## Validation owed (before background auto-curation is trusted)
The classifier needs the same adversarial discipline the examiner got: a small re-runnable eval over real candidates measuring — does LLM #2 reliably (a) catch redundancy, (b) merge into the right card without losing meaning, (c) not hallucinate "new," (d) catch conflicts? Until those numbers hold, the curator runs **propose-and-confirm** (human in the loop), not silent background auto-apply.

## Why this is the right shape
Grading stays untouched on the honest card path (no leading-the-witness). The conversation becomes a genuine engine — it finds gaps and proposes coverage — while every change is gate-verified, history-preserving, and idle until it matters. The deck stays small and *better*, not just bigger.
