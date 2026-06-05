// Progress + habit state. Reviews-today derive from review_log.jsonl; streak is
// kept in progress.json and advanced once per active day. Topic-agnostic: the
// goal-metric label comes from the topic config, the counters are universal.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { countCards } from "./db.ts";
import { reviewLogFile, topicDir } from "./paths.ts";

export interface ProgressState {
  lastActiveDay?: string;
  streak: number;
  longest: number;
}

export interface Progress {
  topic: string;
  goalMetric: string;
  totalCards: number;
  dueNow: number;
  reviewedToday: number;
  streak: number;
  longestStreak: number;
  /** True when a streak exists but today isn't done yet — at risk of breaking. */
  dangerZone: boolean;
}

const progressFile = (topicId: string): string => join(topicDir(topicId), "progress.json");

/**
 * Local day key "YYYY-MM-DD". Uses RECALLIT_TZ (an IANA zone, e.g.
 * "America/Chicago") so a learner's day boundary matches their wall clock;
 * falls back to UTC when unset. Keeps late-evening sessions on the right day.
 */
export function dayKey(d: Date = new Date()): string {
  const tz = process.env.RECALLIT_TZ;
  if (tz) {
    // en-CA formats as YYYY-MM-DD; timeZone shifts the calendar date.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  }
  return d.toISOString().slice(0, 10);
}

/** The calendar day before a "YYYY-MM-DD" key (pure date math, timezone-agnostic). */
function previousDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

async function readState(topicId: string): Promise<ProgressState> {
  const f = Bun.file(progressFile(topicId));
  if (!(await f.exists())) return { streak: 0, longest: 0 };
  return (await f.json()) as ProgressState;
}

async function writeState(topicId: string, s: ProgressState): Promise<void> {
  await Bun.write(progressFile(topicId), `${JSON.stringify(s, null, 2)}\n`);
}

export async function reviewedToday(topicId: string, today: string = dayKey()): Promise<number> {
  let text: string;
  try {
    text = await readFile(reviewLogFile(topicId), "utf8");
  } catch {
    return 0;
  }
  let n = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as { review_time?: string };
      // Convert the entry's UTC timestamp into the configured local day before
      // comparing, so counts agree with the streak's day boundary.
      if (typeof e.review_time === "string" && dayKey(new Date(e.review_time)) === today) n++;
    } catch {
      // skip malformed line
    }
  }
  return n;
}

/** Mark a day active and advance/reset the streak. Idempotent within a day. */
export async function markActive(
  topicId: string,
  today: string = dayKey(),
): Promise<ProgressState> {
  const s = await readState(topicId);
  if (s.lastActiveDay === today) return s;
  const yesterday = previousDay(today);
  s.streak = s.lastActiveDay === yesterday ? s.streak + 1 : 1;
  s.longest = Math.max(s.longest, s.streak);
  s.lastActiveDay = today;
  await writeState(topicId, s);
  return s;
}

export async function getProgress(
  topicId: string,
  goalMetric = "cards_recalled",
): Promise<Progress> {
  const { total, due } = countCards(topicId);
  const s = await readState(topicId);
  const today = dayKey();
  return {
    topic: topicId,
    goalMetric,
    totalCards: total,
    dueNow: due,
    reviewedToday: await reviewedToday(topicId, today),
    streak: s.streak,
    longestStreak: s.longest,
    dangerZone: s.streak > 0 && s.lastActiveDay !== today,
  };
}
