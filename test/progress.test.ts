// T11: reviews-today derive from the log; streaks advance/reset by active day.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dayKey, getProgress, markActive, reviewedToday } from "../src/progress.ts";
import { createCard, reviewCard } from "../src/store.ts";
import { createTopic } from "../src/topic.ts";

let dir: string;
const TOPIC = "capitals";

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "recallit-progress-"));
  process.env.RECALLIT_DATA_DIR = dir;
  await createTopic({
    id: TOPIC,
    name: "Capitals",
    modality: "text",
    goalMetric: "recalled",
    meta: {},
  });
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("progress", () => {
  test("reviewedToday counts today's review log entries", async () => {
    const a = await createCard(TOPIC, { front: "France", back: "Paris" });
    const b = await createCard(TOPIC, { front: "Japan", back: "Tokyo" });
    await reviewCard(TOPIC, a.id, "Good");
    await reviewCard(TOPIC, b.id, "Again");
    expect(await reviewedToday(TOPIC)).toBe(2);
  });

  test("getProgress surfaces goal metric + counters", async () => {
    const p = await getProgress(TOPIC, "recalled");
    expect(p.goalMetric).toBe("recalled");
    expect(p.totalCards).toBe(2);
    expect(p.reviewedToday).toBe(2);
  });

  test("streak advances on consecutive days, holds same-day, resets on a gap", async () => {
    expect((await markActive(TOPIC, "2026-05-20")).streak).toBe(1);
    expect((await markActive(TOPIC, "2026-05-21")).streak).toBe(2);
    expect((await markActive(TOPIC, "2026-05-21")).streak).toBe(2); // idempotent within a day
    const reset = await markActive(TOPIC, "2026-05-25"); // gap
    expect(reset.streak).toBe(1);
    expect(reset.longest).toBe(2);
  });

  test("dangerZone is false after practicing today, true after a gap", async () => {
    await markActive(TOPIC, dayKey());
    expect((await getProgress(TOPIC)).dangerZone).toBe(false);
    await markActive(TOPIC, "2026-01-01");
    expect((await getProgress(TOPIC)).dangerZone).toBe(true);
  });

  test("dayKey honors RECALLIT_TZ so late-evening local time stays on its day", () => {
    // 03:00 UTC on Jun 5 is still 22:00 (Jun 4) in US Central.
    const lateNight = new Date("2026-06-05T03:00:00Z");
    expect(dayKey(lateNight)).toBe("2026-06-05"); // default UTC
    process.env.RECALLIT_TZ = "America/Chicago";
    try {
      expect(dayKey(lateNight)).toBe("2026-06-04"); // local calendar day
      // Streak math still works across consecutive LOCAL days.
      const yesterday = dayKey(new Date("2026-06-04T03:00:00Z")); // "2026-06-03" local
      expect(yesterday).toBe("2026-06-03");
    } finally {
      process.env.RECALLIT_TZ = undefined;
      delete process.env.RECALLIT_TZ;
    }
  });
});
