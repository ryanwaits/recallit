// The examiner recount: code re-verifies each cited evidence span is literally in
// the learner's answer (anti-fabrication), drops what it can't, and counts the
// rating. Pure + deterministic given the judgments — the model never picks it.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RubricCheckpoint } from "../src/graders/coverage.ts";
import { type ExaminerJudgment, recountExaminer } from "../src/graders/examiner.ts";

const rubric: RubricCheckpoint[] = [
  { id: "a", claim: "sky is blue", required: true },
  { id: "b", claim: "grass is green", required: true },
  { id: "c", claim: "clouds are white", required: false },
];
const answer = "the sky is blue and the grass is green out here";
const j = (checkpointId: string, demonstrated: boolean, evidence: string): ExaminerJudgment => ({
  checkpointId,
  demonstrated,
  evidence,
});

describe("recountExaminer", () => {
  test("all required, evidence verified -> Good (no fabrication)", () => {
    const r = recountExaminer(rubric, answer, [
      j("a", true, "the sky is blue"),
      j("b", true, "the grass is green"),
    ]);
    expect(r.result.rating).toBe("Good");
    expect(r.fabricated).toBe(0);
  });

  test("all required (+ bonus) -> Good (coverage tops at Good)", () => {
    const r = recountExaminer(rubric, answer, [
      j("a", true, "sky is blue"),
      j("b", true, "grass is green"),
      j("c", true, "out here"),
    ]);
    expect(r.result.rating).toBe("Good");
  });

  test("fabricated evidence (span not in answer) is dropped, not credited", () => {
    const r = recountExaminer(rubric, answer, [
      j("a", true, "the sky is blue"),
      j("b", true, "grass is purple"), // not in the answer -> dropped
    ]);
    expect(r.fabricated).toBe(1);
    expect(r.result.rating).toBe("Hard"); // only 1/2 required survives
    expect(r.result.reasons.join(" ")).toMatch(/unquotable/);
  });

  test("nothing demonstrated -> Again", () => {
    expect(recountExaminer(rubric, answer, []).result.rating).toBe("Again");
    expect(
      recountExaminer(rubric, answer, [j("a", false, ""), j("b", false, "")]).result.rating,
    ).toBe("Again");
  });

  test("a fluent claim with no quotable span earns nothing (the bait defense)", () => {
    // demonstrated:true but evidence empty -> not credited, counted as fabricated
    const r = recountExaminer(rubric, answer, [j("a", true, ""), j("b", true, "")]);
    expect(r.result.rating).toBe("Again");
    expect(r.fabricated).toBe(2);
  });
});

describe("examiner fixtures (committed for the re-runnable harness)", () => {
  const data = JSON.parse(
    readFileSync(join(import.meta.dir, "fixtures", "examiner-fixtures.json"), "utf8"),
  );
  test("every fixture is well-formed: a rubric with required checkpoints + adversarial answers", () => {
    expect(data.fixtures.length).toBeGreaterThanOrEqual(2);
    for (const fx of data.fixtures) {
      expect(fx.rubric.some((c: RubricCheckpoint) => c.required)).toBe(true);
      for (const c of fx.rubric) expect(typeof c.sourceQuote).toBe("string");
      expect(fx.answers.some((a: { bait?: boolean }) => a.bait)).toBe(true); // a near-miss bait
      expect(fx.answers.some((a: { cluster?: string }) => a.cluster)).toBe(true); // a paraphrase cluster
      for (const a of fx.answers) expect(["Again", "Hard", "Good", "Easy"]).toContain(a.gold);
    }
  });
});
