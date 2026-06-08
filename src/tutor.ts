// The deployable-tutor runtime: a thin, transport-blind front door over the agent
// loop. A TutorManifest (the portable artifact: course + agent config) plus a
// TutorIO (the host's I/O callbacks) is all you need to run a tutor anywhere — the
// SPA, the CLI, and any future generative-UI surface drive the SAME runSession
// through this one seam. The Claude Agent SDK lives in agent.ts, below this.
import {
  type AnswerProvider,
  createReviewSession,
  type ReviewSession,
  type RunOptions,
  type RunResult,
  runSession,
  type SessionEvent,
} from "./agent.ts";
import { readTopicConfig } from "./topic.ts";
import type { RecallCard, TutorManifest } from "./types.ts";

/** Load a tutor manifest from its course config (course.json). Agent config +
 *  surfaces are optional fields, so an ordinary course loads as a tutor that runs on
 *  engine defaults. Returns null if the course doesn't exist. */
export async function loadManifest(courseId: string): Promise<TutorManifest | null> {
  return (await readTopicConfig(courseId)) as TutorManifest | null;
}

/** The host's I/O for a tutor session — exactly the agent session's host-facing
 *  callbacks, formalized into one interface. Transport (WS/HTTP) and media (TTS/STT)
 *  live in the host's IMPLEMENTATIONS of these, never in the runtime. */
export interface TutorIO {
  /** Present a card's front and return the learner's answer (null = ended). Present
   *  and await are fused here, exactly as the agent loop expects. */
  answerProvider: AnswerProvider;
  /** Card-less spoken/typed turn for conversation/roleplay (optional). */
  converseProvider?: (say: string) => Promise<string | null>;
  /** Stream session events (assistant text, tool calls). */
  onEvent?: (e: SessionEvent) => void;
  /** A card's front changed mid-session (e.g. re-synthesize native audio). */
  onCardContentChanged?: (card: RecallCard) => Promise<void>;
  /** A card was graded — surface the code-owned rating + receipt to the learner. */
  onGraded?: (cardId: string, grade: { rating: string; reasons: string[] }) => void;
}

/** Build a ReviewSession wired to a TutorIO. The single place the I/O seam maps onto
 *  a session, shared by runTutor and the server so there is one definition. */
export function buildTutorSession(
  courseId: string,
  io: TutorIO,
  sessionId?: string,
): ReviewSession {
  const session = createReviewSession(courseId, io.answerProvider, io.onEvent, sessionId);
  session.converseProvider = io.converseProvider;
  session.onCardContentChanged = io.onCardContentChanged;
  session.onGraded = io.onGraded;
  return session;
}

/** Resolve run options for a tutor: the manifest's agent config provides DEFAULTS;
 *  a per-call RunOptions OVERRIDES them. Pure — unit-tested for precedence. */
export function mergeAgentOptions(manifest: TutorManifest, opts: RunOptions = {}): RunOptions {
  const a = manifest.agent ?? {};
  return {
    ...opts,
    model: opts.model ?? a.model,
    maxTurns: opts.maxTurns ?? a.maxTurns,
    maxBudgetUsd: opts.maxBudgetUsd ?? a.maxBudgetUsd,
    guardrails: opts.guardrails ?? a.guardrails,
  };
}

export interface RunTutorOptions extends RunOptions {
  /** Stable session id (e.g. daily-2026-06-08) so an interrupted run resumes. */
  sessionId?: string;
}

/** Run a tutor: build a session from the manifest + IO, apply the manifest's agent
 *  config (overridable per call), then run the agent loop. The headless front door —
 *  the same entry the SPA, CLI, and any surface use. Style/phases are resolved inside
 *  runSession from the course's style, so this never re-implements pedagogy. */
export async function runTutor(
  manifest: TutorManifest,
  io: TutorIO,
  opts: RunTutorOptions = {},
): Promise<RunResult> {
  const session = buildTutorSession(manifest.id, io, opts.sessionId);
  return runSession(session, mergeAgentOptions(manifest, opts));
}
