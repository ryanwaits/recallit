// T7 + T12: the review orchestration runs end-to-end over a NON-language topic
// (world capitals) via the same agnostic service the agent's tools call — proving
// the engine + loop work for any subject with zero code change.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDueCardIds } from "../src/db.ts";
import { gradeTurn, presentCard, revealAnswer, submitResponse } from "../src/review.ts";
import { createCard } from "../src/store.ts";
import { createTopic } from "../src/topic.ts";
import { TurnError, TurnTracker } from "../src/turn.ts";

let dir: string;
const TOPIC = "capitals";

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "recallit-session-"));
  process.env.RECALLIT_DATA_DIR = dir;
  // A non-language topic plugged in purely via config + cards (the agnostic proof).
  await createTopic({
    id: TOPIC,
    name: "World Capitals",
    modality: "text",
    goalMetric: "cards_recalled",
    meta: { region: "world" },
  });
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("review orchestration (agnostic)", () => {
  test("present -> respond -> reveal -> grade reschedules the card out of the due set", async () => {
    const card = await createCard(TOPIC, { front: "France", back: "Paris" });
    const tracker = new TurnTracker();

    const presented = await presentCard(TOPIC, tracker, card.id);
    expect(presented.front).toBe("France");

    await submitResponse(TOPIC, tracker, card.id, "Paris");
    const revealed = await revealAnswer(TOPIC, tracker, card.id);
    expect(revealed.back).toBe("Paris");
    expect(revealed.evaluation.rating).toBe("Easy");

    const graded = await gradeTurn(TOPIC, tracker, card.id);
    expect(graded.rating).toBe("Easy");
    expect(graded.reps).toBe(1);
    expect(getDueCardIds(TOPIC)).not.toContain(card.id);
  });

  test("reveal is gated on a response in the orchestration layer too", async () => {
    const card = await createCard(TOPIC, { front: "Japan", back: "Tokyo" });
    const tracker = new TurnTracker();
    await presentCard(TOPIC, tracker, card.id);
    await expect(revealAnswer(TOPIC, tracker, card.id)).rejects.toThrow(TurnError);
  });

  test("grading uses the engine-computed rating, not a caller-supplied one", async () => {
    const card = await createCard(TOPIC, { front: "Italy", back: "Rome" });
    const tracker = new TurnTracker();
    await presentCard(TOPIC, tracker, card.id);
    await submitResponse(TOPIC, tracker, card.id, "Venice"); // wrong
    const graded = await gradeTurn(TOPIC, tracker, card.id);
    expect(graded.rating).toBe("Again");
    expect(graded.lapses).toBeGreaterThanOrEqual(0);
  });
});
