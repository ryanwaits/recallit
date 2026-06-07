# internals

The deep "how it really works, and why it stays honest" reference for recallit's **generalized learning model**: the checkable item, the pluggable‑but‑deterministic grader registry, `mapCoverageToRating`, the examiner honesty contract, and the FSRS + turn‑machine seams the whole thing rides without changing.

This is an internal technical guide. It describes the code as it exists, not aspirations. Where a capability is gated, costs API spend, or is unproven at scale, it says so.

---

## 1. The one invariant everything protects

> **The rating is computed by code. A model can propose evidence; it never picks a grade.**

FSRS scheduling quality depends on *consistent* ratings. If a model could decide "Good vs Hard," the schedule would drift with the model's mood, and the honesty story collapses. So every grading path in recallit funnels through pure, code‑owned functions, and the model — when it's involved at all — is reduced to a constrained role: *produce per‑checkpoint judgments with verbatim evidence*. Code re‑verifies that evidence and counts the rating.

This invariant has three structural enforcers, in increasing order of subtlety:

1. **The turn machine** (`src/turn.ts`) gates *when* a rating can exist (only after a response).
2. **The grader registry** (`src/graders/registry.ts`) is the *single* grading entry point — there is no second path to a rating.
3. **The examiner recount** (`src/graders/examiner.ts`) is the *inward gate*: the model's claimed evidence must literally appear in the learner's own answer, or it's dropped.

---

## 2. The recall unit, generalized: the "checkable item"

The original recall unit is a flashcard: `front` / `back`, graded by string comparison. The generalized unit is a **checkable item** — a card carrying a **rubric** of source‑grounded checkpoints.

A card is a checkable item **iff** `card.meta.rubric` is present and non‑empty. Otherwise it is a plain flashcard and behaves bit‑identically to before this seam existed.

### `RubricCheckpoint` (`src/graders/coverage.ts`)

```ts
interface RubricCheckpoint {
  id: string;
  claim: string;
  aliases?: string[];
  required: boolean;
  sourceQuote?: string; // verbatim substring of the source corpus; gateCards verifies it at pack time
}
```

- `required` checkpoints drive the rating; non‑required ("bonus") checkpoints are **informational** — they appear in the receipt but do not lift the grade (see §5).
- `sourceQuote` is the honesty anchor. The pack‑generation honesty gate (`src/packgen/gate.ts`, `gateCards`) verifies it is a literal substring of the saved corpus before the card is allowed to ship. A checkpoint whose quote is absent fails closed (the whole card is held for review). That gate is documented separately; here it matters only as the reason a checkpoint's grounding can be trusted at grade time.

A checkable item selects the `coverage` grader via `card.meta.grader: "coverage"`. Type is typically `explain` (free‑recall), not a single‑answer flashcard.

---

## 3. The grader registry — one entry point, fail‑closed dispatch

`src/graders/registry.ts` is the seam that lets the recall unit generalize without ever introducing a second way to produce a rating.

```ts
export type Grader = (card: RecallCard, response: string) => EvalResult | Promise<EvalResult>;

const REGISTRY: Record<string, Grader> = {
  lexical,                          // tier 1 — today's flashcard behavior, verbatim
  coverage: examinerCoverageGrader, // tier 2 — checkable items
};

export function graderName(card: RecallCard): string {
  return (card.meta?.grader as string | undefined) ?? "lexical";
}

export async function gradeResponse(card: RecallCard, response: string): Promise<EvalResult> {
  const grader = REGISTRY[graderName(card)];
  if (!grader) throw new Error(`unknown grader "..." for card ...`);
  return await grader(card, response);
}
```

Load‑bearing properties:

| Property | Why it matters |
|---|---|
| **Default is `lexical`** | A card without `meta.grader` is a flashcard, graded exactly as before the registry existed. No migration, no behavior change. |
| **Unknown grader names throw** | Fail‑closed. A typo or unregistered name never silently degrades to "the agent decides." |
| **`gradeResponse` is the *only* entry point** | Both the turn machine (`turn.ts`) and the CLI call it. There is never a second grading code path. |
| **`Grader` may be sync or async** | Lexical is sync; coverage may call the model. `gradeResponse` always `await`s, so callers don't branch. |
| **`registerGrader(name, grader)`** | Used by tests to inject graders. The registry is global and mutable; new tiers register here. |

---

## 4. Grading execution path — sync lexical vs async examiner

### Tier 1 — lexical (`src/evaluate.ts`)

`evaluateAnswer(answer, target)` is pure, synchronous, deterministic. It is the *only* tier that can award **Easy**.

1. **`normalize(s)`** — NFD, strip diacritics, lowercase, drop non‑alphanumeric/space (`\p{L}\p{N}\s` only), collapse whitespace.
2. Ladder:
   - Exact match after trim (raw, before normalize) → **Easy**, score 1.
   - Equal after `normalize` (accent/case/punctuation‑only difference) → **Good**, score 0.95.
   - Else compute `similarity` and compare to `hardThreshold` (default **0.7**):
     - `similarity ≥ 0.7` → **Hard** ("near miss").
     - else → **Again** (empty answer is always Again).
3. **`similarity(a, b)`** = `max(editSimilarity, 0.6·editSimilarity + 0.4·tokenJaccard)`. The blend lets a single‑token typo (Jaccard 0) still score on edit distance, while reordered/partial phrases benefit from token overlap.

`target` may be a string or array (any acceptable answer matches).

### Tier 2 — coverage (`src/graders/coverage.ts`, `src/graders/examiner.ts`)

For a checkable item, hits/misses per checkpoint come from one of two sources, then both flow into the **same** pure rating function:

```
                        ┌─ examiner ON (default) ─► examineAnswer (model) ─► recountExaminer (code re-verify span)
checkable item ─►       │                                                            │
checkCoverage / examiner│                                                            ▼
                        └─ examiner OFF (CI/offline) ─► checkCoverage (model-free) ─► CoverageVector
                                                                                     │
                                                                                     ▼
                                                                          mapCoverageToRating  (pure, code-owned)
```

The grader registered for `coverage` is `examinerCoverageGrader`:

```ts
export const examinerEnabled = () => process.env.RECALLIT_EXAMINER !== "0"; // ON by default

export async function examinerCoverageGrader(card, response) {
  const rubric = card.meta?.rubric;            // throws if absent/empty
  if (examinerEnabled()) {
    const judgments = await examineAnswer({ front: card.front, rubric, answer: response });
    if (!judgments) throw new Error(`examiner held on card ...: no confident judgment`); // HOLD
    return recountExaminer(rubric, response, judgments).result;
  }
  return coverageResult(checkCoverage(rubric, response)); // deterministic floor
}
```

- **Examiner ON (default):** the model decides demonstrated/not + cites a span; code re‑verifies and counts. Costs one Claude call per checkpointed turn (`ANTHROPIC_API_KEY` required). Default model `claude-sonnet-4-6`.
- **Examiner OFF (`RECALLIT_EXAMINER=0`):** the deterministic floor only. `checkCoverage` matches a checkpoint when its `claim` (or an alias) is a substring of the normalized answer. This is **near‑verbatim only** — real paraphrases without the literal claim tokens false‑miss. Use for CI/offline/deterministic runs.

---

## 5. `mapCoverageToRating` — the validated, pure core

This is the function that converts evidence to a grade. It never sees the model; it counts.

```ts
export function mapCoverageToRating(v: CoverageVector): EvalRating {
  const reqFrac =
    v.requiredTotal > 0 ? v.requiredHit / v.requiredTotal
    : v.bonusTotal > 0  ? v.bonusHit / v.bonusTotal
    : 0;

  let rating: EvalRating;
  if (v.requiredTotal > 0 && v.requiredHit === v.requiredTotal) rating = "Good";
  else if (reqFrac >= 0.5) rating = "Hard";
  else rating = "Again";

  if (v.contradiction && rating === "Good") rating = "Hard"; // a wrong claim never beats Hard
  return rating;
}
```

`CoverageVector` = `{ requiredHit, requiredTotal, bonusHit, bonusTotal, contradiction? }`.

### The thresholds

| Condition | Rating |
|---|---|
| All required checkpoints hit | **Good** |
| ≥ 50% of required hit (but not all) | **Hard** |
| < 50% of required hit | **Again** |
| `contradiction` present alongside otherwise‑Good coverage | capped to **Hard** |

### Why coverage tops out at Good (never Easy)

Easy is a **lexical / exact‑recall** signal only (`evaluateAnswer`). Coverage grading — deterministic or examiner — cannot reliably distinguish "complete" from "effortless." Empirically, letting bonus coverage lift Good→Easy produced the single paraphrase flicker the stress test found, so bonus checkpoints stay informational (shown in the receipt, never a rating lift). This is an *empirical* choice from one observed flicker, not a theoretical proof.

### Fractions generalize

`reqFrac` is a fraction, so the mapping is independent of checkpoint count (2 or 5 checkpoints, same thresholds).

---

## 6. The examiner honesty contract: produce → re‑verify span → recount → (or) HOLD

The examiner is the only place a model touches grading, and it is deliberately boxed in.

### Step 1 — produce (`examineAnswer`)

One‑shot Claude call, `maxTurns: 1`, no tools. The system prompt instructs the model to judge each checkpoint *by meaning, in any wording*, but to copy a **verbatim substring of the learner's answer** as `evidence` (empty when not demonstrated). It must output only JSON:

```json
{"judgments":[{"checkpointId":"<id>","demonstrated":true,"evidence":"<verbatim span>"}]}
```

The model's *only* job is the judgment array. It is never asked for, and never emits, a rating.

**Failure → HOLD, never a guess.** `examineAnswer` returns `null` on any transport/auth error or any unparseable/non‑confident result (`parseJudgments` tolerates `checkpointId`/`checkpoint_id`, coerces `demonstrated` to strict `=== true`, defaults missing evidence to `""`). The grader then **throws** (`examiner held on card ...`). HOLD propagates as a turn error — the caller must handle it (retry, ask for a typed answer, skip). It never silently degrades to the floor.

### Step 2 — re‑verify the span (`recountExaminer`) — the inward gate

This is the anti‑fabrication move: the honesty gate, pointed *inward* at the learner's answer.

```ts
export function recountExaminer(rubric, answer, judgments): ExaminerRecount {
  const hay = normWS(answer);                 // lowercase, collapse whitespace, trim
  const valid = new Set<string>();
  let fabricated = 0;
  for (const j of judgments) {
    if (!j.demonstrated) continue;
    const ev = normWS(j.evidence);
    if (ev.length > 0 && hay.includes(ev)) valid.add(j.checkpointId); // span literally present
    else fabricated++;                          // claimed, but the cited span isn't in the answer
  }
  // count only `valid` checkpoints into a CoverageVector → coverageResult → mapCoverageToRating
}
```

- A `demonstrated: true` checkpoint counts **only if** its evidence span is a literal (whitespace/case‑normalized) substring of the answer.
- Unverifiable claims are **dropped** (counted as `fabricated`, treated as not demonstrated) and surfaced in the receipt: `"N unquotable claim(s) dropped"`.
- Empty evidence on a `demonstrated: true` claim is treated as fabricated.

### Step 3 — recount

The surviving valid checkpoints become a `CoverageVector`, which goes through the same pure `mapCoverageToRating` as the deterministic floor. **The rating is code's, every time.**

### What this gate does and does not catch

| Catches | Does NOT catch |
|---|---|
| **Fabrication** — the model citing evidence not in the answer | **Misjudgment** — the model citing a literally‑present span that doesn't actually entail the checkpoint (e.g. quoting "he walks the dog" as evidence for "astronomy expertise") |

`recountExaminer` checks *presence*, not *entailment*. The inward gate stops fabrication, not semantic nonsense. This is why model‑assisted grading is labeled experimental; the floor (model‑free coverage) or ungraded converse are the fallbacks.

---

## 7. The seams it rides without changing: FSRS + the turn machine

The generalized model was designed to add zero new ways to mutate a schedule. It rides two existing seams.

### The turn machine (`src/turn.ts`)

A per‑session, in‑memory state machine: `presented → responded → revealed → graded`. It gates *when* a rating exists.

```ts
async respond(card, response): Promise<EvalResult> {
  this.require(card.id, ["presented", "responded"], "respond");
  const evaluation = await gradeResponse(card, response); // ← the ONLY change for tier 2: await
  turn.response = response; turn.evaluation = evaluation; turn.phase = "responded";
  return evaluation;
}
reveal(card)        { /* require ["responded","revealed"]; throws if no evaluation */ }
ratingFor(cardId)   { /* returns the already-computed evaluation; never agent-supplied */ }
```

Invariants the tier‑2 generalization preserves exactly:

- **Answer before reveal.** `reveal()` and `ratingFor()` throw `TurnError` if `respond()` hasn't run.
- **Rating is the engine's.** `ratingFor` returns the evaluation computed inside `respond()` — there is no path for agent input to reach the rating.
- **The only change** for checkable items was making `respond()` `await gradeResponse` (the examiner is async). The gates (`reveal`, `ratingFor`) are still synchronous and unchanged.
- **HOLD propagates as a turn error**, not a silent fallback. A throwing grader surfaces as a `respond()` rejection the caller must handle.

The `TurnTracker` is session‑scoped and in‑memory (`Map<cardId, Turn>`); there is no persistence across requests.

### FSRS scheduling (`src/scheduler.ts`)

Unchanged by the generalization. The grader produces an `EvalRating` (`"Again" | "Hard" | "Good" | "Easy"`); `toGrade` maps it to the ts‑fsrs numeric `Grade` (Again=1, Hard=2, Good=3, Easy=4); `gradeCard`/`reviewCard` apply `scheduler.next(...)`.

- `getScheduler` uses FSRS‑6 via `ts-fsrs` with `request_retention: 0.9`, `enable_fuzz: true`.
- `toGrade` **throws** on the non‑review `"Manual"` rating and on out‑of‑range numbers — agent‑supplied junk can't reach FSRS, because nothing reaches FSRS except a code‑computed `EvalRating`.
- `previewSchedule` shows the four next‑due outcomes (for "next due per button" UIs); both `gradeCard` and `previewSchedule` accept an optional `now` for testing.

The key seam: a coverage `EvalResult` is the *same shape* as a lexical one (`{ rating, score, reasons }`). FSRS never knows whether the rating came from a string compare or a re‑verified examiner recount.

---

## 8. The `EvalResult` receipt

Every grader returns the same structure, so the surfaces (CLI, SPA grade chips, `onGraded` callback) render uniformly:

```ts
interface EvalResult { rating: EvalRating; score: number; reasons: string[]; }
```

`coverageResult` builds a human‑readable receipt, e.g.:

```
coverage vs rubric: 2/3 required, 1/1 bonus; contradiction (capped at Hard) -> Hard
```

The examiner recount appends `"N unquotable claim(s) dropped"` when fabrication was caught. The receipt is what makes grading legible — every grade can be explained from its `reasons`.

---

## 9. Validation methodology and the numbers

The thresholds and the examiner contract were validated by a variance spike, an adversarial stress test, and a re‑runnable in‑repo harness. **Honesty note:** these numbers come from a small, single‑author fixture set. They establish the approach; they do **not** prove it scales. No coverage card is in production yet.

### The harness (`scripts/examiner-harness.ts`)

Run it (calls the real model — needs `ANTHROPIC_API_KEY`):

```bash
bun run examiner:harness                          # REPEATS=3 (default)
REPEATS=5 bun run examiner:harness                # match the original workflow
EXAMINER_MODEL=claude-opus-4-8 bun run examiner:harness
```

It runs the real `examineAnswer` over committed fixtures (`test/fixtures/examiner-fixtures.json`) `K` times each, recounts with the code‑owned `recountExaminer`, and reports the brand‑critical metrics:

| Metric | What it measures | How it's computed |
|---|---|---|
| **replay consistency** | same answer → same grade across `K` runs | mean modal‑rating frequency per answer |
| **exact accuracy** | modal rating == human gold | fraction matching `gold` |
| **within‑1‑band** | modal rating within one FSRS band of gold | `|RANK(modal) − RANK(gold)| ≤ 1` |
| **paraphrase consistency** | paraphrase clusters land on the same grade | clusters where all members share one modal rating |
| **evidence fabrication** | unquotable spans the recount dropped | sum of `recountExaminer.fabricated` across all trials |
| **bait false‑credit** | near‑miss bait answers wrongly credited on a required checkpoint | bait answers with any verified required credit in any run |
| **HOLDs** | answers the examiner couldn't confidently judge | modal rating == `HOLD` |

### Reported results

- **Variance spike** (thresholds): scoped replay **~1.00**, exact accuracy **~0.91**. This is what justified the all‑required‑for‑Good mapping (rather than `≥0.75`) — it scored highest without over‑crediting.
- **Stress test** (4 fixtures, ~100 real judgments stressed with paraphrase clusters and near‑miss bait):
  - replay consistency **0.98**
  - exact accuracy **0.90**
  - paraphrase consistency **3/4** (the known weak spot)
  - evidence fabrication **0**
  - bait false‑credit **0/4 answers**

### Known weak spots and what's still owed

| Caveat | Status |
|---|---|
| Single‑author human gold | No inter‑rater check yet |
| Paraphrase consistency 3/4 (75%) | Literal span re‑verify can't rescue a meaning‑equivalent phrasing the model judged differently |
| 50% Hard/Again boundary | Not independently validated; an off‑by‑one canary test is kept in `test/coverage.test.ts` |
| Replay ~1.0 looks suspiciously clean | Needs more borderline/adversarial answers |
| Examiner not stability‑gated in production | ON by default, but fixtures+harness are validation, not proof at scale |
| Rubric quality has no deterministic check | `gateCards` proves the `sourceQuote` is present, not that the checkpoint *matters* or is *correct* — a grounded‑but‑hollow rubric passes |

Owed before claiming production confidence: a second human gold, a broader fixture set, shadow‑logging examiner divergences against the deterministic floor, and graceful HOLD handling in a live session.

---

## 10. Operational reference

| Concern | Setting / behavior |
|---|---|
| Enable/disable examiner | `RECALLIT_EXAMINER` — ON by default; `=0` uses the deterministic floor (near‑verbatim only). The check is `!== "0"`. |
| Examiner model | `claude-sonnet-4-6` default; override per call via `ExamineInput.model` or harness `EXAMINER_MODEL`. |
| Examiner cost | One Claude call per checkpointed turn; needs `ANTHROPIC_API_KEY`. No local/offline model. |
| HOLD behavior | Grader throws; surfaces as a turn error. Never a silent floor fallback. |
| Default grader | `lexical` (absent `meta.grader`) — bit‑identical to pre‑registry flashcards. |
| Unknown grader name | Throws (fail‑closed). |
| Easy rating | Lexical/exact only. Coverage tops at Good. |
| Contradiction | Caps an otherwise‑Good coverage grade at Hard. |

### Key files

| File | Role |
|---|---|
| `src/graders/registry.ts` | Single grading entry point; dispatch by `card.meta.grader`; fail‑closed |
| `src/graders/coverage.ts` | `RubricCheckpoint`, `CoverageVector`, pure `mapCoverageToRating`, model‑free `checkCoverage` floor |
| `src/graders/examiner.ts` | `examineAnswer` (produce), `recountExaminer` (re‑verify span + recount), `examinerCoverageGrader`, HOLD |
| `src/evaluate.ts` | Lexical tier: `normalize`, `tokenize`, `evaluateAnswer` |
| `src/turn.ts` | Turn machine: gates reveal/grade behind a recorded response; rating is engine‑owned |
| `src/scheduler.ts` | FSRS‑6 wrapper: `toGrade`, `gradeCard`, `previewSchedule` |
| `src/packgen/gate.ts` | Honesty gate: `gateCards` verifies `sourceQuote` is in corpus at pack time |
| `scripts/examiner-harness.ts` | Re‑runnable stress test over `test/fixtures/examiner-fixtures.json` |
| `test/coverage.test.ts`, `test/examiner.test.ts`, `test/graders.test.ts`, `test/gate-rubric.test.ts` | Validation suites |
