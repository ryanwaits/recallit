// T25: checkpoint mechanics enabling resume from the last completed phase.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clearCheckpoint,
  markPhaseComplete,
  readCheckpoint,
  remainingPhases,
} from "../src/checkpoint.ts";
import { createTopic } from "../src/topic.ts";

let dir: string;
const TOPIC = "es";
const SID = "daily-2026-05-24";
const PHASES = ["shadowing", "review", "roleplay", "reflect"];

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "recallit-ckpt-"));
  process.env.RECALLIT_DATA_DIR = dir;
  await createTopic({ id: TOPIC, name: "Spanish", modality: "voice", meta: {} });
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("checkpoint", () => {
  test("records completed phases and computes the remainder", async () => {
    await markPhaseComplete(TOPIC, SID, "shadowing");
    await markPhaseComplete(TOPIC, SID, "review");
    const cp = await readCheckpoint(TOPIC);
    expect(cp?.completedPhases).toEqual(["shadowing", "review"]);
    expect(remainingPhases(PHASES, cp, SID)).toEqual(["roleplay", "reflect"]);
  });

  test("is idempotent for a repeated phase", async () => {
    await markPhaseComplete(TOPIC, SID, "review");
    expect((await readCheckpoint(TOPIC))?.completedPhases).toEqual(["shadowing", "review"]);
  });

  test("a different session id starts fresh", async () => {
    const cp = await markPhaseComplete(TOPIC, "daily-2026-05-25", "shadowing");
    expect(cp.completedPhases).toEqual(["shadowing"]);
    // remainder ignores a checkpoint from a different session
    expect(remainingPhases(PHASES, cp, "some-other-session")).toEqual(PHASES);
  });

  test("clear removes the checkpoint", async () => {
    await clearCheckpoint(TOPIC);
    expect(await readCheckpoint(TOPIC)).toBeNull();
  });
});
