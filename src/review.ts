// Review orchestration service. Plain async functions over (topicId, tracker, ...)
// so the review loop is fully testable WITHOUT the LLM. agent.ts wraps these as
// SDK tools; the logic — and the invariants it enforces — live here, topic-agnostic.
import { getCard, reviewCard } from "./store.ts";
import type { TurnTracker } from "./turn.ts";
import { TurnError } from "./turn.ts";
import type { EvalResult, GradeCheckpoint, HoldResult } from "./types.ts";

async function load(topicId: string, cardId: string) {
  const card = await getCard(topicId, cardId);
  if (!card) throw new TurnError(`card not found: ${cardId}`);
  return card;
}

export async function presentCard(
  topicId: string,
  tracker: TurnTracker,
  cardId: string,
): Promise<{ front: string; context?: string }> {
  return tracker.present(await load(topicId, cardId));
}

/** Record the response; returns nothing revealing (caller must call reveal next).
 *  A HoldResult means the grader couldn't confidently rate it — not an error, the
 *  turn is left retryable and the caller should surface this honestly, not grade. */
export async function submitResponse(
  topicId: string,
  tracker: TurnTracker,
  cardId: string,
  answer: string,
): Promise<{ recorded: true } | HoldResult> {
  const result = await tracker.respond(await load(topicId, cardId), answer);
  if ("hold" in result) return result;
  return { recorded: true };
}

export async function revealAnswer(
  topicId: string,
  tracker: TurnTracker,
  cardId: string,
): Promise<{ back: string; evaluation: EvalResult }> {
  return tracker.reveal(await load(topicId, cardId));
}

/** Grade with the engine-computed rating (the agent cannot override it), reschedule. */
export async function gradeTurn(
  topicId: string,
  tracker: TurnTracker,
  cardId: string,
): Promise<{
  rating: string;
  due: string;
  reps: number;
  lapses: number;
  reasons: string[];
  checkpoints?: GradeCheckpoint[];
}> {
  const evaluation = tracker.ratingFor(cardId);
  const outcome = await reviewCard(topicId, cardId, evaluation.rating);
  if (!outcome) throw new TurnError(`card not found: ${cardId}`);
  tracker.markGraded(cardId);
  return {
    rating: evaluation.rating,
    due: outcome.card.fsrs.due.toISOString(),
    reps: outcome.card.fsrs.reps,
    lapses: outcome.card.fsrs.lapses,
    reasons: evaluation.reasons, // the grade receipt (coverage breakdown for checkable items)
    checkpoints: evaluation.checkpoints, // rubric-backed detail, absent on lexical grades
  };
}
