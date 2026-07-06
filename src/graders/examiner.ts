// The examiner-grader's CODE-OWNED half: turn the agent-examiner's per-checkpoint
// judgments into an FSRS rating without trusting the model's word. Each judgment
// claims a checkpoint demonstrated + cites an evidence span; code re-verifies that
// span is literally in the LEARNER'S answer (the gate pointed inward), drops any it
// can't verify (anti-fabrication), then recounts coverage via the validated
// mapCoverageToRating. The model PROPOSES evidence; code DECIDES the rating.
//
// The async LLM call that PRODUCES the judgments lives separately (gated, flagged);
// this recount is pure + deterministic and is what the stress test measured.
import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, type LanguageModel, Output } from "ai";
import { z } from "zod";
import type { EvalResult, RecallCard } from "../types.ts";
import {
  type CoverageVector,
  checkCoverage,
  coverageResult,
  type RubricCheckpoint,
} from "./coverage.ts";

export interface ExaminerJudgment {
  checkpointId: string;
  demonstrated: boolean;
  /** Verbatim span the examiner says shows it — re-verified against the answer. */
  evidence: string;
}

export interface ExaminerRecount {
  result: EvalResult;
  /** Demonstrated claims whose evidence was NOT literally in the answer (dropped). */
  fabricated: number;
}

// Whitespace/case-normalized substring check — the same tolerance the honesty gate
// uses for quote-in-corpus, here pointed at the learner's answer.
const normWS = (s: string): string => s.toLowerCase().replace(/\s+/g, " ").trim();

// Small models copy the rubric's "[id]" formatting into checkpointId instead of the
// bare id; an exact-match miss there would silently drop a genuinely demonstrated
// checkpoint. Strip decoration before matching (rubric ids are plain slugs).
const normId = (s: string): string =>
  s
    .trim()
    .replace(/^\[+|\]+$/g, "")
    .trim();

/**
 * Recount examiner judgments into a rating. Pure + deterministic given the
 * judgments. A `demonstrated` checkpoint counts ONLY if its evidence span is a
 * literal (ws/case-normalized) substring of the answer; otherwise it is dropped as
 * fabricated and treated as not demonstrated. Then coverage -> rating, code-owned.
 */
export function recountExaminer(
  rubric: RubricCheckpoint[],
  answer: string,
  judgments: ExaminerJudgment[],
): ExaminerRecount {
  const hay = normWS(answer);
  const valid = new Set<string>();
  let fabricated = 0;
  for (const j of judgments) {
    if (!j.demonstrated) continue;
    const ev = normWS(j.evidence);
    if (ev.length > 0 && hay.includes(ev)) valid.add(normId(j.checkpointId));
    else fabricated++; // claimed demonstrated, but the cited span isn't in the answer
  }
  const req = rubric.filter((c) => c.required);
  const bonus = rubric.filter((c) => !c.required);
  const vector: CoverageVector = {
    requiredHit: req.filter((c) => valid.has(c.id)).length,
    requiredTotal: req.length,
    bonusHit: bonus.filter((c) => valid.has(c.id)).length,
    bonusTotal: bonus.length,
  };
  const base = coverageResult(vector);
  const result = fabricated
    ? { ...base, reasons: [...base.reasons, `${fabricated} unquotable claim(s) dropped`] }
    : base;
  return { result, fabricated };
}

// ── The async examiner: PRODUCES the judgments (the model's only job) ──────────
// It decides demonstrated/not + cites a span; it NEVER picks a rating. Returns
// null on any failure to produce a confident, parseable structured result — the
// "unconfident never grades, it HOLDS" invariant (the caller holds, never guesses).

const EXAMINER_SYSTEM = [
  "You are recallit's grading examiner. You are given a rubric of checkpoints (each a CLAIM plus a SOURCE QUOTE = the grounded truth) and a learner's free-recall answer.",
  "For EACH checkpoint decide whether the learner demonstrated that specific point IN ANY WORDING. Reward MEANING, not keyword overlap — but NEVER mark a checkpoint demonstrated unless the answer actually expresses that point (fluent, on-topic prose that doesn't contain the point is NOT demonstrated).",
  "evidence MUST be an exact verbatim substring copied from the LEARNER ANSWER (empty string when not demonstrated). Do not paraphrase the evidence; copy it.",
  'checkpointId MUST be the bare id exactly as given in the rubric (e.g. "a", not "[a]").',
].join("\n");

export interface ExamineInput {
  front: string;
  rubric: RubricCheckpoint[];
  answer: string;
  model?: string;
}

const JudgmentsSchema = z.object({
  judgments: z.array(
    z.object({
      checkpointId: z.string(),
      demonstrated: z.boolean(),
      evidence: z.string(),
    }),
  ),
});

/** Which model backs the examiner. An explicit OpenAI-compatible endpoint (Ollama,
 * LM Studio, vLLM, OpenRouter, …) wins; otherwise ANTHROPIC_API_KEY selects
 * Anthropic; otherwise null and the grader uses the deterministic floor. */
export interface ExaminerProvider {
  kind: "openai-compatible" | "anthropic";
  model: string;
  baseURL?: string;
  apiKey?: string;
}

/**
 * Resolve the examiner's model provider from the environment:
 *   RECALLIT_EXAMINER_URL    — an OpenAI-compatible /v1 base URL (e.g. a local
 *                              Ollama at http://localhost:11434/v1)
 *   RECALLIT_EXAMINER_MODEL  — model id (required with URL; overrides the
 *                              Anthropic default otherwise)
 *   RECALLIT_EXAMINER_KEY    — optional bearer token for that endpoint
 * A URL without a model is a loud config error, not a silent floor — the user
 * explicitly opted into a custom examiner and should hear that it's half-wired.
 */
export function resolveExaminerProvider(
  env: Record<string, string | undefined> = process.env,
): ExaminerProvider | null {
  const baseURL = env.RECALLIT_EXAMINER_URL?.trim();
  const model = env.RECALLIT_EXAMINER_MODEL?.trim();
  if (baseURL) {
    if (!model) {
      throw new Error(
        "RECALLIT_EXAMINER_URL is set but RECALLIT_EXAMINER_MODEL is not — set it to the model id your endpoint serves (e.g. qwen2.5:1.5b)",
      );
    }
    return {
      kind: "openai-compatible",
      baseURL,
      model,
      apiKey: env.RECALLIT_EXAMINER_KEY?.trim() || undefined,
    };
  }
  if (env.ANTHROPIC_API_KEY?.trim()) {
    return { kind: "anthropic", model: model || "claude-sonnet-4-6" };
  }
  return null;
}

function examinerModel(p: ExaminerProvider, override?: string): LanguageModel {
  const id = override ?? p.model;
  if (p.kind === "openai-compatible") {
    // Ollama's shim doesn't advertise structured-output support; without this
    // flag the SDK refuses to send the JSON schema and grading falls apart.
    return createOpenAICompatible({
      name: "recallit-examiner",
      baseURL: p.baseURL as string,
      apiKey: p.apiKey,
      supportsStructuredOutputs: true,
    })(id);
  }
  return anthropic(id);
}

/**
 * Ask the model to judge each checkpoint (one-shot, no tools). Returns the
 * judgments, or null to HOLD (no confident structured result). The rating is
 * decided later by recountExaminer — code, not the model.
 */
export async function examineAnswer(input: ExamineInput): Promise<ExaminerJudgment[] | null> {
  const provider = resolveExaminerProvider();
  if (!provider) return null;
  const rubricText = input.rubric
    .map(
      (c) =>
        `[${c.id}] (${c.required ? "required" : "bonus"}) ${c.claim}${c.sourceQuote ? `  (source: "${c.sourceQuote}")` : ""}`,
    )
    .join("\n");
  const prompt = `QUESTION: ${input.front}\n\nRUBRIC:\n${rubricText}\n\nLEARNER ANSWER:\n"${input.answer}"\n\nJudge each checkpoint now.`;

  try {
    const { output } = await generateText({
      model: examinerModel(provider, input.model),
      system: EXAMINER_SYSTEM,
      prompt,
      output: Output.object({ schema: JudgmentsSchema }),
    });
    return output.judgments;
  } catch {
    return null; // transport/auth/schema-mismatch -> HOLD
  }
}

/** Examiner gating: ON by default (the floor can't grade free-recall); opt OUT
 * with RECALLIT_EXAMINER=0 for offline/deterministic-only runs (CI, the floor). */
export const examinerEnabled = (): boolean => process.env.RECALLIT_EXAMINER !== "0";

/**
 * The registered `coverage` grader. By default it grades via the LLM examiner
 * (judgments -> code-verified recount) against whichever provider
 * resolveExaminerProvider finds. RECALLIT_EXAMINER=0, or no provider at all
 * (no endpoint configured and no ANTHROPIC_API_KEY), uses the deterministic
 * floor instead (near-verbatim only — see the doc) — a missing provider is an
 * environment fact, not an unconfident judgment, so it degrades quietly rather
 * than holding. If the examiner DOES run but can't produce a confident
 * judgment, that still THROWS rather than silently mis-grade (HOLD).
 */
export async function examinerCoverageGrader(
  card: RecallCard,
  response: string,
): Promise<EvalResult> {
  const rubric = card.meta?.rubric as RubricCheckpoint[] | undefined;
  if (!rubric || rubric.length === 0) {
    throw new Error(`coverage grader: card ${card.id} has no meta.rubric`);
  }
  if (examinerEnabled() && resolveExaminerProvider() !== null) {
    const judgments = await examineAnswer({ front: card.front, rubric, answer: response });
    if (!judgments) {
      throw new Error(`examiner held on card ${card.id}: no confident judgment (not graded)`);
    }
    return recountExaminer(rubric, response, judgments).result;
  }
  return coverageResult(checkCoverage(rubric, response)); // deterministic floor fallback
}
