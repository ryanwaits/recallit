// Daily-session checkpoint. A daily session runs several phases; if it's killed
// (process exit, app backgrounded) it must resume from the last completed phase.
// One active checkpoint per topic, keyed by a stable per-day session id so a
// resume on the same day continues rather than restarting.
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { topicDir } from "./paths.ts";

export interface Checkpoint {
  sessionId: string;
  topicId: string;
  completedPhases: string[];
  updatedAt: string;
}

const checkpointFile = (topicId: string): string => join(topicDir(topicId), "active.checkpoint");

export async function readCheckpoint(topicId: string): Promise<Checkpoint | null> {
  const f = Bun.file(checkpointFile(topicId));
  if (!(await f.exists())) return null;
  return (await f.json()) as Checkpoint;
}

export async function writeCheckpoint(cp: Checkpoint): Promise<void> {
  const next = { ...cp, updatedAt: new Date().toISOString() };
  await Bun.write(checkpointFile(cp.topicId), `${JSON.stringify(next, null, 2)}\n`);
}

/** Record a completed phase. Starts fresh if the session id changed. */
export async function markPhaseComplete(
  topicId: string,
  sessionId: string,
  phase: string,
): Promise<Checkpoint> {
  const existing = await readCheckpoint(topicId);
  const cp: Checkpoint =
    existing && existing.sessionId === sessionId
      ? existing
      : { sessionId, topicId, completedPhases: [], updatedAt: "" };
  if (!cp.completedPhases.includes(phase)) cp.completedPhases.push(phase);
  await writeCheckpoint(cp);
  return cp;
}

export async function clearCheckpoint(topicId: string): Promise<void> {
  await rm(checkpointFile(topicId), { force: true });
}

/** Phases still to run, given a checkpoint for the same session. */
export function remainingPhases(
  all: string[],
  cp: Checkpoint | null,
  sessionId?: string,
): string[] {
  const done =
    cp && (!sessionId || cp.sessionId === sessionId) ? new Set(cp.completedPhases) : new Set();
  return all.filter((p) => !done.has(p));
}
