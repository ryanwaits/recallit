// Deterministic honesty + quality gate for generated packs. The engine owns the
// invariant: a card is `ready` only if its meta.sourceQuote is a literal substring
// of the source corpus (it cannot be vibe-bypassed by the model). Reason codes are a
// stable, sortable vocabulary every surface renders identically. This verifies quote
// PRESENCE, not entailment — the number/proper-noun checks are a mitigation, not proof.
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { z } from "zod";
import { normalize } from "../evaluate.ts";
import type { RubricCheckpoint } from "../graders/coverage.ts";
import { type PackCard, PackCardSchema, type PackManifest, PackManifestSchema } from "../pack.ts";
import { checkCardQuality } from "../quality.ts";

export interface CardVerdict {
  card: PackCard;
  reasons: string[];
}
export interface GateResult {
  ready: PackCard[];
  needsReview: CardVerdict[];
}

const normWS = (s: string): string => s.replace(/\s+/g, " ").trim().toLowerCase();

/** Digit sequences in `text` (drops trailing separators: "1,000." -> "1,000"). */
function numbersIn(text: string): string[] {
  return (text.match(/\d[\d.,]*/g) ?? []).map((n) => n.replace(/[.,]+$/, ""));
}

/** Title-case tokens that look like proper nouns (skips the first word of the string). */
function properNounsIn(text: string): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = (words[i] ?? "").replace(/[^A-Za-z'’-]/g, "");
    if (i > 0 && /^[A-Z][a-z'’-]{2,}$/.test(w)) out.push(w);
  }
  return out;
}

/**
 * Gate a draft set against the source corpus. A card is `ready` only if every check
 * passes; otherwise it lands in needsReview with machine reason codes:
 *   missing-source-quote · quote-not-in-corpus · rubric-empty ·
 *   rubric-point-not-in-corpus:<id> · unverified-number · unverified-proper-noun ·
 *   duplicate-front · quality:<checkCardQuality flag>
 * A checkable item (card.meta.rubric) grounds per-checkpoint instead of via one
 * top-level quote: every checkpoint's sourceQuote must be in the corpus, else held.
 */
export function gateCards(cards: PackCard[], corpus: string): GateResult {
  const corpusN = normWS(corpus);
  const ready: PackCard[] = [];
  const needsReview: CardVerdict[] = [];
  const seenFronts = new Set<string>();

  for (const card of cards) {
    const reasons: string[] = [];
    const context = card.context ?? "";
    const rubric = card.meta?.rubric as RubricCheckpoint[] | undefined;

    // Grounding: a flashcard cites one meta.sourceQuote; a checkable item cites a
    // verbatim sourceQuote per rubric checkpoint. Either way every quote must be a
    // literal substring of the corpus, or the whole card is held (fail-closed).
    let groundQuote: string;
    if (rubric) {
      if (rubric.length === 0) reasons.push("rubric-empty");
      for (const cp of rubric) {
        const cq = cp.sourceQuote?.trim();
        if (!cq || !corpusN.includes(normWS(cq))) {
          reasons.push(`rubric-point-not-in-corpus:${cp.id}`);
        }
      }
      groundQuote = rubric.map((cp) => cp.sourceQuote ?? "").join(" ");
    } else {
      const quote = (card.meta?.sourceQuote as string | undefined)?.trim();
      if (!quote) reasons.push("missing-source-quote");
      else if (!corpusN.includes(normWS(quote))) reasons.push("quote-not-in-corpus");
      groundQuote = quote ?? "";
    }

    // Checkable items carry a full exemplar answer, so skip the length heuristic.
    const q = checkCardQuality({
      front: card.front,
      back: card.back,
      context: card.context,
      longAnswerOk: rubric !== undefined,
    });
    for (const flag of q.flags) reasons.push(`quality:${flag.replace(/\s+/g, "-")}`);

    // A number / proper-noun in a FLASHCARD answer not grounded in quote+context+front
    // is a likely fabrication (mitigation, not a guarantee). Skipped for checkable items:
    // their `back` is an illustrative exemplar, NOT the grounding contract — the rubric
    // checkpoints (verified above) are, and the examiner grades a learner's free recall
    // against those, never the exemplar. Applied to prose the heuristic false-flags
    // sentence-initial title-case words ("The", "Signing") and incidental figures.
    if (!rubric) {
      const ground = normWS(`${groundQuote} ${context} ${card.front}`);
      if (numbersIn(card.back).some((n) => !ground.includes(n))) reasons.push("unverified-number");
      const groundNouns = new Set(
        properNounsIn(`${groundQuote} ${context} ${card.front}`).map((w) => w.toLowerCase()),
      );
      if (properNounsIn(card.back).some((n) => !groundNouns.has(n.toLowerCase()))) {
        reasons.push("unverified-proper-noun");
      }
    }

    const frontKey = normalize(card.front);
    if (seenFronts.has(frontKey)) reasons.push("duplicate-front");
    else seenFronts.add(frontKey);

    if (reasons.length === 0) ready.push(card);
    else needsReview.push({ card, reasons });
  }
  return { ready, needsReview };
}

export interface WriteVerdict {
  packDir: string;
  manifest: PackManifest;
  grounding: string;
  ready: number;
  total: number;
  needsReview: CardVerdict[];
}

const PACK_ID = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Validate + gate + write a pack to disk. Reads the grounding corpus from
 * <packDir>/.author/source.txt, gates the cards, stamps meta.status='needs-review'
 * (+ meta.reviewReasons) on flagged cards so the split is STRUCTURAL on disk, and
 * writes manifest.json + cards.json. installPack skips needs-review cards by default.
 */
export async function writePack(
  packDir: string,
  manifestInput: unknown,
  cardsInput: unknown,
): Promise<WriteVerdict> {
  const manifest = PackManifestSchema.parse(manifestInput);
  if (!PACK_ID.test(manifest.id)) {
    throw new Error(`invalid pack id "${manifest.id}" — must match ${PACK_ID}`);
  }
  if (basename(packDir) !== manifest.id) {
    throw new Error(
      `pack dir basename "${basename(packDir)}" must equal manifest id "${manifest.id}"`,
    );
  }
  const cards = z.array(PackCardSchema).parse(cardsInput);

  let corpus = "";
  try {
    corpus = await readFile(join(packDir, ".author", "source.txt"), "utf8");
  } catch {
    corpus = "";
  }
  if (!corpus.trim()) {
    throw new Error("no .author/source.txt corpus — ingest the source before writing the pack");
  }

  const { ready, needsReview } = gateCards(cards, corpus);
  const reasonsByCard = new Map(needsReview.map((v) => [v.card, v.reasons]));

  const stamped: PackCard[] = cards.map((c) => {
    const reasons = reasonsByCard.get(c);
    if (!reasons) return c;
    return {
      ...c,
      tags: Array.from(new Set([...(c.tags ?? []), "needs-review"])),
      meta: { ...(c.meta ?? {}), status: "needs-review", reviewReasons: reasons },
    };
  });

  await Bun.write(join(packDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await Bun.write(join(packDir, "cards.json"), `${JSON.stringify(stamped, null, 2)}\n`);

  return {
    packDir,
    manifest,
    grounding: (manifest.meta?.grounding as string) ?? "source",
    ready: ready.length,
    total: cards.length,
    needsReview,
  };
}
