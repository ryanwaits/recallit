// Card CRUD + review orchestration: keeps the file (source of truth), the sqlite
// index (derived), and review_log.jsonl (append-only) consistent on every write.
import { appendFile, readdir, rm } from "node:fs/promises";
import { newCard, readCardFile, writeCardFile } from "./card.ts";
import type { DueQuery } from "./db.ts";
import { getDueCardIds, removeFromIndex, upsertIndex } from "./db.ts";
import { cardDir, cardsDir, reviewLogFile } from "./paths.ts";
import { type GradeOutcome, gradeCard } from "./scheduler.ts";
import type { EvalRating, Grade, NewCardInput, RecallCard } from "./types.ts";

export async function createCard(topicId: string, input: NewCardInput): Promise<RecallCard> {
  const card = newCard(input);
  await writeCardFile(topicId, card);
  upsertIndex(topicId, card);
  return card;
}

export const getCard = readCardFile;

export async function updateCard(
  topicId: string,
  cardId: string,
  patch: Partial<Omit<RecallCard, "id" | "fsrs">>,
): Promise<RecallCard | null> {
  const card = await readCardFile(topicId, cardId);
  if (!card) return null;
  const next: RecallCard = { ...card, ...patch, id: card.id, fsrs: card.fsrs };
  await writeCardFile(topicId, next);
  upsertIndex(topicId, next);
  return next;
}

export async function deleteCard(topicId: string, cardId: string): Promise<boolean> {
  const card = await readCardFile(topicId, cardId);
  if (!card) return false;
  await rm(cardDir(topicId, cardId), { recursive: true, force: true });
  removeFromIndex(topicId, cardId);
  return true;
}

export async function listCards(topicId: string): Promise<RecallCard[]> {
  let ids: string[] = [];
  try {
    ids = await readdir(cardsDir(topicId));
  } catch {
    return [];
  }
  const cards: RecallCard[] = [];
  for (const id of ids) {
    const c = await readCardFile(topicId, id);
    if (c) cards.push(c);
  }
  return cards;
}

export async function searchCards(topicId: string, query: string): Promise<RecallCard[]> {
  const q = query.toLowerCase();
  const all = await listCards(topicId);
  return all.filter(
    (c) =>
      c.front.toLowerCase().includes(q) ||
      c.back.toLowerCase().includes(q) ||
      (c.context ?? "").toLowerCase().includes(q) ||
      c.tags.some((t) => t.toLowerCase().includes(q)),
  );
}

export async function getDueCards(topicId: string, query: DueQuery = {}): Promise<RecallCard[]> {
  const ids = getDueCardIds(topicId, query);
  const cards: RecallCard[] = [];
  for (const id of ids) {
    const c = await readCardFile(topicId, id);
    if (c) cards.push(c);
  }
  return cards;
}

/** Load, grade via FSRS, persist (file + log + index). Returns the rescheduled card. */
export async function reviewCard(
  topicId: string,
  cardId: string,
  rating: EvalRating | Grade | string | number,
  now: Date = new Date(),
): Promise<GradeOutcome | null> {
  const card = await readCardFile(topicId, cardId);
  if (!card) return null;
  const outcome = gradeCard(card, rating, now);
  await writeCardFile(topicId, outcome.card);
  await appendFile(reviewLogFile(topicId), `${JSON.stringify(outcome.log)}\n`);
  upsertIndex(topicId, outcome.card);
  return outcome;
}
