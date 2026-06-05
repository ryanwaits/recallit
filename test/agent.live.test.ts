// Live LLM integration smoke for the real Agent SDK loop. Opt-in only: requires
// RECALLIT_LIVE_TEST=1 and ANTHROPIC_API_KEY (so `bun test` stays offline/free).
// Validates the actual agent drives present -> respond -> reveal -> grade and stops.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AnswerProvider, createReviewSession, runSession } from "../src/agent.ts";
import { reviewedToday } from "../src/progress.ts";
import { createCard } from "../src/store.ts";
import { createTopic } from "../src/topic.ts";

const LIVE = !!process.env.RECALLIT_LIVE_TEST && !!process.env.ANTHROPIC_API_KEY;
let dir: string;
const TOPIC = "capitals";

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "recallit-live-"));
  process.env.RECALLIT_DATA_DIR = dir;
  await createTopic({ id: TOPIC, name: "World Capitals", modality: "text", meta: {} });
  await createCard(TOPIC, { front: "France", back: "Paris" });
  await createCard(TOPIC, { front: "Japan", back: "Tokyo" });
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("live agent loop", () => {
  test.skipIf(!LIVE)(
    "agent reviews due cards and completes",
    async () => {
      const answers: Record<string, string> = { France: "Paris", Japan: "Tokyo" };
      let answered = 0;
      const provider: AnswerProvider = async (_id, front) => {
        if (answered >= 2) return null;
        answered++;
        return answers[front] ?? "I don't know";
      };
      const session = createReviewSession(TOPIC, provider);
      const res = await runSession(session, { maxTurns: 40, maxBudgetUsd: 0.5 });

      expect(["success", "error_max_turns", "error_max_budget_usd"]).toContain(res.stopReason);
      expect(await reviewedToday(TOPIC)).toBeGreaterThanOrEqual(1);
    },
    120_000,
  );
});
