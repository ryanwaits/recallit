// Content-quality guard: cheap, deterministic heuristics that flag low-confidence
// cards (especially agent-generated ones) so confidently-wrong items get a
// "needs-review" tag instead of silently entering the schedule. Advisory, not fatal.
import { normalize } from "./evaluate.ts";

export interface QualityResult {
  ok: boolean;
  flags: string[];
}

const PLACEHOLDER = /\b(todo|tbd|xxx|fixme)\b|\?\?\?/i;

export function checkCardQuality(input: {
  front: string;
  back: string;
  context?: string;
  /** Checkable items (explain/coverage cards) carry a full exemplar answer, so the
   * length heuristic is flashcard-only — set true to skip it. */
  longAnswerOk?: boolean;
}): QualityResult {
  const flags: string[] = [];
  if (!input.front.trim()) flags.push("missing front");
  if (!input.back.trim()) flags.push("missing answer");
  if (input.front.trim() && input.back.trim() && normalize(input.front) === normalize(input.back)) {
    flags.push("front equals back");
  }
  if (PLACEHOLDER.test(input.front) || PLACEHOLDER.test(input.back)) flags.push("placeholder text");
  if (!input.longAnswerOk && input.back.length > 240) flags.push("answer unusually long");
  return { ok: flags.length === 0, flags };
}
