// Generic, topic-agnostic domain types. Nothing here knows about any specific
// subject (language, etc.) — domain specifics live in TopicConfig.meta + cards.
import type { Card as FsrsCard } from "ts-fsrs";

export type { Card as FsrsCard, Grade } from "ts-fsrs";
export { Rating, State } from "ts-fsrs";

export type Modality = "text" | "voice" | "both";

export interface TopicConfig {
  id: string;
  name: string;
  /** Whether reviews are answered by typing, speaking, or either. */
  modality: Modality;
  /** Free-text pedagogy hint surfaced to the agent (e.g. "i+1 sentences, speak aloud"). */
  recallStyle?: string;
  /** Pedagogy template id (see styles/registry.ts) that shapes the session + "done".
   *  Absent => "recallit". Distinct from recallStyle (a free-text agent hint). */
  style?: string;
  /** The north-star metric this topic optimizes (e.g. "minutes_spoken"). */
  goalMetric?: string;
  /** Free-form domain config (e.g. { dialect: "mx-rgv" }). Never typed by the engine. */
  meta: Record<string, unknown>;
}

/** A course is recallit's container for "a subject" — structurally today's
 *  TopicConfig. The noun is migrating topic -> course; this alias lets new code use
 *  CourseConfig while the on-disk + internal topic naming is retired incrementally. */
export type CourseConfig = TopicConfig;

/** How a tutor's agent runs. Manifest values are DEFAULTS; a per-call RunOptions
 *  overrides them (see mergeAgentOptions). */
export interface AgentConfig {
  model?: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  /** Prose constraints injected into the tutor's system prompt. */
  guardrails?: string[];
}

/** A deployable tutor: a course (knowledge + style + modality) plus how its agent
 *  runs and which generative-UI surfaces it exposes. The portable artifact the
 *  runtime + surfaces consume. Agent/surfaces are optional fields on course.json,
 *  so an ordinary course loads as a tutor with engine defaults. */
export interface TutorManifest extends CourseConfig {
  agent?: AgentConfig;
  /** Generative-UI-registry surface ids this tutor exposes (Sprint 3). */
  surfaces?: string[];
}

export interface RecallCard {
  id: string;
  /** Card shape, e.g. "vocab" | "sentence" | "basic". Free-form. */
  type: string;
  front: string;
  back: string;
  /** Optional surrounding context (example sentence, source line). */
  context?: string;
  /** Relative path to a media file in the card dir (e.g. "media.mp3"). */
  media?: string;
  tags: string[];
  source?: string;
  /** Free-form domain metadata. */
  meta: Record<string, unknown>;
  /** Markdown body of item.md. */
  notes: string;
  /** FSRS scheduling state. */
  fsrs: FsrsCard;
}

export interface ReviewLogEntry {
  cardId: string;
  rating: number;
  state: number;
  due: string;
  stability: number;
  difficulty: number;
  scheduled_days: number;
  review_time: string;
}

export type EvalRating = "Again" | "Hard" | "Good" | "Easy";

export interface EvalResult {
  rating: EvalRating;
  /** Similarity 0..1 of the best-matching target. */
  score: number;
  reasons: string[];
}

export interface NewCardInput {
  type?: string;
  front: string;
  back: string;
  context?: string;
  media?: string;
  tags?: string[];
  source?: string;
  meta?: Record<string, unknown>;
  notes?: string;
}
