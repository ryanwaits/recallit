// Public API barrel. These functions are the engine's atomic primitives; in
// Sprint 2 they become the agent's tools (parity: anything the user/CLI can do).

export type { AnswerProvider, ReviewSession, RunOptions, RunResult } from "./agent.ts";
export { createReviewSession, runSession } from "./agent.ts";
export { newCard, parseCard, readCardFile, serializeCard, writeCardFile } from "./card.ts";
export type { Checkpoint } from "./checkpoint.ts";
export {
  clearCheckpoint,
  markPhaseComplete,
  readCheckpoint,
  remainingPhases,
  writeCheckpoint,
} from "./checkpoint.ts";
export type { SessionFacts } from "./context.ts";
export {
  appendContextNote,
  buildDailySessionPrompt,
  buildPracticePrompt,
  buildSystemPrompt,
  dailyPhases,
  gatherFacts,
} from "./context.ts";
export type { DueQuery } from "./db.ts";
export { countCards, getDueCardIds, rebuildIndex, removeFromIndex, upsertIndex } from "./db.ts";
export { evaluateAnswer, normalize, tokenize } from "./evaluate.ts";
export {
  type CoverageVector,
  checkCoverage,
  coverageResult,
  mapCoverageToRating,
  type RubricCheckpoint,
} from "./graders/coverage.ts";
export {
  type ExamineInput,
  type ExaminerJudgment,
  type ExaminerRecount,
  examineAnswer,
  recountExaminer,
} from "./graders/examiner.ts";
export { type Grader, gradeResponse, graderName, registerGrader } from "./graders/registry.ts";
export type { InstallOptions, InstallResult, ReinstallPlan } from "./install.ts";
export { assertEngineSatisfied, installPack, planReinstall } from "./install.ts";
export type { MineInput, MineResult } from "./mining.ts";
export { knownTokens, MiningError, mineCard } from "./mining.ts";
export type { LoadedPack, PackCard, PackManifest } from "./pack.ts";
export { loadPack, PACK_SCHEMA_VERSION, parsePackManifest } from "./pack.ts";
export type {
  PackAuthorOptions,
  PackAuthorResult,
  PreparedSource,
  SourceKind,
} from "./packgen/author.ts";
export { prepareSource, runPackAuthor, runPackEditor, slugFromSource } from "./packgen/author.ts";
export type { CardVerdict, GateResult, WriteVerdict } from "./packgen/gate.ts";
export { gateCards, writePack } from "./packgen/gate.ts";
export type { Mode, ModeResolution, ModeSignal } from "./packgen/mode.ts";
export { resolveMode } from "./packgen/mode.ts";
export type { Progress } from "./progress.ts";
export { dayKey, getProgress, markActive, reviewedToday } from "./progress.ts";
export type { QualityResult } from "./quality.ts";
export { checkCardQuality } from "./quality.ts";
export type { ResolvedSource, SourceDescriptor } from "./resolve.ts";
export { parseSource, resolvePackSource } from "./resolve.ts";
export { getScheduler, gradeCard, previewSchedule, toGrade } from "./scheduler.ts";
export {
  createCard,
  deleteCard,
  getCard,
  getDueCards,
  listCards,
  reviewCard,
  searchCards,
  updateCard,
} from "./store.ts";
export {
  DEFAULT_STYLE,
  type DoneCriterion,
  getStyle,
  registerStyle,
  type StyleDefinition,
  styleName,
} from "./styles/registry.ts";
export {
  createTopic,
  getActiveTopic,
  listTopics,
  readTopicConfig,
  setActiveTopic,
  updateTopicConfig,
} from "./topic.ts";
export type {
  AgentConfig,
  CourseConfig,
  EvalRating,
  EvalResult,
  FsrsCard,
  Grade,
  Modality,
  NewCardInput,
  RecallCard,
  ReviewLogEntry,
  TopicConfig,
  TutorManifest,
} from "./types.ts";
export { Rating, State } from "./types.ts";
