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

  test("a checkable card's exemplar back is NOT flagged for ungrounded proper-noun/number", () => {
    // Natural exemplar prose: "Plato" (title-case, not in corpus) + "200" (ungrounded)
    // would both hold a FLASHCARD, but on a checkable item the rubric is the grounding
    // contract and the back is illustrative, so neither fires.
    const { ready, needsReview } = gateCards(
      [
        rubricCard(
          [{ id: "sky", claim: "sky is blue", required: true, sourceQuote: "The sky is blue" }],
          "Per Plato, the sky is blue even above 200 meters.",
        ),
      ],
      corpus,
    );
    const reasons = [...(needsReview[0]?.reasons ?? [])];
    expect(reasons).not.toContain("unverified-proper-noun");
    expect(reasons).not.toContain("unverified-number");
    expect(ready.length).toBe(1);
  });

  test("a FLASHCARD (no rubric) still gets the proper-noun/number fabrication guard", () => {
    const { ready, needsReview } = gateCards(
      [
        {
          front: "What color is the sky?",
          back: "Per Plato, it is blue above 200 meters.",
          meta: { sourceQuote: "The sky is blue" },
        },
      ],
      corpus,
    );
    expect(ready.length).toBe(0);
    const reasons = [...(needsReview[0]?.reasons ?? [])];
    expect(reasons).toContain("unverified-proper-noun");
    expect(reasons).toContain("unverified-number");
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
