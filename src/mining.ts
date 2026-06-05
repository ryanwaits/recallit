// Sentence/concept mining with the one-new-thing (i+1) guardrail. This is the
// deterministic invariant the plan flagged: a mined card must introduce exactly
// ONE new element relative to what the learner already knows. The agent chooses
// the content + new element; the code enforces "only one new thing" + no dupes.
// Topic-agnostic: "element" = a normalized token; for language that's a word.
import { normalize, tokenize } from "./evaluate.ts";
import { checkCardQuality } from "./quality.ts";
import { createCard, listCards } from "./store.ts";
import type { RecallCard } from "./types.ts";

export class MiningError extends Error {}

/** Every normalized token appearing in any existing card (front/back/context/tags). */
export async function knownTokens(topicId: string): Promise<Set<string>> {
  const cards = await listCards(topicId);
  const set = new Set<string>();
  for (const c of cards) {
    for (const part of [c.front, c.back, c.context ?? "", c.tags.join(" ")]) {
      for (const tok of tokenize(part)) set.add(tok);
    }
  }
  return set;
}

export interface MineInput {
  /** The i+1 context (e.g. a sentence) containing the new element. */
  content: string;
  /** The single new thing to learn; must appear in content. */
  newElement: string;
  back?: string;
  type?: string;
  meta?: Record<string, unknown>;
}

export interface MineResult {
  card: RecallCard;
  qualityFlags: string[];
}

export async function mineCard(topicId: string, input: MineInput): Promise<MineResult> {
  const content = input.content.trim();
  const newElement = input.newElement.trim();
  if (!content || !newElement) throw new MiningError("content and newElement are required");

  const newTokens = new Set(tokenize(newElement));
  if (newTokens.size === 0) throw new MiningError("newElement has no tokens");

  const contentTokens = tokenize(content);
  const contentSet = new Set(contentTokens);
  for (const nt of newTokens) {
    if (!contentSet.has(nt)) {
      throw new MiningError(`newElement "${newElement}" does not appear in the content`);
    }
  }

  const known = await knownTokens(topicId);

  // 1T rule: the only unknown tokens in the content may belong to the new element.
  const extraUnknown = [...new Set(contentTokens)].filter(
    (t) => !known.has(t) && !newTokens.has(t),
  );
  if (extraUnknown.length > 0) {
    throw new MiningError(`more than one new element; also unknown: ${extraUnknown.join(", ")}`);
  }

  // No duplicate card for the same element (checked before "already known", since a
  // mined card adds its own tokens to the known set — duplicate is the precise signal).
  const key = normalize(newElement);
  const existing = await listCards(topicId);
  if (existing.some((c) => normalize(c.front) === key)) {
    throw new MiningError(`duplicate: "${newElement}" is already carded`);
  }

  // The new element must be genuinely new.
  if ([...newTokens].every((t) => known.has(t))) {
    throw new MiningError(`"${newElement}" is already known`);
  }

  const quality = checkCardQuality({ front: newElement, back: input.back ?? "", context: content });
  const tags = quality.ok ? ["mined"] : ["mined", "needs-review"];
  const meta = quality.ok ? (input.meta ?? {}) : { ...input.meta, qualityFlags: quality.flags };

  const card = await createCard(topicId, {
    type: input.type ?? "mined",
    front: newElement,
    back: input.back ?? "",
    context: content,
    source: "mined",
    tags,
    meta,
  });
  return { card, qualityFlags: quality.flags };
}
