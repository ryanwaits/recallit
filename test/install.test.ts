// `topic add` resolver: installing a pack materializes a topic into
// RECALLIT_DATA_DIR through the engine primitives (so the sqlite index exists),
// copies audio + scenarios, gates on engine compat, and refuses to clobber.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDueCardIds } from "../src/db.ts";
import { assertEngineSatisfied, installPack } from "../src/install.ts";
import { cardAttemptFile } from "../src/paths.ts";
import { getActiveTopic, readTopicConfig } from "../src/topic.ts";

const FIXTURE = join(import.meta.dir, "fixtures", "pack-min");
const SPANISH = join(import.meta.dir, "..", "packs", "spanish-mx-rgv");

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "recallit-install-"));
  process.env.RECALLIT_DATA_DIR = dir;
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("assertEngineSatisfied", () => {
  test("accepts satisfiable ranges", () => {
    expect(() => assertEngineSatisfied(">=0.1.0", "0.1.0")).not.toThrow();
    expect(() => assertEngineSatisfied(">=0.1.0", "0.2.0")).not.toThrow();
    expect(() => assertEngineSatisfied("*", "0.1.0")).not.toThrow();
    expect(() => assertEngineSatisfied("^0.1.0", "0.1.5")).not.toThrow();
  });
  test("rejects unsatisfiable or malformed ranges", () => {
    expect(() => assertEngineSatisfied(">=99.0.0", "0.1.0")).toThrow(/engine/);
    expect(() => assertEngineSatisfied("garbage", "0.1.0")).toThrow(/engine/);
  });
});

describe("installPack", () => {
  test("installs the minimal fixture: topic written, card due, active", async () => {
    const res = await installPack(FIXTURE);
    expect(res.topicId).toBe("pack-min");
    expect(res.cards).toBe(1);
    expect(res.audio).toBe(0);
    expect((await readTopicConfig("pack-min"))?.modality).toBe("text");
    expect(getDueCardIds("pack-min").length).toBe(1);
    expect(await getActiveTopic()).toBe("pack-min");
  });

  test("installs the spanish pack with audio + scenarios", async () => {
    const res = await installPack(SPANISH);
    expect(res.cards).toBe(41);
    expect(res.audio).toBe(41);
    expect(res.scenarios).toBe(8);
    const due = getDueCardIds("spanish-mx-rgv");
    expect(due.length).toBe(41);
    // A card's audio landed as native.mp3 next to it, with media set.
    const cfg = await readTopicConfig("spanish-mx-rgv");
    expect(cfg?.meta.voiceId).toBe("ewn5JTa3lNPY8QVuZJi6");
    const sampleAudio = Bun.file(cardAttemptFile("spanish-mx-rgv", due[0] ?? "", "native.mp3"));
    expect(await sampleAudio.exists()).toBe(true);
  });

  test("refuses to clobber an existing topic without force", async () => {
    await expect(installPack(SPANISH)).rejects.toThrow(/already exists/);
  });

  test("force reinstall replaces without duplicating cards", async () => {
    const res = await installPack(SPANISH, { force: true, audio: false });
    expect(res.cards).toBe(41);
    expect(getDueCardIds("spanish-mx-rgv").length).toBe(41); // not 82
  });

  test("rejects a pack whose engine range the core can't satisfy", async () => {
    await expect(installPack(FIXTURE, { coreVersion: "0.0.1" })).rejects.toThrow(/engine/);
  });
});
