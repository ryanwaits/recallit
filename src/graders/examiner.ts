// The examiner-grader's CODE-OWNED half: turn the agent-examiner's per-checkpoint
// judgments into an FSRS rating without trusting the model's word. Each judgment
// claims a checkpoint demonstrated + cites an evidence span; code re-verifies that
// span is literally in the LEARNER'S answer (the gate pointed inward), drops any it
// can't verify (anti-fabrication), then recounts coverage via the validated
// mapCoverageToRating. The model PROPOSES evidence; code DECIDES the rating.
//
// The async LLM call that PRODUCES the judgments lives separately (gated, flagged);
// this recount is pure + deterministic and is what the stress test measured.
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { EvalResult } from "../types.ts";
import { type CoverageVector, coverageResult, type RubricCheckpoint } from "./coverage.ts";

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
    if (ev.length > 0 && hay.includes(ev)) valid.add(j.checkpointId);
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
  'Output ONLY a JSON object, no prose and no markdown fences: {"judgments":[{"checkpointId":"<id>","demonstrated":true|false,"evidence":"<verbatim span or empty>"}]}',
].join("\n");

export interface ExamineInput {
  front: string;
  rubric: RubricCheckpoint[];
  answer: string;
  model?: string;
}

function parseJudgments(text: string): ExaminerJudgment[] | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const o = JSON.parse(text.slice(start, end + 1)) as {
      judgments?: {
        checkpointId?: string;
        checkpoint_id?: string;
        demonstrated?: unknown;
        evidence?: unknown;
      }[];
    };
    if (!Array.isArray(o.judgments)) return null;
    return o.judgments.map((j) => ({
      checkpointId: String(j.checkpointId ?? j.checkpoint_id ?? ""),
      demonstrated: j.demonstrated === true,
      evidence: typeof j.evidence === "string" ? j.evidence : "",
    }));
  } catch {
    return null;
  }
}

/**
 * Ask the model to judge each checkpoint (one-shot, no tools). Returns the
 * judgments, or null to HOLD (no confident structured result). The rating is
 * decided later by recountExaminer — code, not the model.
 */
export async function examineAnswer(input: ExamineInput): Promise<ExaminerJudgment[] | null> {
  const rubricText = input.rubric
    .map(
      (c) =>
        `[${c.id}] (${c.required ? "required" : "bonus"}) ${c.claim}${c.sourceQuote ? `  (source: "${c.sourceQuote}")` : ""}`,
    )
    .join("\n");
  const prompt = `QUESTION: ${input.front}\n\nRUBRIC:\n${rubricText}\n\nLEARNER ANSWER:\n"${input.answer}"\n\nJudge each checkpoint now. Output ONLY the JSON object.`;

  let acc = "";
  let final = "";
  try {
    for await (const m of query({
      prompt,
      options: {
        systemPrompt: EXAMINER_SYSTEM,
        model: input.model ?? "claude-sonnet-4-6",
        maxTurns: 1,
      },
    })) {
      if (m.type === "result" && m.subtype === "success") final = m.result;
      else if (m.type === "assistant") {
        for (const b of m.message.content) if (b.type === "text") acc += b.text;
      }
    }
  } catch {
    return null; // transport/auth/etc. -> HOLD
  }
  return parseJudgments(final || acc);
}
