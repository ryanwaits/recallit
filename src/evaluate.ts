// Deterministic answer grader. This is the load-bearing invariant: FSRS quality
// depends on CONSISTENT ratings, so the rating is computed by code rule, not by
// agent judgment. The agent invokes evaluateAnswer; it does not decide the rating.
//
// v1 is lexical: exact -> Easy, accent/case/punctuation-only diff -> Good,
// near-miss (high similarity) -> Hard, otherwise -> Again. Semantic/synonym
// matching can layer on later behind the same interface (e.g. via embeddings).
import type { EvalRating, EvalResult } from "./types.ts";

export interface EvalOptions {
  /** Similarity at/above this counts as a near-miss (Hard) rather than Again. */
  hardThreshold?: number;
}

const DEFAULTS: Required<EvalOptions> = { hardThreshold: 0.7 };

/** Lowercase, strip diacritics, drop punctuation, collapse whitespace. */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalized, punctuation-free word tokens. Shared by the grader and the miner. */
export function tokenize(s: string): string[] {
  return normalize(s).split(" ").filter(Boolean);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min((curr[j - 1] ?? 0) + 1, (prev[j] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length] ?? 0;
}

function tokenJaccard(a: string, b: string): number {
  const sa = new Set(a.split(" ").filter(Boolean));
  const sb = new Set(b.split(" ").filter(Boolean));
  if (sa.size === 0 && sb.size === 0) return 1;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Similarity in 0..1 of two already-normalized strings. We take the max of raw
 * edit-distance similarity and a token-blended score so that a single-token typo
 * (where Jaccard is 0) still scores on its edit distance, while reordered/partial
 * phrases benefit from token overlap.
 */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  const edit = maxLen === 0 ? 1 : 1 - levenshtein(a, b) / maxLen;
  const jac = tokenJaccard(a, b);
  return Math.max(edit, 0.6 * edit + 0.4 * jac);
}

export function evaluateAnswer(
  answer: string,
  target: string | string[],
  options: EvalOptions = {},
): EvalResult {
  const opts = { ...DEFAULTS, ...options };
  const targets = Array.isArray(target) ? target : [target];
  const ansRaw = answer.trim();
  const ansNorm = normalize(answer);

  // Exact (modulo surrounding whitespace) against any acceptable answer -> Easy.
  if (targets.some((t) => t.trim() === ansRaw && ansRaw.length > 0)) {
    return { rating: "Easy", score: 1, reasons: ["exact match"] };
  }
  // Same once accents/case/punctuation are normalized -> Good.
  if (ansNorm.length > 0 && targets.some((t) => normalize(t) === ansNorm)) {
    return { rating: "Good", score: 0.95, reasons: ["matches after normalization"] };
  }

  const best = targets.reduce(
    (acc, t) => {
      const s = similarity(ansNorm, normalize(t));
      return s > acc.score ? { score: s, target: t } : acc;
    },
    { score: 0, target: targets[0] ?? "" },
  );

  let rating: EvalRating;
  const reasons: string[] = [`similarity ${best.score.toFixed(2)} vs "${best.target}"`];
  if (ansNorm.length === 0) {
    rating = "Again";
    reasons.push("empty answer");
  } else if (best.score >= opts.hardThreshold) {
    rating = "Hard";
    reasons.push("near miss");
  } else {
    rating = "Again";
    reasons.push("below threshold");
  }
  return { rating, score: best.score, reasons };
}
