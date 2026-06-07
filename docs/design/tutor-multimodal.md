# Design: from packs to a source-grounded tutor agent (multi-modal, any content type)

> Status: proposed direction (from a 15-agent design workflow, 2026-06-06: map the engine → 5 independent framings → adversarial critique → synthesis). Explores the question "how do we tackle HOW people learn across content types — a non-fiction book, a speech, a history unit — not just language?" Sibling to [hosted-product.md](./hosted-product.md); that doc is the presentation/deploy shell, this is the learning-model generalization underneath it.
> Guardrail for the whole doc: **the engine is sacred and reused intact.** `turn.ts` gating, `scheduler.ts`/FSRS, and the agent-can't-override-rating invariant are NOT rebuilt. The only sacred-file touch is injecting a default grader at the single `evaluateAnswer` callsite (`turn.ts:31`). Honest-by-construction is non-negotiable.

## Thesis

recallit becomes a deployable, **source-grounded tutor agent** that teaches any content type across any modality — without ever faking determinism or inventing expertise.

The single generalization: stop hardcoding *"the recall unit is a flashcard graded by lexical string match."* Make the recall unit a **checkable item** carrying a code-evaluable acceptance spec (a rubric of source-grounded checkpoints), graded by a **pluggable-but-deterministic grader registry** behind the unchanged `EvalResult` contract.

- A **flashcard is the degenerate single-checkpoint case** — today's exact behavior, bit-identical.
- FSRS, the turn state machine's gating, and the honesty gate are **reused intact**.
- The rating is **always a pure function of an inspectable coverage vector** the user can audit. The model may at most *propose evidence that code re-verifies*, and may **never pick a rating**.
- The agent is the **expert-by-orchestration**: it sequences items, runs *ungraded* Socratic/teach-back over the existing `converse` primitive, and closes stretches with gated, code-graded checkpoints so retention still rides FSRS.
- v1 ships only the **model-free** grader tiers (lexical + deterministic coverage). Any model-assisted tier is deferred behind measured stability evidence and a hard "unconfident never grades, it holds" invariant.

One deploy = one user. Topic-agnostic. Reuse ≫ build.

## Decisions (resolved 2026-06-07)

These **supersede the more conservative defaults in the synthesis below** (which deferred all model-assist to Phase 4). The synthesis stands as the exploration record; this block is the chosen direction.

1. **Grading = Option C — agent-as-examiner, grade decomposed into evidenced checkpoints.** The agent runs the rich, contextual, Socratic examination as *ungraded* conversation. What feeds FSRS is **not** a holistic LLM rating — it is, per checkpoint, a scoped judgment: *"demonstrated? yes/no, + a verbatim evidence span quoted from the LEARNER'S answer."* Code re-verifies the span is literally in the answer (anti-fabrication — the gate pointed inward) and **counts** coverage → the 4-cardinal rating via the same deterministic map. The model reasons about *what* to probe and *how* to read a single point; it **never** emits a token into `{Again,Hard,Good,Easy}`. This promotes the synthesis's "deferred model-assisted extractor" to the **primary** free-recall mechanism — still gated on the variance spike (below) and the hard **"unconfident never grades, it HOLDS"** invariant.

2. **Two signals, kept separate.** (a) **FSRS** schedules *discrete recall* — checkpoints, facts, key claims; atomic and stable. (b) A separate **transparent "depth memory"** tracks *understanding* — the agent's user-readable notes on weak spots / misconceptions / what to probe next. It is **not** an FSRS curve and **not** a hidden score; it is inspectable text the learner can read, and it drives Socratic sequencing. Forcing "understanding" into FSRS ratings is explicitly rejected.

3. **Socratic method becomes a first-class phase.** Add a `socratic`/`elaborate` phase to the daily regimen (DATA in `dailyPhases`/`PHASE_GUIDE`, driven by the existing `converse` primitive) — the ungraded examination layer that produces the evidenced judgments and updates the depth memory.

4. **The honest line is unchanged and load-bearing.** Every grade is decomposed + evidenced + auditable: *"the agent examined you and here's exactly which points it checked — the line from your own answer, and the line from the source."* **Never** "the AI decided you understood." This is the wedge; do not trade it away.

**The gating spike is now P1 and runs FIRST.** Measure judgment **variance** — scoped-binary-with-evidence vs holistic rating — on a fixed answer set (including paraphrase pairs) over K repeats and temperatures. Metrics: replay consistency, inter-answer (paraphrase) consistency, evidence-span validity, false-hold rate. The **data picks the architecture**: if scoped-binary clears a measured stability bar → Option C ships; if not → fall back to deterministic Tier-2 coverage for the *grade* and keep the agent's brilliance in the ungraded layer. We do **not** build the examiner-grader until the numbers justify it. (This reframes Phase 1 below; the Tier-2 coverage grader becomes the fallback floor, and `graders/ordered.ts` + the extractor are no longer "Phase 4 maybe" but "shipped iff the spike passes.")

### Spike result (2026-06-07): Option C is VIABLE

110 real judgments (11 answers × 2 styles × 5 repeats), math computed in code (see `grading-variance-spike`, run `wf_b6ba8f5a-112`). Scoped (agent-examiner + code-counted evidenced checkpoints) beat holistic on every brand-critical axis:

| metric | scoped | holistic |
|---|---|---|
| replay consistency (same answer, 5 runs → same rating) | **1.00** (zero flicker) | 0.87 (4/11 crossed a band) |
| exact accuracy vs human gold | **0.91** | 0.73 |
| within-1-band accuracy | 1.00 | 1.00 |
| evidence-fabrication rate | **0.00** | n/a |

Directionally: scoped's single miss errs **safe** (under-credits a partial → FSRS just reviews it sooner); holistic's misses include **over-crediting** an answer that was literally missing a required checkpoint — exactly the failure the examiner exists to prevent. `evidence_fabrication_rate = 0` means every "demonstrated" claim cited a span literally present in the learner's answer — the auditability linchpin held.

**Validated thresholds** (fraction-based so any checkpoint count inherits them): `Easy = 1.0`, `Good ≥ 0.75`, `Hard ≥ 0.5`, `Again < 0.5`, with two **hard overrides**: (1) fabricated/unquotable evidence forces that checkpoint *undemonstrated*; (2) a flatly-wrong assertion alongside correct ones **caps the grade at Hard**.

**Honest caveats (these gate broader trust):** single small fixture; `replay = 1.0` is suspiciously clean (stress with borderline answers); **paraphrase consistency was only 2/3 — the real weak spot** (literal evidence-span matching can fail meaning-equivalent phrasings); fabrication = 0 was *not* adversarially stressed; the 50% Hard/Again floor is unvalidated; the human gold has no inter-rater check.

**Next:** build `mapCoverageToRating` + the two overrides as a **pure function now** (the 11-row fixture is its first unit test) — it's deterministic and serves both the fallback floor and the examiner's recount. Gate wiring the **LLM examiner as the live FSRS grade source** behind an expanded adversarial stress test (more packs/checkpoint-counts, a paraphrase + near-miss-citation suite, a second human gold), with scoped shadowing holistic until it clears. Fall back to deterministic-coverage-only if replay drops below ~0.95 or fabrication goes nonzero on the bigger set.

### From the first real generation (PG essay, 2025): the floor's limit + the examiner-grader design

Authoring on a real essay (`pack https://paulgraham.com/goodwriting.html`) produced 3 well-grounded rubric/explain cards (the gate accepted them). Grading the **exemplar** answer through the **model-free `checkCoverage` floor** scored it `Again` (0/2 required) — the claims aren't literal substrings of real prose. So, made explicit:

- **The deterministic floor is near-verbatim recall ONLY** (a term/definition where the answer text ≈ the claim). It is **not** a free-recall comprehension grader and must never be sold as one. An `explain`/`coverage` card graded by the floor alone will harshly under-credit real answers — a footgun until the examiner is wired.
- **The LLM examiner is load-bearing for comprehension**, not optional. "Fall back to deterministic coverage" is a weak floor, useful only for near-verbatim items.

**Examiner-grader execution design (gated on the stress test):** the examiner is an *async* LLM call, but `Grader` is sync (`turn.ts respond()`), and the rating must stay code-owned (`tracker.ratingFor`). So the examiner does NOT become a sync grader. Instead: during the agent's turn it produces, per checkpoint, `{demonstrated, evidence = verbatim span of the learner's answer}`; **code re-verifies each span is literally in the answer (the gate pointed inward) and recounts via the pure `mapCoverageToRating` we already shipped** → an `EvalResult` that flows through the existing `ratingFor` slot (the agent still cannot pick the rating). Implementation when (b) passes: either make `respond()` await an async grader (turn gating unchanged, only the grader call becomes awaitable) or have the agent submit the evidenced judgments via a tool that feeds the same evaluation slot. Either way the recount + thresholds are the code we already have.

**Gate refinements applied (2025):** `checkCardQuality` length heuristic is now flashcard-only (`longAnswerOk` for checkable items) so explain exemplars aren't flagged; the gate still correctly held an agent-inserted ungrounded proper noun ("PG"). Open author-side nudge: tell the author not to refer to the source's author by name/initials unless quoted.

### Examiner stress test (b): PASSED — ship behind a flag

100 real examiner judgments across 4 cards (the synthetic seasons rubric + the 3 real PG rubrics), stressed with paraphrase clusters + near-miss-citation bait. Verdict: **examiner-ready-as-live-grade-source**.

| metric | result | bar |
|---|---|---|
| mean replay consistency | **0.98** | ≥ ~0.95 ✓ |
| exact accuracy vs gold | 0.90 (within-1-band 1.00) | — |
| paraphrase-cluster consistency | **3/4** (up from the spike's 2/3) | — |
| evidence-fabrication rate (under bait) | **0.00** | == 0 ✓ |
| bait false-credit | **0 / 4 answers (0 / 20 runs)** | == 0 ✓ |

The two brand-critical axes are clean: **zero fabrication even under adversarial near-miss bait**, and **not one bait answer got any required checkpoint credited** — the over-crediting failure that sinks a holistic LLM-judge. The one imperfection is a single paraphrase cluster splitting **Good↔Easy** — a *spacing* flicker (caused by the bonus-all → Easy lift in `mapCoverageToRating`), never a pass/fail or credit/no-credit flicker. **Tune:** don't let bonus coverage alone flip Good→Easy.

**Flipped ON by default (2025):** the examiner is the default `coverage` grader (`RECALLIT_EXAMINER=0` opts out to the floor / offline). Rationale: the deterministic floor *can't* grade free-recall (scores paraphrases `Again`), so defaulting coverage cards to the examiner is the more honest default; it's low-risk because no coverage packs are in use yet, and an examiner that can't judge HOLDs (throws) rather than mis-grading. Owed before treating this as proven-at-scale: a **second human gold** (current gold is single-author), **more packs/checkpoint counts**, true shadow-logging, and graceful held-card handling in a live session (today a hold throws). Harness re-run after the Good-cap tune: replay 1.000, accuracy 1.000, paraphrase 4/4, fabrication 0, bait 0/4.

**Integrity caveat (from the verdict agent, kept honest):** these two workflows validated the *approach* — they simulated the examiner via judging prompts; the actual `examinerGrader` + a re-runnable harness + the fixtures do **not** exist in the repo yet (only the deterministic floor does). The numbers green-light *building* the examiner, not flipping it on in prod. So the build order is: (1) implement the examiner grader behind a flag, with the deterministic floor as the "unconfident → HOLDS" fallback; (2) **commit the fixtures + a reproducible harness** so this is re-executable, not ephemeral; (3) shadow-mode it against the floor and log divergences before it drives FSRS; (4) tune the bonus→Easy lift; (5) expand fixtures + a second human gold before unflagging widely.

## The generalized model — the "checkable item"

A superset of today's `RecallCard`, with **zero schema migration** — it rides the existing free-form `meta` dict (`z.record(z.string(), z.unknown())` on `PackCard.meta` (`pack.ts:35`) and `RecallCard.meta` (`types.ts:36`)).

| field | meaning |
|---|---|
| `type` | free-form (`vocab\|sentence\|recall\|explain\|apply\|ordered`) — selects the grader |
| `front` | the prompt/cue ("say this phrase" / "explain why X" / "list the steps") |
| `back` | canonical/exemplar answer (kept for lexical types + human review) |
| `meta.grader` *(new)* | `"lexical" \| "coverage" \| "ordered"`; absent ⇒ `lexical` |
| `meta.rubric` *(new)* | ordered `Checkpoint[]` |

`Checkpoint = { id, claim (short canonical string), aliases?: string[], required: boolean, sourceQuote (verbatim substring of corpus) }`.

**The flashcard is exactly** `rubric = [{ claim: back, required: true }]` with `grader = lexical` — today's code path, untouched.

### Pluggable-but-deterministic grading

A grader **registry** `Record<GraderName, (response, card, opts) => EvalResult>` with a dispatcher `gradeResponse(card, response)` that reads `card.meta.grader` (default `lexical`; **fail-closed** on an unknown name — never silently degrades to "agent decides"). Every grader emits the unchanged `EvalResult { rating, score, reasons[] }`, so FSRS (`scheduler.ts`) is agnostic to *how* the rating was computed.

The dispatch seam is injected at `turn.ts:31` — `tracker.respond` currently hardcodes `evaluateAnswer(response, card.back)`; it becomes an injected grader (default = today's `evaluateAnswer`), so the present→respond→reveal→graded gating and `ratingFor` (agent-can't-override) stay **byte-for-byte intact**.

- **Tier 1 — lexical** = `evaluateAnswer` verbatim (exact→Easy, normalized→Good, sim≥0.7→Hard, else Again).
- **Tier 2 — coverage** (pure, model-free): for each checkpoint, reuse `normalize()`/`tokenize()` to decide HIT (claim or any alias matches in the answer) vs MISS; a pure `mapCoverageToRating(requiredHit, requiredTotal, bonusHit)` maps the vector → 4-cardinal rating. `reasons[]` carries the **coverage receipt** ("3/4 required: hit gravity, distance, orbit; missed tidal-lock → Hard"). Reproducible by construction, FSRS-safe.

## Modality matrix — content type × how it's known × assessment × grading

| Content type | "Knowing it" means | Modalities | Assessment | Grading |
|---|---|---|---|---|
| **Language phrase/vocab** (RGV Spanish, today) | Produce the target phrase on cue | voice push-to-talk · text · static flip-and-listen | cued-recall item, `rubric=[back]`; shadowing/roleplay via ungraded `converse`; new items via `mine_card` (i+1) | **Tier 1 lexical** (incl. voice STT transcript, same rule) |
| **Non-fiction book / article** | Free-recall the key claims in your own words | text review · static study-guide + MCQ · teach-back over `converse` | free-recall item: N gate-verified checkpoints; teach-back is ungraded `converse`, closes on ONE gated answer | **Tier 2 coverage** (never model-judged) |
| **Speech / lecture / argument** | Recover thesis + supporting points | text review · static summary+quiz · Socratic recap | free-recall checkpoints on thesis + entities/dates; recap ungraded, durable bits mined | Tier 2 coverage + Tier 1 cloze for discrete facts; **ordering unbuilt in v1** |
| **Procedure / how-to / proof** | Reproduce the required steps in order | text review · static cheat-sheet | ordered item: steps as checkpoints | Tier 2 coverage (presence) first; deterministic LCS ordered grader deferred |
| **Factual recall / dates** | Pick/fill the correct discrete answer | text · voice · static MCQ | cloze/fill; static MCQ scored offline by exact `answerIndex` | Tier 1 lexical (`back` accepts `string[]`); MCQ = exact-key code score |
| **Code repo / API** | Name the symbol, state the contract, fill the call | text review · static study-guide · application Q&A | api/concept cards grounded in real code spans; app dialogue ungraded → mine | Tier 1 lexical on symbol; Tier 2 coverage for multi-point contracts |

## Tutor architecture — the agent is the expert *by orchestration*

The tutor is the **existing in-process Claude agent** (`agent.ts`, same query loop, same MCP tools), per-deploy specialized to ONE pack. Its expertise **is the pack** — cards + scenarios + `context.md` + each checkpoint's verbatim `sourceQuote` — not the model's parametric memory.

Division of authority is the whole design:
- the **agent** decides *what* to present and *when* to drop from dialogue into a checkpoint (pedagogy/sequencing, bounded by FSRS due-order);
- **FSRS** decides *when* an item is due;
- the **grader registry** decides the *grade*. The agent owns only the first.

Per-session loop, all over existing tools: (1) read due items + objective context; (2) present via `present_card → await_user_response → reveal_answer → grade_card`, where `grade_card` still routes through `gradeTurn → tracker.ratingFor` (`review.ts:43-49`) so the agent structurally cannot pick the rating — now backed by the dispatched grader; (3) free-recall/teach-back runs as short **ungraded `converse`** (`agent.ts:158` — already card-less, no FSRS contact), then closes on a SINGLE gated final answer that coverage-grades; (4) explain misses *after* the graded turn, citing the missed checkpoint's `sourceQuote`; (5) `mine_card` converts genuinely-new single elements into gradeable items.

Author-time is the other half: `runPackAuthor` emits `rubric[]` with a verbatim `sourceQuote` per checkpoint and never installs; `gateCards` holds back any checkpoint whose quote isn't literally in the corpus. **One harness, two prompts (author / tutor), both honest at their respective times.**

## The honest grading contract

**Allowed:** the rating is always a pure code-owned function of an inspectable coverage vector; the agent calls `grade_card` with only a `card_id` and receives the code-computed rating + receipt (it may *explain* but not choose); every checkpoint claim traces to a `gateCards`-verified verbatim `sourceQuote`; the receipt surfaces via `EvalResult.reasons[]` labeled "coverage vs this pack's rubric," never "comprehension score."

**Forbidden (brand-violation line):** a model emitting "this deserves a Good" (no model token ever in `{Again,Hard,Good,Easy}`); semantic/embedding grading in v1 (it makes FSRS ratings inconsistent across paraphrases and destabilizes scheduling); the agent asserting any mid-session fact it can't ground in a `sourceQuote`; silently swapping a card's grader after it has FSRS history.

**Deferred model-assist (NOT v1), and only if it earns it:** a model may act *only* as a constrained **extractor** returning `{checkpoint_id, present, evidence_span = verbatim substring of the learner's answer}`; code re-verifies the span is literally in the answer (the `gateCards` trick pointed inward) so the model can't fabricate coverage; code alone counts coverage → rating. Honest limits the critiques surfaced: the inward check stops *fabrication*, not *misjudgment* (present/absent stays a model artifact); a `hash(answer+rubric)` cache fixes replay drift but **not inter-answer drift**, which is what corrupts FSRS. So model-assist ships only behind a hard **"unconfident never grades, it holds"** invariant (tested) and only after measured false-hold rate + inter-answer-consistency prove "deterministic-enough."

## Phased roadmap (reuse-first, smallest-valuable-first)

| Phase | Goal | Builds (reuses in italics) | Effort |
|---|---|---|---|
| **0 — prove the seam is inert** | Grader registry + dispatcher behind the unchanged `EvalResult`; today's behavior **bit-identical** | `graders/registry.ts` (fail-closed dispatcher, default lexical); inject grader at `turn.ts:31`; **regression gate: byte-identical ratings on all existing packs + green suite**. *Reuses `evaluateAnswer`, turn gating, FSRS, `EvalResult`.* | S |
| **1 — first model-free grader** | A free-recall `explain` item is coverage-graded deterministically and rescheduled by FSRS, every checkpoint citing a verbatim quote | `graders/coverage.ts` (pure, unit-tested); rubric generation in `packgen/author.ts`; extend `gateCards` by **iteration** over `rubric[]` (new reason codes); **FSRS-stability test** (reproducibility + inter-answer consistency) to *derive* thresholds; coverage-receipt rendering. *Reuses `normalize`/`tokenize`, `gateCards`, `meta`, `reasons[]`.* | M |
| **2 — tutor loop + share/export wedge** | Drop a source → honest study kit → practice with the tutor; teach-back over `converse` closes on one coverage-graded checkpoint; static kit is the shareable artifact | study-kit export (summary + study-guide + **code-scored MCQ** with gated stems; distractors honestly not corpus-gated); generalize `PHASE_GUIDE`/`dailyPhases` with non-language phases as **data**; surface study-guide as read-only tutor context. *Reuses `converse`, `mine_card`, `buildPackExport`, `context.ts` prompts.* | M |
| **3 — surfaces + deploy framing** | One deploy = one source-grounded tutor, any modality; branded SPA + "deploy your own" + generate→study→speak filmstrip | coverage-receipt + held-state rendering in SPA phase rail and over voice (read missed `sourceQuote` aloud); marketing held to the honest line. *Reuses the SPA/WS, `/api/packs`+`topicId` seam, voice providers, `installPack`.* | M |
| **4 — DEFERRED, evidence-gated** | Higher paraphrase recall + order-sensitive grading, *only if measured stability earns it* | `graders/ordered.ts` (deterministic LCS, model-free, ships independently); constrained model extractor behind the hard hold-on-unconfident invariant + measured bars; off by default. | L |

## Open questions
1. What concrete coverage thresholds (required-hit floor for Hard vs Again; alias tolerance) keep FSRS stable on real free-recall? Phase 1's stability test must *produce* these, not guess.
2. `mine_card`'s i+1 (one-new-token) rule **throws** on most multi-token prose insights (`mining.ts:62`). Do we add a "capture this checkpoint" path for non-language packs that bypasses the one-token rule but keeps the gate — and does that weaken the i+1 guarantee for language?
3. Rubric **quality** has no deterministic floor (the gate proves a quote is present, not that the checkpoint matters). What needs-review step catches well-grounded-but-hollow rubrics?
4. Does the **zero-key static study-kit** wedge lead, or the **active tutor** loop? (Sequencing of Phase 2.)
5. Voice teach-back: STT transcripts are noisy — does coverage-grading false-MISS too often? Should voice free-recall stay ungraded `converse` + a typed closing answer? **(This is exactly where paused Free Mode plugs in.)**
6. Will the model-assisted extractor ever clear the stability bar, or do we accept lexical + pure coverage as the honest ceiling and keep the rest as ungraded `converse` forever?

## What this is NOT
- Not a semantic/embedding grader and **not an LLM-judge** — no model ever picks a rating.
- Not an engine rebuild — the only sacred-file touch is the injected default grader at `turn.ts:31`.
- Not a curriculum graph / prerequisite engine / concept-mastery model — FSRS tracks *items*; any "chapter 70%" is a read-only retention% label over FSRS state grouped by tag.
- Not order-sensitive grading in v1 — argument/procedure ordering is explicitly unbuilt; the matrix sells only checkpoint **presence** until the LCS ordered grader ships.
- Not "a tutor that knows you understand the chapter" — deep comprehension lives in the **ungraded `converse` layer** and is not measured by FSRS.
- Not a claim that teach-back richly grows the deck — `mine_card`'s i+1 rule rejects most prose insights.
- Not multi-tenant SaaS — one deploy = one user.
- Not a guarantee gated content is **true** — the gate proves a verbatim quote is present, not that it entails the claim. The promise is "every checkpoint cites a line you can check," not "every checkpoint is correct."

## How this relates to Free Mode (paused) and the hosted shell
- **Free Mode** was paused pending this synthesis — and Q5 answers it: in this model, Free Mode is **ungraded `converse` practice** with occasional gated, code-graded checkpoints (typed or high-confidence). Voice free-recall likely stays *ungraded* (noisy STT would false-MISS coverage); the graded close-out is a clean typed/confident answer. So Free Mode = the conversational surface of the same "agent orchestrates, code grades" loop.
- **hosted-product.md** (the SPA, gallery, `/api/packs`, deploy button) is the *presentation* layer; this doc is the *learning-model* layer it surfaces. Phase 3 here = that shell, now rendering coverage receipts + held states honestly.
