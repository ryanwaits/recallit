// T17 + T18: the one-new-thing (i+1) guardrail and mining a transcript into cards.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MiningError, mineCard } from "../src/mining.ts";
import { createCard, listCards } from "../src/store.ts";
import { createTopic } from "../src/topic.ts";

let dir: string;
const TOPIC = "es";

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "recallit-mining-"));
  process.env.RECALLIT_DATA_DIR = dir;
  await createTopic({ id: TOPIC, name: "Spanish", modality: "voice", meta: {} });
  // Seed the known set: these words are already learned.
  for (const [front, back] of [
    ["la", "the"],
    ["casa", "house"],
    ["es", "is"],
    ["el", "the"],
    ["perro", "dog"],
  ]) {
    await createCard(TOPIC, { front: front as string, back: back as string });
  }
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("mineCard one-new-thing guardrail", () => {
  test("accepts a sentence with exactly one new element", async () => {
    const { card } = await mineCard(TOPIC, {
      content: "la casa es bonita",
      newElement: "bonita",
      back: "pretty",
    });
    expect(card.front).toBe("bonita");
    expect(card.context).toBe("la casa es bonita");
    expect(card.tags).toContain("mined");
  });

  test("rejects a sentence with more than one new element", async () => {
    await expect(
      mineCard(TOPIC, { content: "el perro es muy grande", newElement: "grande", back: "big" }),
    ).rejects.toThrow(/more than one new element/);
  });

  test("rejects when the new element is not in the content", async () => {
    await expect(
      mineCard(TOPIC, { content: "la casa", newElement: "bonita", back: "pretty" }),
    ).rejects.toThrow(/does not appear/);
  });

  test("rejects an element whose tokens are all already known", async () => {
    // "casa" and "es" are both known, but no single card targets "casa es".
    await expect(mineCard(TOPIC, { content: "la casa es", newElement: "casa es" })).rejects.toThrow(
      /already known/,
    );
  });

  test("rejects a duplicate of a previously mined element", async () => {
    await expect(
      mineCard(TOPIC, { content: "la casa es bonita", newElement: "bonita", back: "pretty" }),
    ).rejects.toThrow(/duplicate/);
  });
});

describe("mining a transcript (T18)", () => {
  test("a sequence yields exactly the valid, non-duplicate, 1T cards", async () => {
    // Simulates what the agent extracts from a conversation turn-by-turn.
    // "bonita" was already mined above; "rojo"+"coche" is 2-new; the rest are valid.
    const attempts = [
      { content: "el perro es rapido", newElement: "rapido", back: "fast" }, // ok
      { content: "la casa es bonita", newElement: "bonita" }, // dup -> reject
      { content: "el coche es rojo", newElement: "rojo" }, // "coche" also new -> reject
      { content: "la casa es nueva", newElement: "nueva", back: "new" }, // ok
    ];
    const before = (await listCards(TOPIC)).length;
    let mined = 0;
    for (const a of attempts) {
      try {
        await mineCard(TOPIC, a);
        mined++;
      } catch (e) {
        expect(e).toBeInstanceOf(MiningError);
      }
    }
    expect(mined).toBe(2);
    expect((await listCards(TOPIC)).length).toBe(before + 2);
  });
});
