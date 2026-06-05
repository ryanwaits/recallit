// Derived due-query index (bun:sqlite). Files remain the source of truth; this
// exists only so get_due_cards is O(due) instead of scanning + parsing every card.
// Fully rebuildable from card files via rebuildIndex().
import { Database } from "bun:sqlite";
import { readdir } from "node:fs/promises";
import { readCardFile } from "./card.ts";
import { cardsDir, indexFile } from "./paths.ts";
import type { RecallCard } from "./types.ts";

function open(topicId: string): Database {
  const db = new Database(indexFile(topicId), { create: true });
  db.exec(`CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    due TEXT NOT NULL,
    state INTEGER NOT NULL,
    type TEXT,
    reps INTEGER,
    lapses INTEGER,
    updated_at TEXT
  );`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_cards_due ON cards(due);");
  return db;
}

function upsert(db: Database, card: RecallCard): void {
  db.query(
    `INSERT INTO cards (id, due, state, type, reps, lapses, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
     ON CONFLICT(id) DO UPDATE SET
       due = excluded.due, state = excluded.state, type = excluded.type,
       reps = excluded.reps, lapses = excluded.lapses, updated_at = excluded.updated_at`,
  ).run(
    card.id,
    card.fsrs.due.toISOString(),
    card.fsrs.state,
    card.type,
    card.fsrs.reps,
    card.fsrs.lapses,
    new Date().toISOString(),
  );
}

export function upsertIndex(topicId: string, card: RecallCard): void {
  const db = open(topicId);
  try {
    upsert(db, card);
  } finally {
    db.close();
  }
}

export function removeFromIndex(topicId: string, cardId: string): void {
  const db = open(topicId);
  try {
    db.query("DELETE FROM cards WHERE id = ?1").run(cardId);
  } finally {
    db.close();
  }
}

/** Rebuild the index from card files. Returns the number of cards indexed. */
export async function rebuildIndex(topicId: string): Promise<number> {
  const db = open(topicId);
  try {
    db.exec("DELETE FROM cards;");
    let ids: string[] = [];
    try {
      ids = await readdir(cardsDir(topicId));
    } catch {
      ids = [];
    }
    let n = 0;
    const tx = db.transaction((cards: RecallCard[]) => {
      for (const c of cards) upsert(db, c);
    });
    const loaded: RecallCard[] = [];
    for (const id of ids) {
      const card = await readCardFile(topicId, id);
      if (card) {
        loaded.push(card);
        n++;
      }
    }
    tx(loaded);
    return n;
  } finally {
    db.close();
  }
}

export interface DueQuery {
  now?: Date;
  limit?: number;
  /** Restrict to these card types. */
  types?: string[];
}

/** Card ids due at/before `now`, soonest first. ISO-UTC strings sort chronologically. */
export function getDueCardIds(topicId: string, query: DueQuery = {}): string[] {
  const now = (query.now ?? new Date()).toISOString();
  const limit = query.limit ?? 100;
  const db = open(topicId);
  try {
    if (query.types && query.types.length > 0) {
      const placeholders = query.types.map((_, i) => `?${i + 3}`).join(", ");
      const rows = db
        .query(
          `SELECT id FROM cards WHERE due <= ?1 AND type IN (${placeholders})
           ORDER BY due ASC LIMIT ?2`,
        )
        .all(now, limit, ...query.types) as { id: string }[];
      return rows.map((r) => r.id);
    }
    const rows = db
      .query("SELECT id FROM cards WHERE due <= ?1 ORDER BY due ASC LIMIT ?2")
      .all(now, limit) as { id: string }[];
    return rows.map((r) => r.id);
  } finally {
    db.close();
  }
}

export function countCards(topicId: string): { total: number; due: number } {
  const now = new Date().toISOString();
  const db = open(topicId);
  try {
    const total = (db.query("SELECT COUNT(*) AS n FROM cards").get() as { n: number }).n;
    const due = (
      db.query("SELECT COUNT(*) AS n FROM cards WHERE due <= ?1").get(now) as { n: number }
    ).n;
    return { total, due };
  } finally {
    db.close();
  }
}
