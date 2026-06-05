// The Spanish pack now ships as portable data under packs/spanish-mx-rgv (not a
// seed script). This asserts the pack's CONTENT quality — RGV dialect, voice
// modality, sentence-biased dialect-tagged cards, scenarios + audio. Installation
// is covered separately in install.test.ts.
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { loadPack } from "../src/pack.ts";

const PACK = join(import.meta.dir, "..", "packs", "spanish-mx-rgv");

describe("spanish pack content", () => {
  test("manifest: voice modality, minutes_spoken goal, RGV dialect + voice", async () => {
    const { manifest } = await loadPack(PACK);
    expect(manifest.modality).toBe("voice");
    expect(manifest.goalMetric).toBe("minutes_spoken");
    expect(manifest.meta.dialect).toBe("mx-rgv");
    expect(manifest.meta.voiceId).toBe("ewn5JTa3lNPY8QVuZJi6");
  });

  test("cards: dialect-tagged, biased toward sentences", async () => {
    const { cards } = await loadPack(PACK);
    expect(cards.length).toBeGreaterThanOrEqual(40);
    expect(cards.every((c) => (c.meta as { dialect?: string })?.dialect === "mx-rgv")).toBe(true);
    const sentences = cards.filter((c) => c.type === "sentence").length;
    expect(sentences / cards.length).toBeGreaterThan(0.5); // majority are sentences
  });

  test("ships the conversation scenarios + per-card native audio", async () => {
    const { cards, scenarios, assets } = await loadPack(PACK);
    expect(scenarios.length).toBeGreaterThanOrEqual(8);
    expect(scenarios).toContain("grocery-run");
    expect(assets.length).toBe(cards.length); // every card has a bundled mp3
  });
});
