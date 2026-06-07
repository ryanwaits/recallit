// Phase 0: prove the grader registry seam is INERT. A card with no meta.grader
// must grade byte-identically to today's evaluateAnswer(response, card.back), and
// an unknown grader name must FAIL CLOSED (never silently fall back).
import { describe, expect, test } from "bun:test";
import { newCard } from "../src/card.ts";
import { evaluateAnswer } from "../src/evaluate.ts";
import { gradeResponse, graderName, registerGrader } from "../src/graders/registry.ts";

// (response, back) pairs spanning every rating band the lexical grader produces.
const CASES: [string, string][] = [
  ["house", "house"], // exact -> Easy
  ["House.", "house"], // accents/case/punct -> Good
  ["hous", "house"], // near miss -> Hard
  ["car", "house"], // below threshold -> Again
  ["", "house"], // empty -> Again
  ["¿Qué onda?", "¿Qué onda?"], // unicode exact
  ["que onda", "¿Qué onda?"], // unicode normalized -> Good
];

describe("grader registry (Phase 0 — inert seam)", () => {
  test("default (no meta.grader) is byte-identical to evaluateAnswer", async () => {
    for (const [response, back] of CASES) {
      const card = newCard({ front: "cue", back });
      expect(graderName(card)).toBe("lexical");
      expect(await gradeResponse(card, response)).toEqual(evaluateAnswer(response, back));
    }
  });

  test("explicit grader:lexical matches the default", async () => {
    for (const [response, back] of CASES) {
      const card = newCard({ front: "cue", back, meta: { grader: "lexical" } });
      expect(await gradeResponse(card, response)).toEqual(evaluateAnswer(response, back));
    }
  });

  test("unknown grader name fails closed (rejects, never silently degrades)", async () => {
    const card = newCard({ front: "cue", back: "house", meta: { grader: "vibes" } });
    await expect(gradeResponse(card, "house")).rejects.toThrow(/unknown grader "vibes"/);
  });

  test("registerGrader dispatches to a newly registered deterministic grader", async () => {
    registerGrader("always-good", () => ({ rating: "Good", score: 1, reasons: ["test"] }));
    const card = newCard({ front: "cue", back: "house", meta: { grader: "always-good" } });
    expect((await gradeResponse(card, "anything")).rating).toBe("Good");
    // A different card still defaults to lexical — registration is additive.
    const plain = newCard({ front: "cue", back: "house" });
    expect((await gradeResponse(plain, "house")).rating).toBe("Easy");
  });
});
