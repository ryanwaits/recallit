// T19: the content-quality guard flags low-confidence cards.
import { describe, expect, test } from "bun:test";
import { checkCardQuality } from "../src/quality.ts";

describe("checkCardQuality", () => {
  test("passes a well-formed card", () => {
    const r = checkCardQuality({ front: "bonita", back: "pretty", context: "la casa es bonita" });
    expect(r.ok).toBe(true);
    expect(r.flags).toEqual([]);
  });

  test("flags a missing answer", () => {
    expect(checkCardQuality({ front: "bonita", back: "" }).flags).toContain("missing answer");
  });

  test("flags front equal to back", () => {
    expect(checkCardQuality({ front: "Casa", back: "casa" }).flags).toContain("front equals back");
  });

  test("flags placeholder text", () => {
    expect(checkCardQuality({ front: "x", back: "TODO" }).flags).toContain("placeholder text");
  });

  test("the length heuristic is flashcard-only (longAnswerOk skips it)", () => {
    const long = "x".repeat(300);
    expect(checkCardQuality({ front: "q", back: long }).flags).toContain("answer unusually long");
    expect(checkCardQuality({ front: "q", back: long, longAnswerOk: true }).flags).not.toContain(
      "answer unusually long",
    );
  });
});
