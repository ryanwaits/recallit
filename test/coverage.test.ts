// Tier 2 coverage grading. Locks the mapping (all required -> Good, >=50% -> Hard,
// else Again; a wrong claim caps at Hard) as a pure function, with the spike's
// 11-answer fixture as the regression test. Coverage tops out at Good — Easy is a
// lexical/exact-recall signal, not a coverage one (the bonus->Easy lift was the one
// paraphrase flicker the stress test found). See docs/design/tutor-multimodal.md.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { newCard } from "../src/card.ts";
import {
  checkCoverage,
  mapCoverageToRating,
  type RubricCheckpoint,
} from "../src/graders/coverage.ts";
import { gradeResponse } from "../src/graders/registry.ts";

// Each spike answer reduced to its (human) coverage vector. `expect` is what the
// VALIDATED rule produces — which matched the human gold on 10/11. The one
// divergence (A3) is the documented 50% boundary case, kept here as the canary.
const FIXTURE: {
  id: string;
  v: Parameters<typeof mapCoverageToRating>[0];
  expect: ReturnType<typeof mapCoverageToRating>;
  note?: string;
}[] = [
  {
    id: "A1-full",
    v: { requiredHit: 4, requiredTotal: 4, bonusHit: 1, bonusTotal: 1 },
    expect: "Good",
    note: "human gold = Easy; coverage now tops at Good (Easy is lexical-only)",
  },
  {
    id: "A2-para1",
    v: { requiredHit: 4, requiredTotal: 4, bonusHit: 0, bonusTotal: 1 },
    expect: "Good",
  },
  {
    id: "A2-para2",
    v: { requiredHit: 4, requiredTotal: 4, bonusHit: 0, bonusTotal: 1 },
    expect: "Good",
  },
  {
    id: "A7-diffwords",
    v: { requiredHit: 4, requiredTotal: 4, bonusHit: 0, bonusTotal: 1 },
    expect: "Good",
  },
  {
    id: "A3-partial",
    v: { requiredHit: 1, requiredTotal: 4, bonusHit: 0, bonusTotal: 1 },
    expect: "Again",
    note: "human gold = Hard; the 50% boundary divergence to watch",
  },
  {
    id: "A8-missing-one",
    v: { requiredHit: 3, requiredTotal: 4, bonusHit: 0, bonusTotal: 1 },
    expect: "Hard",
  },
  {
    id: "A9-right-plus-wrong",
    v: { requiredHit: 2, requiredTotal: 4, bonusHit: 0, bonusTotal: 1, contradiction: true },
    expect: "Hard",
  },
  {
    id: "A4-confident-wrong",
    v: { requiredHit: 0, requiredTotal: 4, bonusHit: 0, bonusTotal: 1, contradiction: true },
    expect: "Again",
  },
  {
    id: "A10-fluent-empty",
    v: { requiredHit: 0, requiredTotal: 4, bonusHit: 0, bonusTotal: 1 },
    expect: "Again",
  },
  {
    id: "A6-offtopic",
    v: { requiredHit: 0, requiredTotal: 4, bonusHit: 0, bonusTotal: 1 },
    expect: "Again",
  },
  {
    id: "A5-empty",
    v: { requiredHit: 0, requiredTotal: 4, bonusHit: 0, bonusTotal: 1 },
    expect: "Again",
  },
];

describe("mapCoverageToRating (validated thresholds)", () => {
  for (const { id, v, expect: want } of FIXTURE) {
    test(`${id} -> ${want}`, () => {
      expect(mapCoverageToRating(v)).toBe(want);
    });
  }

  test("all required -> Good, regardless of bonus coverage (no Easy from coverage)", () => {
    expect(
      mapCoverageToRating({ requiredHit: 3, requiredTotal: 3, bonusHit: 2, bonusTotal: 2 }),
    ).toBe("Good");
    expect(
      mapCoverageToRating({ requiredHit: 3, requiredTotal: 3, bonusHit: 0, bonusTotal: 2 }),
    ).toBe("Good");
    expect(
      mapCoverageToRating({ requiredHit: 3, requiredTotal: 3, bonusHit: 0, bonusTotal: 0 }),
    ).toBe("Good");
  });

  test("50% boundary: >=0.5 required -> Hard, below -> Again", () => {
    expect(
      mapCoverageToRating({ requiredHit: 2, requiredTotal: 4, bonusHit: 0, bonusTotal: 0 }),
    ).toBe("Hard");
    expect(
      mapCoverageToRating({ requiredHit: 1, requiredTotal: 4, bonusHit: 0, bonusTotal: 0 }),
    ).toBe("Again");
  });

  test("contradiction override caps an otherwise-Good at Hard", () => {
    expect(
      mapCoverageToRating({ requiredHit: 4, requiredTotal: 4, bonusHit: 1, bonusTotal: 1 }),
    ).toBe("Good");
    expect(
      mapCoverageToRating({
        requiredHit: 4,
        requiredTotal: 4,
        bonusHit: 1,
        bonusTotal: 1,
        contradiction: true,
      }),
    ).toBe("Hard");
    // but it never lifts an Again up to Hard
    expect(
      mapCoverageToRating({
        requiredHit: 0,
        requiredTotal: 4,
        bonusHit: 0,
        bonusTotal: 0,
        contradiction: true,
      }),
    ).toBe("Again");
  });
});

describe("coverage grader (model-free floor, via the registry)", () => {
  // Examiner is ON by default; force it OFF so these stay deterministic (no LLM).
  const prev = process.env.RECALLIT_EXAMINER;
  beforeAll(() => {
    process.env.RECALLIT_EXAMINER = "0";
  });
  afterAll(() => {
    if (prev === undefined) delete process.env.RECALLIT_EXAMINER;
    else process.env.RECALLIT_EXAMINER = prev;
  });

  const rubric: RubricCheckpoint[] = [
    { id: "a", claim: "sky is blue", required: true },
    { id: "b", claim: "grass is green", required: true },
  ];
  const card = (r: RubricCheckpoint[]) =>
    newCard({ front: "explain", back: "n/a", meta: { grader: "coverage", rubric: r } });

  test("checkCoverage counts required hits", () => {
    expect(checkCoverage(rubric, "the sky is blue today")).toMatchObject({
      requiredHit: 1,
      requiredTotal: 2,
    });
    expect(checkCoverage(rubric, "sky is blue and grass is green")).toMatchObject({
      requiredHit: 2,
      requiredTotal: 2,
    });
  });

  test("end-to-end dispatch: meta.grader=coverage routes through the registry (floor, examiner off)", async () => {
    expect((await gradeResponse(card(rubric), "sky is blue and grass is green")).rating).toBe(
      "Good",
    );
    expect((await gradeResponse(card(rubric), "the sky is blue today")).rating).toBe("Hard"); // 1/2 = 50%
    expect((await gradeResponse(card(rubric), "i have no idea")).rating).toBe("Again");
  });

  test("a coverage card with no rubric fails closed", async () => {
    const bad = newCard({ front: "explain", back: "n/a", meta: { grader: "coverage" } });
    await expect(gradeResponse(bad, "anything")).rejects.toThrow(/no meta.rubric/);
  });
});
