// T2: card.md round-trips losslessly (content + FSRS state) through serialize/parse.
import { describe, expect, test } from "bun:test";
import { newCard, parseCard, serializeCard } from "../src/card.ts";

describe("card serialization", () => {
  test("round-trips content and FSRS state", () => {
    const card = newCard({
      type: "sentence",
      front: "¿Qué onda?",
      back: "What's up?",
      context: "casual greeting",
      tags: ["greeting", "rgv"],
      source: "seed",
      meta: { dialect: "mx-rgv" },
      notes: "regional",
    });

    const parsed = parseCard(serializeCard(card), "fallback");

    expect(parsed.id).toBe(card.id);
    expect(parsed.type).toBe("sentence");
    expect(parsed.front).toBe(card.front);
    expect(parsed.back).toBe(card.back);
    expect(parsed.context).toBe(card.context);
    expect(parsed.tags).toEqual(card.tags);
    expect(parsed.source).toBe(card.source);
    expect(parsed.meta).toEqual(card.meta);
    expect(parsed.notes).toBe("regional");
    // FSRS fields preserved (compare ISO to avoid sub-ms drift).
    expect(parsed.fsrs.due.toISOString()).toBe(card.fsrs.due.toISOString());
    expect(parsed.fsrs.state).toBe(card.fsrs.state);
    expect(parsed.fsrs.reps).toBe(card.fsrs.reps);
    expect(parsed.fsrs.stability).toBe(card.fsrs.stability);
  });

  test("falls back to a fresh FSRS card when frontmatter lacks state", () => {
    const parsed = parseCard("---\nid: x\nfront: a\nback: b\n---\n", "x");
    expect(parsed.fsrs.due).toBeInstanceOf(Date);
    expect(parsed.fsrs.reps).toBe(0);
  });
});
