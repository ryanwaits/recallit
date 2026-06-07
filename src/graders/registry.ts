// Pluggable-but-deterministic grader registry — the seam that lets the recall
// unit generalize from a flashcard to a "checkable item" without ever letting a
// model pick a rating. A grader maps (card, response) -> EvalResult; the RATING
// is always code-owned. Dispatch is keyed by card.meta.grader, defaulting to the
// lexical grader, so a card WITHOUT meta.grader behaves exactly as it did before
// this seam existed (today's flashcard path, bit-identical).
//
// Unknown grader names FAIL CLOSED (throw) — they must never silently degrade to
// "the agent decides". New deterministic tiers (coverage, ordered) register here;
// see docs/design/tutor-multimodal.md.
import { evaluateAnswer } from "../evaluate.ts";
import type { EvalResult, RecallCard } from "../types.ts";
import { coverageGrader } from "./coverage.ts";

export type Grader = (card: RecallCard, response: string) => EvalResult;

/** Tier 1 — lexical: today's behavior, verbatim. The default (flashcard) grader. */
const lexical: Grader = (card, response) => evaluateAnswer(response, card.back);

const REGISTRY: Record<string, Grader> = { lexical, coverage: coverageGrader };

/** The grader a card uses; absent meta.grader => the lexical default. */
export function graderName(card: RecallCard): string {
  return (card.meta?.grader as string | undefined) ?? "lexical";
}

/**
 * Grade a response for a card, dispatching on card.meta.grader (default lexical).
 * The single grading entry point — both the turn machine and the CLI call this,
 * so there is never a second grading path. Throws on an unknown grader name.
 */
export function gradeResponse(card: RecallCard, response: string): EvalResult {
  const name = graderName(card);
  const grader = REGISTRY[name];
  if (!grader) {
    throw new Error(
      `unknown grader "${name}" for card ${card.id} (registered: ${Object.keys(REGISTRY).join(", ")})`,
    );
  }
  return grader(card, response);
}

/** Register a deterministic grader. Used by later tiers (coverage/ordered) + tests. */
export function registerGrader(name: string, grader: Grader): void {
  REGISTRY[name] = grader;
}
