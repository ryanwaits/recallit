// Sprint 2: the deployable-tutor runtime. loadManifest reads the portable artifact
// from course.json (agent/surfaces optional); mergeAgentOptions enforces "manifest =
// default, per-call opts override"; buildTutorSession wires the whole TutorIO seam
// onto a session. The live agent loop (runTutor -> runSession -> query) is covered by
// the key-gated live tests; here we prove the wiring + precedence without a key.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { topicConfigFile } from "../src/paths.ts";
import { readTopicConfig } from "../src/topic.ts";
import { buildTutorSession, loadManifest, mergeAgentOptions, type TutorIO } from "../src/tutor.ts";
import type { TutorManifest } from "../src/types.ts";

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "recallit-tutor-"));
  process.env.RECALLIT_DATA_DIR = dir;
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const writeCourse = (id: string, cfg: object) =>
  Bun.write(topicConfigFile(id), `${JSON.stringify(cfg, null, 2)}\n`);

describe("loadManifest", () => {
  test("a plain course loads as a tutor with engine defaults (bit-identical to its config)", async () => {
    await writeCourse("plain", { id: "plain", name: "Plain", modality: "text", meta: {} });
    const m = await loadManifest("plain");
    expect(m).toEqual((await readTopicConfig("plain")) as TutorManifest);
    expect(m?.agent).toBeUndefined();
    expect(m?.surfaces).toBeUndefined();
  });

  test("agent config + surfaces round-trip from course.json", async () => {
    await writeCourse("rich", {
      id: "rich",
      name: "Rich",
      modality: "text",
      meta: {},
      agent: { model: "claude-haiku-4-5", maxTurns: 10, guardrails: ["be concise"] },
      surfaces: ["drill", "voice"],
    });
    const m = await loadManifest("rich");
    expect(m?.agent).toEqual({
      model: "claude-haiku-4-5",
      maxTurns: 10,
      guardrails: ["be concise"],
    });
    expect(m?.surfaces).toEqual(["drill", "voice"]);
  });

  test("a missing course returns null", async () => {
    expect(await loadManifest("nope")).toBeNull();
  });
});

describe("mergeAgentOptions (manifest = default, per-call opts override)", () => {
  const manifest: TutorManifest = {
    id: "t",
    name: "T",
    modality: "text",
    meta: {},
    agent: { model: "haiku", maxTurns: 10, maxBudgetUsd: 2, guardrails: ["g"] },
  };

  test("manifest agent config supplies defaults", () => {
    expect(mergeAgentOptions(manifest)).toMatchObject({
      model: "haiku",
      maxTurns: 10,
      maxBudgetUsd: 2,
      guardrails: ["g"],
    });
  });

  test("per-call opts win over manifest defaults", () => {
    const merged = mergeAgentOptions(manifest, { model: "opus", maxTurns: 5 });
    expect(merged).toMatchObject({
      model: "opus",
      maxTurns: 5,
      maxBudgetUsd: 2,
      guardrails: ["g"],
    });
  });

  test("a course with no agent block leaves fields undefined unless opts set them", () => {
    const plain: TutorManifest = { id: "t", name: "T", modality: "text", meta: {} };
    expect(mergeAgentOptions(plain).model).toBeUndefined();
    expect(mergeAgentOptions(plain, { model: "opus" }).model).toBe("opus");
  });
});

describe("buildTutorSession", () => {
  test("wires every TutorIO callback onto the session", () => {
    const io: TutorIO = {
      answerProvider: async () => "x",
      converseProvider: async () => "y",
      onEvent: () => {},
      onCardContentChanged: async () => {},
      onGraded: () => {},
    };
    const s = buildTutorSession("course-id", io, "sess-1");
    expect(s.id).toBe("sess-1");
    expect(s.topicId).toBe("course-id");
    expect(s.answerProvider).toBe(io.answerProvider);
    expect(s.converseProvider).toBe(io.converseProvider);
    expect(s.onCardContentChanged).toBe(io.onCardContentChanged);
    expect(s.onGraded).toBe(io.onGraded);
    expect(s.onEvent).toBe(io.onEvent);
  });
});
