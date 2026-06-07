// The examiner-grader's CODE-OWNED half: turn the agent-examiner's per-checkpoint
// judgments into an FSRS rating without trusting the model's word. Each judgment
// claims a checkpoint demonstrated + cites an evidence span; code re-verifies that
// span is literally in the LEARNER'S answer (the gate pointed inward), drops any it
// can't verify (anti-fabrication), then recounts coverage via the validated
// mapCoverageToRating. The model PROPOSES evidence; code DECIDES the rating.
//
// The async LLM call that PRODUCES the judgments lives separately (gated, flagged);
// this recount is pure + deterministic and is what the stress test measured.
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
