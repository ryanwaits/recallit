// T4: the deterministic grader. Same input must always yield the same rating —
// FSRS scheduling integrity depends on it.
import { describe, expect, test } from "bun:test";
import { evaluateAnswer, normalize } from "../src/evaluate.ts";

describe("normalize", () => {
  test("strips accents, case, punctuation", () => {
    expect(normalize("¿Qué Onda, güey?")).toBe("que onda guey");
  });
});

describe("evaluateAnswer", () => {
  test("exact match -> Easy", () => {
    expect(evaluateAnswer("casa", "casa").rating).toBe("Easy");
  });

  test("normalization-only difference -> Good", () => {
    expect(evaluateAnswer("Casa.", "casa").rating).toBe("Good");
    expect(evaluateAnswer("el nino", "el niño").rating).toBe("Good");
  });

  test("single-character typo -> Hard", () => {
    expect(evaluateAnswer("cusa", "casa").rating).toBe("Hard");
  });

  test("unrelated answer -> Again", () => {
    expect(evaluateAnswer("perro", "casa").rating).toBe("Again");
  });

  test("empty answer -> Again", () => {
    expect(evaluateAnswer("", "casa").rating).toBe("Again");
  });

  test("matches any of multiple acceptable answers", () => {
    expect(evaluateAnswer("hi", ["hello", "hi"]).rating).toBe("Easy");
  });

  test("is deterministic", () => {
    const a = evaluateAnswer("la kasa", "la casa");
    const b = evaluateAnswer("la kasa", "la casa");
    expect(a).toEqual(b);
  });
});
