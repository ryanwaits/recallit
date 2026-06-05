// Pure card file IO + FSRS<->frontmatter mapping. No index/db dependency here
// (store.ts orchestrates file + index together) to keep the dependency graph acyclic.
import matter from "gray-matter";
import { createEmptyCard, State } from "ts-fsrs";
import { cardFile } from "./paths.ts";
import type { FsrsCard, NewCardInput, RecallCard } from "./types.ts";

/** FSRS Card -> plain, JSON/YAML-safe object (Dates as ISO strings). */
function fsrsToPlain(c: FsrsCard): Record<string, unknown> {
  return {
    due: c.due.toISOString(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review ? c.last_review.toISOString() : null,
  };
}

/** Plain frontmatter object -> FSRS Card. Tolerant of missing fields. */
function plainToFsrs(o: Record<string, unknown> | undefined): FsrsCard {
  if (!o || o.due === undefined) return createEmptyCard();
  const num = (v: unknown, d = 0): number => (v === undefined || v === null ? d : Number(v));
  const lr = o.last_review;
  return {
    // YAML may parse ISO strings into Dates; `new Date` handles both.
    due: new Date(o.due as string | Date),
    stability: num(o.stability),
    difficulty: num(o.difficulty),
    elapsed_days: num(o.elapsed_days),
    scheduled_days: num(o.scheduled_days),
    learning_steps: num(o.learning_steps),
    reps: num(o.reps),
    lapses: num(o.lapses),
    state: num(o.state, State.New) as State,
    last_review: lr ? new Date(lr as string | Date) : undefined,
  };
}

export function serializeCard(card: RecallCard): string {
  const data: Record<string, unknown> = {
    id: card.id,
    type: card.type,
    front: card.front,
    back: card.back,
    tags: card.tags,
    fsrs: fsrsToPlain(card.fsrs),
  };
  if (card.context !== undefined) data.context = card.context;
  if (card.media !== undefined) data.media = card.media;
  if (card.source !== undefined) data.source = card.source;
  if (Object.keys(card.meta).length > 0) data.meta = card.meta;
  return matter.stringify(card.notes ? `\n${card.notes}\n` : "", data);
}

export function parseCard(raw: string, fallbackId: string): RecallCard {
  const { data, content } = matter(raw);
  return {
    id: (data.id as string) ?? fallbackId,
    type: (data.type as string) ?? "basic",
    front: (data.front as string) ?? "",
    back: (data.back as string) ?? "",
    context: data.context as string | undefined,
    media: data.media as string | undefined,
    tags: (data.tags as string[]) ?? [],
    source: data.source as string | undefined,
    meta: (data.meta as Record<string, unknown>) ?? {},
    notes: content.trim(),
    fsrs: plainToFsrs(data.fsrs as Record<string, unknown> | undefined),
  };
}

export function newCard(input: NewCardInput): RecallCard {
  return {
    id: crypto.randomUUID(),
    type: input.type ?? "basic",
    front: input.front,
    back: input.back,
    context: input.context,
    media: input.media,
    tags: input.tags ?? [],
    source: input.source,
    meta: input.meta ?? {},
    notes: input.notes ?? "",
    fsrs: createEmptyCard(),
  };
}

export async function readCardFile(topicId: string, cardId: string): Promise<RecallCard | null> {
  const f = Bun.file(cardFile(topicId, cardId));
  if (!(await f.exists())) return null;
  return parseCard(await f.text(), cardId);
}

export async function writeCardFile(topicId: string, card: RecallCard): Promise<void> {
  // Bun.write creates intermediate directories.
  await Bun.write(cardFile(topicId, card.id), serializeCard(card));
}
