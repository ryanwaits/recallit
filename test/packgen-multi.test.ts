// F2.1: multi-source authoring. The live N-source author loop is keyed (covered by
// the studio dogfood); here we test the deterministic pieces — append-mode corpus,
// prepareSources, and the multi-source prompt. Single-source stays byte-identical
// (runPackAuthor still routes through the unchanged buildPrompt).
import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendCorpus, buildPromptMulti, prepareSources } from "../src/packgen/author.ts";

describe("multi-source authoring", () => {
  test("appendCorpus: first write is plain; later writes append with a separator", async () => {
    const dir = await mkdtemp(join(tmpdir(), "recallit-corpus-"));
    await appendCorpus(dir, "alpha text");
    const after1 = await Bun.file(join(dir, ".author", "source.txt")).text();
    expect(after1).toBe("alpha text"); // single-source corpus identical to a plain write

    await appendCorpus(dir, "beta text");
    const after2 = await Bun.file(join(dir, ".author", "source.txt")).text();
    expect(after2).toBe("alpha text\n\n===== additional source =====\n\nbeta text");
    expect(after2).toContain("alpha text");
    expect(after2).toContain("beta text");
  });

  test("prepareSources prepares every source", async () => {
    const dir = await mkdtemp(join(tmpdir(), "recallit-src-"));
    const a = join(dir, "a.txt");
    const b = join(dir, "b.txt");
    await Bun.write(a, "one");
    await Bun.write(b, "two");
    const preps = await prepareSources([a, b]);
    expect(preps).toHaveLength(2);
    expect(preps.every((p) => p.kind === "file")).toBe(true);
    await Promise.all(preps.map((p) => p.cleanup()));
  });

  test("buildPromptMulti references every source + a sources[] manifest", async () => {
    const dir = await mkdtemp(join(tmpdir(), "recallit-src2-"));
    const a = join(dir, "a.txt");
    const b = join(dir, "b.txt");
    await Bun.write(a, "one");
    await Bun.write(b, "two");
    const preps = await prepareSources([a, b]);
    const prompt = buildPromptMulti(preps, { scope: "cost" });
    expect(prompt).toContain("these 2 sources");
    expect(prompt).toContain(a);
    expect(prompt).toContain(b);
    expect(prompt).toContain("meta: { sources:");
    expect(prompt).toContain("Scope/focus: cost");
    await Promise.all(preps.map((p) => p.cleanup()));
  });
});
