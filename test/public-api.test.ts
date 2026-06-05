// Guards the package's public surface (the "." export = src/index.ts barrel) so
// the primitives external packs depend on can't silently drift, and confirms the
// "./cli" export is import-safe (no side effects without import.meta.main).
import { describe, expect, test } from "bun:test";
import * as api from "../src/index.ts";

// The primitives a pack author / external consumer is expected to import.
const REQUIRED_EXPORTS = [
  // cards + review
  "createCard",
  "updateCard",
  "deleteCard",
  "getCard",
  "getDueCards",
  "listCards",
  "searchCards",
  "reviewCard",
  // agent / session
  "createReviewSession",
  "runSession",
  // topics
  "createTopic",
  "readTopicConfig",
  "updateTopicConfig",
  "listTopics",
  "setActiveTopic",
  "getActiveTopic",
  // engine primitives
  "evaluateAnswer",
  "mineCard",
  "checkCardQuality",
  "gradeCard",
  "getProgress",
  // prompt builders
  "buildSystemPrompt",
  "buildDailySessionPrompt",
] as const;

describe("public API surface", () => {
  test("barrel exports every required primitive as a function", () => {
    for (const name of REQUIRED_EXPORTS) {
      expect(typeof (api as Record<string, unknown>)[name]).toBe("function");
    }
  });

  test("re-exports the FSRS Rating/State value enums", () => {
    expect(api.Rating).toBeDefined();
    expect(api.State).toBeDefined();
  });

  test('the "./cli" module is import-safe (does not run main on import)', async () => {
    // Under `bun test` import.meta.main is false for an imported module, so the
    // entrypoint must not execute or exit the process when imported.
    await expect(import("../src/cli.ts")).resolves.toBeDefined();
  });
});
