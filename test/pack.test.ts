// Pack spec: manifest validation + the read-only loader. Exercised on a tiny
// fixture pack AND the real reference pack (packs/spanish-mx-rgv) so the format
// the installer (install.ts) depends on can't drift.
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { loadPack, parsePackManifest } from "../src/pack.ts";

const FIXTURE = join(import.meta.dir, "fixtures", "pack-min");
const SPANISH = join(import.meta.dir, "..", "packs", "spanish-mx-rgv");

describe("parsePackManifest", () => {
  const good = {
    schemaVersion: 1,
    engine: ">=0.1.0",
    id: "x",
    name: "X",
    modality: "text",
    meta: {},
  };

  test("accepts a well-formed manifest and defaults meta", () => {
    const m = parsePackManifest({ ...good, meta: undefined });
    expect(m.id).toBe("x");
    expect(m.meta).toEqual({});
  });

  test("rejects wrong schemaVersion, missing engine, bad modality", () => {
    expect(() => parsePackManifest({ ...good, schemaVersion: 2 })).toThrow(/schemaVersion/);
    const { engine: _e, ...noEngine } = good;
    expect(() => parsePackManifest(noEngine)).toThrow(/engine/);
    expect(() => parsePackManifest({ ...good, modality: "sound" })).toThrow(/modality/);
  });
});

describe("loadPack", () => {
  test("loads the minimal fixture pack", async () => {
    const p = await loadPack(FIXTURE);
    expect(p.manifest.id).toBe("pack-min");
    expect(p.manifest.modality).toBe("text");
    expect(p.cards.length).toBe(1);
    expect(p.cards[0]?.front).toBe("2 + 2");
    expect(p.scenarios).toEqual([]);
    expect(p.assets).toEqual([]);
  });

  test("loads the spanish-mx-rgv reference pack with audio + scenarios", async () => {
    const p = await loadPack(SPANISH);
    expect(p.manifest.modality).toBe("voice");
    expect(p.manifest.meta.voiceId).toBe("ewn5JTa3lNPY8QVuZJi6");
    expect(p.cards.length).toBe(41);
    expect(p.cards.every((c) => typeof c.audio === "string")).toBe(true);
    expect(p.scenarios).toContain("grocery-run");
    expect(p.assets.length).toBe(41);
  });
});
