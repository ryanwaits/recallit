// Tier 2 — deterministic COVERAGE grading. The recall unit generalizes from a
// flashcard to a "checkable item": card.meta.rubric is an ordered list of
// checkpoints, each a source-grounded claim. mapCoverageToRating() is the PURE,
// validated core (variance spike, docs/design/tutor-multimodal.md): all required
// hit -> Good (Easy if every bonus hit too); >= 50% of required -> Hard; below ->
// Again; a flatly-wrong claim alongside correct ones caps the grade at Hard.
//
// HIT/MISS per checkpoint comes from EITHER this file's model-free matcher (the
// fallback floor) OR, in the agent-examiner path, the LLM's evidence-verified
// judgment recounted by code. Either way the RATING is always code's — never the
// model's. The thresholds here are the spike-validated mapping (all-required for
// Good, not >=0.75): that is what scored 0.91 exact accuracy without over-crediting.
import { normalize } from "../evaluate.ts";
import type { EvalRating, EvalResult, RecallCard } from "../types.ts";

export interface RubricCheckpoint {
  id: string;
  claim: string;
  aliases?: string[];
  required: boolean;
  /** Verbatim substring of the source corpus (gateCards verifies it at pack time). */
  sourceQuote?: string;
}

export interface CoverageVector {
  requiredHit: number;
  requiredTotal: number;
  bonusHit: number;
  bonusTotal: number;
  /** A flatly-wrong assertion present alongside correct ones — caps the grade at Hard. */
  contradiction?: boolean;
}

/**
 * PURE: a coverage vector -> FSRS rating. Thresholds validated by the variance
 * spike (scoped replay 1.00, exact accuracy 0.91). Fractions generalize to any
 * checkpoint count. This function NEVER sees the model — it counts.
 */
export function mapCoverageToRating(v: CoverageVector): EvalRating {
  const reqFrac =
    v.requiredTotal > 0
      ? v.requiredHit / v.requiredTotal
      : v.bonusTotal > 0
        ? v.bonusHit / v.bonusTotal
        : 0;

  // Coverage tops out at Good: deterministic/examiner coverage can't reliably tell
  // "complete" from "effortless", and letting bonus coverage lift Good->Easy was the
  // one paraphrase flicker the stress test found. Easy stays a lexical/exact-recall
  // signal (evaluateAnswer); bonus coverage is informational (shown in the receipt).
  let rating: EvalRating;
  if (v.requiredTotal > 0 && v.requiredHit === v.requiredTotal) {
    rating = "Good";
  } else if (reqFrac >= 0.5) {
    rating = "Hard";
  } else {
    rating = "Again";
  }
  // Override: a wrong claim never earns better than Hard, regardless of coverage.
  if (v.contradiction && rating === "Good") rating = "Hard";
  return rating;
}

/**
 * Model-free HIT/MISS matcher — the FALLBACK floor. A checkpoint is hit when its
 * claim (or an alias) appears in the normalized answer. The agent-examiner path
 * supplies its own evidence-verified hits instead of this.
 */
export function checkCoverage(rubric: RubricCheckpoint[], response: string): CoverageVector {
  const hay = normalize(response);
  const hit = (c: RubricCheckpoint): boolean =>
    hay.length > 0 && [c.claim, ...(c.aliases ?? [])].some((s) => hay.includes(normalize(s)));
  const req = rubric.filter((c) => c.required);
  const bonus = rubric.filter((c) => !c.required);
  return {
    requiredHit: req.filter(hit).length,
    requiredTotal: req.length,
    bonusHit: bonus.filter(hit).length,
    bonusTotal: bonus.length,
  };
}

/** Wrap a coverage vector into an EvalResult with a human-readable receipt. */
export function coverageResult(v: CoverageVector): EvalResult {
  const rating = mapCoverageToRating(v);
  const score = v.requiredTotal > 0 ? v.requiredHit / v.requiredTotal : 0;
  const receipt =
    `coverage vs rubric: ${v.requiredHit}/${v.requiredTotal} required` +
    (v.bonusTotal ? `, ${v.bonusHit}/${v.bonusTotal} bonus` : "") +
    (v.contradiction ? "; contradiction (capped at Hard)" : "") +
    ` -> ${rating}`;
  return { rating, score, reasons: [receipt] };
}

/** The `coverage` grader (registered): deterministic floor over card.meta.rubric. */
export function coverageGrader(card: RecallCard, response: string): EvalResult {
  const rubric = card.meta?.rubric as RubricCheckpoint[] | undefined;
  if (!rubric || rubric.length === 0) {
    throw new Error(`coverage grader: card ${card.id} has no meta.rubric`);
  }
  return coverageResult(checkCoverage(rubric, response));
}
