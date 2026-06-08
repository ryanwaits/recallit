// Filesystem layout. Files are the source of truth; the sqlite index is derived.
// Data root is overridable via RECALLIT_DATA_DIR (tests point it at a temp dir).
import { homedir } from "node:os";
import { join } from "node:path";

// Default to a stable per-user home (~/.recallit) so the published CLI persists
// reviews regardless of cwd. RECALLIT_DATA_DIR overrides (tests + hosted tenancy).
export function dataRoot(): string {
  return process.env.RECALLIT_DATA_DIR ?? join(homedir(), ".recallit");
}

export const userFile = (): string => join(dataRoot(), "user.json");
export const topicsDir = (): string => join(dataRoot(), "topics");
export const topicDir = (topicId: string): string => join(topicsDir(), topicId);
/** Per-topic learner notes; scoped to the topic so notes don't bleed across subjects. */
export const contextFile = (topicId: string): string => join(topicDir(topicId), "context.md");
export const topicConfigFile = (topicId: string): string => join(topicDir(topicId), "topic.json");
export const cardsDir = (topicId: string): string => join(topicDir(topicId), "cards");
export const cardDir = (topicId: string, cardId: string): string => join(cardsDir(topicId), cardId);
export const cardFile = (topicId: string, cardId: string): string =>
  join(cardDir(topicId, cardId), "item.md");
export const indexFile = (topicId: string): string => join(topicDir(topicId), "index.sqlite");
export const reviewLogFile = (topicId: string): string =>
  join(topicDir(topicId), "review_log.jsonl");
export const scenariosDir = (topicId: string): string => join(topicDir(topicId), "scenarios");
export const sessionsDir = (): string => join(dataRoot(), "sessions");
export const sessionFile = (sessionId: string): string => join(sessionsDir(), `${sessionId}.md`);
/** A learner's recorded attempt (e.g. spoken audio) stored alongside its card. */
export const cardAttemptFile = (topicId: string, cardId: string, filename: string): string =>
  join(cardDir(topicId, cardId), filename);
