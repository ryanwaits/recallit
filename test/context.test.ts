// T8: the system prompt is assembled from live facts (due count, goal metric, topic).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendContextNote,
  buildDailySessionPrompt,
  buildPracticePrompt,
  buildSystemPrompt,
  gatherFacts,
  type SessionFacts,
} from "../src/context.ts";
import { createTopic } from "../src/topic.ts";
import type { TopicConfig } from "../src/types.ts";

const facts: SessionFacts = {
  topic: {
    id: "capitals",
    name: "World Capitals",
    modality: "text",
    goalMetric: "cards_recalled",
    meta: { region: "world" },
  },
  totalCards: 42,
  dueNow: 7,
  contextNotes: "Learner prefers terse hints.",
};

describe("buildSystemPrompt", () => {
  test("includes live due count, total, goal metric, and topic name", () => {
    const p = buildSystemPrompt(facts);
    expect(p).toContain("7 cards due for review now");
    expect(p).toContain("42 cards total");
    expect(p).toContain("cards_recalled");
    expect(p).toContain("World Capitals");
  });

  test("includes domain meta and learner context", () => {
    const p = buildSystemPrompt(facts);
    expect(p).toContain('"region":"world"');
    expect(p).toContain("Learner prefers terse hints.");
  });

  test("enforces the reveal-after-response rule in the prompt", () => {
    expect(buildSystemPrompt(facts)).toContain(
      "Never reveal a card's answer before await_user_response returns.",
    );
  });
});

describe("buildDailySessionPrompt", () => {
  test("text topic runs review + reflect, no shadowing", () => {
    const p = buildDailySessionPrompt(facts); // facts.topic.modality === "text"
    expect(p).toContain("review:");
    expect(p).toContain("reflect:");
    expect(p).not.toContain("shadowing:");
    expect(p).toContain("complete_phase");
  });

  test("voice topic adds shadowing + roleplay", () => {
    const voice: SessionFacts = { ...facts, topic: { ...facts.topic, modality: "voice" } };
    const p = buildDailySessionPrompt(voice);
    expect(p).toContain("shadowing:");
    expect(p).toContain("roleplay:");
  });

  test("honors a remaining-phases list (resume)", () => {
    const p = buildDailySessionPrompt(facts, ["reflect"]);
    expect(p).toContain("reflect:");
    expect(p).not.toContain("review:");
  });
});

describe("buildPracticePrompt", () => {
  test("includes tiered correction, mining, and the scenario", () => {
    const p = buildPracticePrompt(facts, "Ordering tacos at a stand.");
    expect(p).toContain("Recast");
    expect(p).toContain("Explicit");
    expect(p).toContain("Metalinguistic");
    expect(p).toContain("mine_card");
    expect(p).toContain("one-new-thing");
    expect(p).toContain("Ordering tacos at a stand.");
  });
});

describe("context.md is per-topic", () => {
  let dir: string;
  const A: TopicConfig = { id: "topic-a", name: "A", modality: "text", meta: {} };
  const B: TopicConfig = { id: "topic-b", name: "B", modality: "text", meta: {} };

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "recallit-context-"));
    process.env.RECALLIT_DATA_DIR = dir;
    await createTopic(A);
    await createTopic(B);
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("a note saved under one topic does not bleed into another", async () => {
    await appendContextNote(A.id, "A weak on past tense");
    const a = await gatherFacts(A.id, A);
    const b = await gatherFacts(B.id, B);
    expect(a.contextNotes).toContain("A weak on past tense");
    expect(b.contextNotes).toBe(""); // B never received A's note
  });
});
