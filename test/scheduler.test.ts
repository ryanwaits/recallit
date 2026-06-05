// T3: FSRS scheduling behaves: Good grows the interval, ratings are monotonic,
// and forgetting a learned card (Again from Review) lapses + relearns.
import { describe, expect, test } from "bun:test";
import { newCard } from "../src/card.ts";
import { getScheduler, gradeCard, previewSchedule, toGrade } from "../src/scheduler.ts";
import { Rating, State } from "../src/types.ts";

const NOW = new Date("2026-05-24T12:00:00.000Z");
const fixed = getScheduler({ enable_fuzz: false });

function card() {
  return newCard({ front: "casa", back: "house" });
}

describe("toGrade", () => {
  test("maps names and numbers", () => {
    expect(toGrade("Good")).toBe(Rating.Good);
    expect(toGrade(1)).toBe(Rating.Again);
    expect(() => toGrade("Manual")).toThrow();
    expect(() => toGrade(0)).toThrow();
  });
});

describe("gradeCard", () => {
  test("Good schedules into the future and counts a rep", () => {
    const { card: next, log } = gradeCard(card(), "Good", NOW, fixed);
    expect(next.fsrs.due.getTime()).toBeGreaterThan(NOW.getTime());
    expect(next.fsrs.reps).toBe(1);
    expect(log.cardId).toBe(next.id);
    expect(log.rating).toBe(Rating.Good);
  });

  test("forgetting a learned card lapses and relearns", () => {
    const learned = card();
    // Force a mature Review-state card, then fail it.
    learned.fsrs = { ...learned.fsrs, state: State.Review, stability: 30, difficulty: 5, reps: 5 };
    const { card: next } = gradeCard(learned, "Again", NOW, fixed);
    expect(next.fsrs.lapses).toBe(1);
    expect(next.fsrs.state).toBe(State.Relearning);
  });
});

describe("previewSchedule", () => {
  test("intervals are monotonic Again <= Hard <= Good <= Easy", () => {
    const learned = card();
    learned.fsrs = { ...learned.fsrs, state: State.Review, stability: 30, difficulty: 5, reps: 5 };
    const p = previewSchedule(learned, NOW, fixed);
    const d = (k: keyof typeof p) => new Date(p[k].due).getTime();
    expect(d("Again")).toBeLessThanOrEqual(d("Hard"));
    expect(d("Hard")).toBeLessThanOrEqual(d("Good"));
    expect(d("Good")).toBeLessThanOrEqual(d("Easy"));
  });
});
