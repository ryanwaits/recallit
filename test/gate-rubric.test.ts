// The honesty gate, extended for checkable items: every rubric checkpoint's
// sourceQuote must be a literal substring of the corpus, or the whole card is
// held (fail-closed) — the same safety a bad flashcard quote gets today.
import { describe, expect, test } from "bun:test";
import type { PackCard } from "../src/pack.ts";
import { gateCards } from "../src/packgen/gate.ts";

const corpus = "The sky is blue on a clear day. Water boils at 100 degrees Celsius.";
const rubricCard = (rubric: unknown, back = "Sky is blue."): PackCard => ({
  front: "Explain the key facts",
  back,
  meta: { grader: "coverage", rubric },
});

describe("gateCards · rubric (checkable items)", () => {
  test("a fully grounded rubric card is ready (no top-level quote needed)", () => {
    const { ready, needsReview } = gateCards(
      [
        rubricCard(
          [
            { id: "sky", claim: "sky is blue", required: true, sourceQuote: "The sky is blue" },
            {
              id: "water",
              claim: "water boils",
              required: true,
              sourceQuote: "Water boils at 100 degrees Celsius",
            },
          ],
          "Sky is blue and water boils at 100 degrees.",
        ),
      ],
      corpus,
    );
    expect(ready.length).toBe(1);
    expect(needsReview.length).toBe(0);
  });

  test("an ungrounded checkpoint holds the whole card (fail-closed), naming the id", () => {
    const { ready, needsReview } = gateCards(
      [
        rubricCard([
          { id: "sky", claim: "sky is blue", required: true, sourceQuote: "The sky is blue" },
          {
            id: "plato",
            claim: "Plato wrote it",
            required: true,
            sourceQuote: "Plato wrote the Republic",
          },
        ]),
      ],
      corpus,
    );
    expect(ready.length).toBe(0);
    expect(needsReview[0]?.reasons).toContain("rubric-point-not-in-corpus:plato");
    expect(needsReview[0]?.reasons).not.toContain("rubric-point-not-in-corpus:sky");
  });

  test("a long exemplar back on a checkable item is NOT flagged answer-unusually-long", () => {
    const longBack =
      "the sky is blue and this is a grounded exemplar answer that is intentionally quite long. ".repeat(
        4,
      ); // > 240 chars, lowercase (no proper-noun/number flags)
    const { ready, needsReview } = gateCards(
      [
        {
          front: "Explain the key facts",
          back: longBack,
          meta: {
            grader: "coverage",
            rubric: [
              { id: "sky", claim: "sky is blue", required: true, sourceQuote: "The sky is blue" },
            ],
          },
        },
      ],
      corpus,
    );
    const reasons = [...(needsReview[0]?.reasons ?? [])];
    expect(reasons).not.toContain("quality:answer-unusually-long");
    expect(ready.length).toBe(1);
  });

  test("an empty rubric is flagged", () => {
    const { needsReview } = gateCards([rubricCard([])], corpus);
    expect(needsReview[0]?.reasons).toContain("rubric-empty");
  });

  test("a rubric card is never flagged missing-source-quote (the rubric is the grounding)", () => {
    const { needsReview } = gateCards(
      [
        rubricCard([
          { id: "sky", claim: "sky is blue", required: true, sourceQuote: "The sky is blue" },
        ]),
      ],
      corpus,
    );
    expect(needsReview[0]?.reasons ?? []).not.toContain("missing-source-quote");
  });
});
