// Phase 2 core: the deterministic honesty gate (gateCards/writePack), resolveMode,
// and installPack's structural needs-review skip. No LLM — pure engine invariants.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDueCardIds } from "../src/db.ts";
import { installPack, planReinstall } from "../src/install.ts";
import type { PackCard } from "../src/pack.ts";
import { prepareSource, slugFromSource } from "../src/packgen/author.ts";
import { gateCards, writePack } from "../src/packgen/gate.ts";
import { resolveMode } from "../src/packgen/mode.ts";
import { getCard, listCards, reviewCard } from "../src/store.ts";

const card = (
  front: string,
  back: string,
  quote?: string,
  extra: Partial<PackCard> = {},
): PackCard => ({
  front,
  back,
  ...(quote !== undefined ? { meta: { sourceQuote: quote } } : {}),
  ...extra,
});

describe("gateCards", () => {
  const corpus = "The sky is blue on a clear day. Water boils at 100 degrees Celsius.";

  test("a grounded, clean card is ready", () => {
    const { ready, needsReview } = gateCards(
      [card("What color is the sky?", "Blue.", "The sky is blue")],
      corpus,
    );
    expect(ready.length).toBe(1);
    expect(needsReview.length).toBe(0);
  });

  test("a quote not in the corpus is flagged (the hallucination catch)", () => {
    const { ready, needsReview } = gateCards(
      [card("Who wrote it?", "Plato.", "Plato wrote the Republic")],
      corpus,
    );
    expect(ready.length).toBe(0);
    expect(needsReview[0]?.reasons).toContain("quote-not-in-corpus");
  });

  test("a missing source quote is flagged", () => {
    const { needsReview } = gateCards([card("x", "y")], corpus);
    expect(needsReview[0]?.reasons).toContain("missing-source-quote");
  });

  test("checkCardQuality flags ride through with a quality: prefix", () => {
    const { needsReview } = gateCards([card("blue", "blue", "The sky is blue")], corpus);
    expect(needsReview[0]?.reasons).toContain("quality:front-equals-back");
  });

  test("an unverified number in the answer is flagged", () => {
    // quote is in corpus, but the answer invents "212".
    const { needsReview } = gateCards(
      [card("Boiling point?", "212 degrees", "Water boils at 100 degrees")],
      corpus,
    );
    expect(needsReview[0]?.reasons).toContain("unverified-number");
  });

  test("a verified number passes", () => {
    const { ready } = gateCards(
      [
        card(
          "Boiling point of water?",
          "100 degrees Celsius",
          "Water boils at 100 degrees Celsius",
        ),
      ],
      corpus,
    );
    expect(ready.length).toBe(1);
  });

  test("duplicate fronts are flagged", () => {
    const c = card("The sky?", "Blue.", "The sky is blue");
    const { ready, needsReview } = gateCards(
      [c, card("the sky?", "Blue.", "The sky is blue")],
      corpus,
    );
    expect(ready.length).toBe(1);
    expect(needsReview[0]?.reasons).toContain("duplicate-front");
  });
});

describe("writePack", () => {
  let base: string;
  let dir: string;
  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), "recallit-writepack-"));
    dir = join(base, "wp-test");
    await mkdir(join(dir, ".author"), { recursive: true });
    await writeFile(
      join(dir, ".author", "source.txt"),
      "Bun is a fast JavaScript runtime built on JavaScriptCore.",
    );
  });
  afterAll(async () => {
    await rm(base, { recursive: true, force: true });
  });

  test("gates, stamps meta.status on flagged cards, and writes both files", async () => {
    const manifest = {
      schemaVersion: 1,
      engine: ">=0.1.0",
      id: "wp-test",
      name: "WP",
      modality: "text",
      meta: {},
    };
    const cards = [
      card("What is Bun?", "A fast JavaScript runtime.", "Bun is a fast JavaScript runtime"),
      card("Who made it?", "Jarred Sumner in 2021.", "an unrelated quote not present"),
    ];
    const v = await writePack(dir, manifest, cards);
    expect(v.ready).toBe(1);
    expect(v.total).toBe(2);
    expect(v.needsReview.length).toBe(1);

    const written = (await Bun.file(join(dir, "cards.json")).json()) as PackCard[];
    const flagged = written.find((c) => c.front === "Who made it?");
    expect(flagged?.meta?.status).toBe("needs-review");
    expect(flagged?.tags).toContain("needs-review");
    const ok = written.find((c) => c.front === "What is Bun?");
    expect(ok?.meta?.status).toBeUndefined();
  });

  test("rejects a basename/id mismatch", async () => {
    const manifest = {
      schemaVersion: 1,
      engine: ">=0.1.0",
      id: "different-id",
      name: "X",
      modality: "text",
      meta: {},
    };
    await expect(writePack(dir, manifest, [])).rejects.toThrow(/basename/);
  });

  test("rejects when there is no corpus", async () => {
    const empty = join(base, "no-corpus");
    await mkdir(empty, { recursive: true });
    const manifest = {
      schemaVersion: 1,
      engine: ">=0.1.0",
      id: "no-corpus",
      name: "X",
      modality: "text",
      meta: {},
    };
    await expect(writePack(empty, manifest, [])).rejects.toThrow(/corpus/);
  });
});

describe("resolveMode", () => {
  test("flags win", () => {
    expect(resolveMode("A", { flags: { auto: true } }).mode).toBe("A");
    expect(resolveMode("A", { flags: { review: true } }).mode).toBe("B");
  });
  test("CLI default is A; skill default is B", () => {
    expect(resolveMode("A", {}).mode).toBe("A");
    expect(resolveMode("B", {}).mode).toBe("B");
  });
  test("a skip-preview utterance forces A", () => {
    expect(resolveMode("B", { utterance: "just do it, no preview" }).mode).toBe("A");
  });
  test("a bare source token uses the surface default", () => {
    expect(resolveMode("B", { utterance: "./atomic-habits.pdf" }).mode).toBe("B");
    expect(resolveMode("B", { utterance: "github:colinhacks/zod" }).mode).toBe("B");
    expect(resolveMode("B", { utterance: "https://x.com/a.html" }).mode).toBe("B");
  });
  test("natural-language prose resolves to C", () => {
    expect(
      resolveMode("B", { utterance: "turn this pdf into a deck of only the actionable bits" }).mode,
    ).toBe("C");
  });
});

describe("prepareSource (offline classification)", () => {
  test("slugFromSource derives a clean pack id", () => {
    expect(slugFromSource("github:colinhacks/zod")).toBe("zod");
    expect(slugFromSource("./atomic-habits.pdf")).toBe("atomic-habits");
    expect(slugFromSource("https://x.com/articles/microservices.html")).toBe("microservices");
  });

  test("classifies url, concept, and file without network", async () => {
    const url = await prepareSource("https://example.com/x");
    expect(url.kind).toBe("url");
    await url.cleanup();

    const concept = await prepareSource("the causes of the first world war");
    expect(concept.kind).toBe("concept");
    await concept.cleanup();

    const base = await mkdtemp(join(tmpdir(), "recallit-prep-"));
    const fp = join(base, "notes.txt");
    await writeFile(fp, "hello");
    const file = await prepareSource(fp);
    expect(file.kind).toBe("file");
    expect(file.localPath).toBe(fp);
    await file.cleanup();
    await rm(base, { recursive: true, force: true });
  });
});

describe("installPack skips needs-review cards", () => {
  let base: string;
  let pack: string;
  let data: string;
  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), "recallit-install-skip-"));
    pack = join(base, "skip-test");
    await mkdir(pack, { recursive: true });
    await writeFile(
      join(pack, "manifest.json"),
      JSON.stringify({
        schemaVersion: 1,
        engine: ">=0.1.0",
        id: "skip-test",
        name: "Skip",
        modality: "text",
        meta: {},
      }),
    );
    await writeFile(
      join(pack, "cards.json"),
      JSON.stringify([
        { front: "A", back: "alpha", meta: { sourceQuote: "alpha" } },
        {
          front: "B",
          back: "beta",
          tags: ["needs-review"],
          meta: { status: "needs-review", reviewReasons: ["quote-not-in-corpus"] },
        },
      ]),
    );
    data = join(base, "data");
    process.env.RECALLIT_DATA_DIR = data;
  });
  afterAll(async () => {
    await rm(base, { recursive: true, force: true });
  });

  test("only ready cards install; needs-review is held", async () => {
    const res = await installPack(pack);
    expect(res.cards).toBe(1);
    expect(res.heldForReview).toBe(1);
    expect(getDueCardIds("skip-test").length).toBe(1);
  });
});

describe("non-destructive enhance (merge + planReinstall)", () => {
  let base: string;
  let dir: string;
  const cardObj = (front: string, back: string) => ({ front, back, meta: { sourceQuote: "x" } });
  const writeCards = (cards: unknown[]) =>
    writeFile(join(dir, "cards.json"), JSON.stringify(cards));

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), "recallit-enhance-"));
    dir = join(base, "enh-test");
    await mkdir(join(dir, ".author"), { recursive: true });
    await writeFile(join(dir, ".author", "source.txt"), "corpus");
    await writeFile(
      join(dir, "manifest.json"),
      JSON.stringify({
        schemaVersion: 1,
        engine: ">=0.1.0",
        id: "enh-test",
        name: "Enh",
        modality: "text",
        meta: {},
      }),
    );
    process.env.RECALLIT_DATA_DIR = join(base, "data");
  });
  afterAll(async () => {
    await rm(base, { recursive: true, force: true });
  });

  test("additive edit merges: adds new cards, preserves existing FSRS", async () => {
    await writeCards([cardObj("Alpha", "a"), cardObj("Beta", "b")]);
    await installPack(dir);
    const alpha = (await listCards("enh-test")).find((c) => c.front === "Alpha");
    expect(alpha).toBeDefined();
    // Advance Alpha's schedule.
    await reviewCard("enh-test", alpha?.id ?? "", "Good");
    expect((await getCard("enh-test", alpha?.id ?? ""))?.fsrs.reps).toBe(1);

    // Edit = add Gamma. planReinstall sees it as additive.
    await writeCards([cardObj("Alpha", "a"), cardObj("Beta", "b"), cardObj("Gamma", "g")]);
    const plan = await planReinstall("enh-test", dir);
    expect(plan).toMatchObject({
      topicExists: true,
      additive: true,
      added: 1,
      changedOrRemoved: 0,
    });

    const r = await installPack(dir, { merge: true });
    expect(r.cards).toBe(1); // only Gamma added
    expect((await listCards("enh-test")).length).toBe(3);
    // Alpha untouched — same id, FSRS preserved (NOT reset).
    expect((await getCard("enh-test", alpha?.id ?? ""))?.fsrs.reps).toBe(1);
  });

  test("a changed/removed card makes the edit non-additive (force needed)", async () => {
    await writeCards([cardObj("Alpha", "a"), cardObj("Delta", "d")]); // Beta + Gamma gone
    const plan = await planReinstall("enh-test", dir);
    expect(plan.additive).toBe(false);
    expect(plan.changedOrRemoved).toBeGreaterThanOrEqual(1);
  });
});
