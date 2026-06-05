// T5 + T6: file-backed CRUD, the derived index stays consistent, due-filtering
// works, rebuild matches file truth, and reviews append to review_log.jsonl.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { countCards, getDueCardIds, rebuildIndex } from "../src/db.ts";
import { reviewLogFile } from "../src/paths.ts";
import { createCard, deleteCard, getCard, listCards, reviewCard } from "../src/store.ts";
import { createTopic } from "../src/topic.ts";

const TOPIC = "capitals";
let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "recallit-test-"));
  process.env.RECALLIT_DATA_DIR = dir;
  await createTopic({ id: TOPIC, name: "World Capitals", modality: "text", meta: {} });
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("store + index", () => {
  test("create persists to file and index", async () => {
    const c = await createCard(TOPIC, { front: "France", back: "Paris" });
    expect(await getCard(TOPIC, c.id)).not.toBeNull();
    expect(countCards(TOPIC).total).toBe(1);
  });

  test("fresh cards are due; a Good review schedules them out of the due set", async () => {
    const c = await createCard(TOPIC, { front: "Japan", back: "Tokyo" });
    expect(getDueCardIds(TOPIC)).toContain(c.id);

    const outcome = await reviewCard(TOPIC, c.id, "Good");
    expect(outcome).not.toBeNull();
    expect(outcome?.card.fsrs.due.getTime()).toBeGreaterThan(Date.now());
    expect(getDueCardIds(TOPIC)).not.toContain(c.id);
  });

  test("review appends to review_log.jsonl", async () => {
    const c = await createCard(TOPIC, { front: "Italy", back: "Rome" });
    await reviewCard(TOPIC, c.id, "Again");
    const log = await readFile(reviewLogFile(TOPIC), "utf8");
    const lines = log
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(lines.some((e) => e.cardId === c.id)).toBe(true);
  });

  test("rebuild reconstructs the index from files", async () => {
    const before = (await listCards(TOPIC)).length;
    const n = await rebuildIndex(TOPIC);
    expect(n).toBe(before);
    expect(countCards(TOPIC).total).toBe(before);
  });

  test("delete removes file and index row", async () => {
    const c = await createCard(TOPIC, { front: "Spain", back: "Madrid" });
    const totalAfterAdd = countCards(TOPIC).total;
    expect(await deleteCard(TOPIC, c.id)).toBe(true);
    expect(await getCard(TOPIC, c.id)).toBeNull();
    expect(countCards(TOPIC).total).toBe(totalAfterAdd - 1);
  });
});
