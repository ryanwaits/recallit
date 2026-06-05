// FSRS scheduling wrapper. Pure functions (no IO) so scheduling is unit-testable.
import { type FSRSParameters, fsrs, generatorParameters, Rating } from "ts-fsrs";
import type { EvalRating, FsrsCard, Grade, RecallCard, ReviewLogEntry } from "./types.ts";

export type Scheduler = ReturnType<typeof fsrs>;

export function getScheduler(params?: Partial<FSRSParameters>): Scheduler {
  return fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: true, ...params }));
}

const RATING_BY_NAME: Record<EvalRating, Grade> = {
  Again: Rating.Again,
  Hard: Rating.Hard,
  Good: Rating.Good,
  Easy: Rating.Easy,
};

/** Map a rating name/number to an FSRS Grade. Throws on the non-review "Manual" rating. */
export function toGrade(rating: EvalRating | Grade | string | number): Grade {
  if (typeof rating === "number") {
    if (rating < Rating.Again || rating > Rating.Easy) throw new Error(`bad rating: ${rating}`);
    return rating as Grade;
  }
  const g = RATING_BY_NAME[rating as EvalRating];
  if (g === undefined) throw new Error(`unknown rating: ${rating}`);
  return g;
}

export interface GradeOutcome {
  card: RecallCard;
  log: ReviewLogEntry;
}

/** Apply one review. Returns the rescheduled card and a log entry. Does not write anything. */
export function gradeCard(
  card: RecallCard,
  rating: EvalRating | Grade | string | number,
  now: Date = new Date(),
  scheduler: Scheduler = getScheduler(),
): GradeOutcome {
  const grade = toGrade(rating);
  const { card: next, log } = scheduler.next(card.fsrs, now, grade);
  return {
    card: { ...card, fsrs: next as FsrsCard },
    log: {
      cardId: card.id,
      rating: log.rating,
      state: log.state,
      due: log.due.toISOString(),
      stability: log.stability,
      difficulty: log.difficulty,
      scheduled_days: log.scheduled_days,
      review_time: log.review.toISOString(),
    },
  };
}

/** Preview the four rating outcomes (for "next due per button" UIs). */
export function previewSchedule(
  card: RecallCard,
  now: Date = new Date(),
  scheduler: Scheduler = getScheduler(),
): Record<EvalRating, { due: string; scheduled_days: number }> {
  const r = scheduler.repeat(card.fsrs, now);
  const pick = (g: Grade) => ({
    due: r[g].card.due.toISOString(),
    scheduled_days: r[g].card.scheduled_days,
  });
  return {
    Again: pick(Rating.Again),
    Hard: pick(Rating.Hard),
    Good: pick(Rating.Good),
    Easy: pick(Rating.Easy),
  };
}
