// Re-runnable, in-repo reproduction of the examiner stress test (replaces the
// ephemeral workflow — see docs/design/tutor-multimodal.md). Runs the REAL
// examineAnswer over the committed fixtures K times each, recounts with the
// code-owned recountExaminer, and reports the brand-critical numbers:
// replay consistency, paraphrase-cluster consistency, evidence-fabrication, and
// near-miss-bait false-credit. Needs ANTHROPIC_API_KEY (it calls the model).
//
// Run:  bun run examiner:harness                 (REPEATS=3 default)
//       REPEATS=5 bun run examiner:harness       (match the workflow)
//       EXAMINER_MODEL=claude-opus-4-8 bun run examiner:harness
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RubricCheckpoint } from "../src/graders/coverage.ts";
import { examineAnswer, recountExaminer } from "../src/graders/examiner.ts";

interface Answer {
  id: string;
  text: string;
  gold: string;
  cluster?: string;
  bait?: boolean;
}
interface Fixture {
  id: string;
  front: string;
  rubric: RubricCheckpoint[];
  answers: Answer[];
}

const K = Number(process.env.REPEATS ?? 3);
const MODEL = process.env.EXAMINER_MODEL; // undefined => examiner default (sonnet-4-6)
const CONCURRENCY = 6;
const RANK: Record<string, number> = { Again: 0, Hard: 1, Good: 2, Easy: 3 };

const data = JSON.parse(
  readFileSync(join(import.meta.dir, "..", "test", "fixtures", "examiner-fixtures.json"), "utf8"),
);
const fixtures: Fixture[] = data.fixtures;

// One judged trial. rating "HOLD" when the examiner returns no confident result.
async function trial(fx: Fixture, ans: Answer) {
  const judgments = await examineAnswer({
    front: fx.front,
    rubric: fx.rubric,
    answer: ans.text,
    model: MODEL,
  });
  if (!judgments) return { fx: fx.id, ans: ans.id, rating: "HOLD", fab: 0, reqCredited: 0 };
  const rc = recountExaminer(fx.rubric, ans.text, judgments);
  const reqIds = new Set(fx.rubric.filter((c) => c.required).map((c) => c.id));
  // reqCredited: required checkpoints with a verified (non-fabricated) span — for the bait check.
  const hay = ans.text.toLowerCase().replace(/\s+/g, " ").trim();
  const reqCredited = judgments.filter(
    (j) =>
      j.demonstrated &&
      reqIds.has(j.checkpointId) &&
      j.evidence &&
      hay.includes(j.evidence.toLowerCase().replace(/\s+/g, " ").trim()),
  ).length;
  return { fx: fx.id, ans: ans.id, rating: rc.result.rating, fab: rc.fabricated, reqCredited };
}

const tasks: { fx: Fixture; ans: Answer }[] = [];
for (const fx of fixtures)
  for (const ans of fx.answers) for (let k = 0; k < K; k++) tasks.push({ fx, ans });
console.log(
  `examiner harness: ${fixtures.length} cards x answers x ${K} = ${tasks.length} judgments (model ${MODEL ?? "sonnet-4-6 default"}, concurrency ${CONCURRENCY})…`,
);

const results: Awaited<ReturnType<typeof trial>>[] = [];
for (let i = 0; i < tasks.length; i += CONCURRENCY) {
  const batch = tasks.slice(i, i + CONCURRENCY);
  results.push(...(await Promise.all(batch.map((t) => trial(t.fx, t.ans)))));
  process.stdout.write(`\r  ${Math.min(i + CONCURRENCY, tasks.length)}/${tasks.length}`);
}
console.log("");

// ── Aggregate (same math the workflow used) ────────────────────────
const byKey: Record<
  string,
  { fx: Fixture; ans: Answer; ratings: string[]; fab: number; baitCredit: number }
> = {};
for (const fx of fixtures)
  for (const ans of fx.answers)
    byKey[`${fx.id}/${ans.id}`] = { fx, ans, ratings: [], fab: 0, baitCredit: 0 };
let totFab = 0;
for (const r of results) {
  const e = byKey[`${r.fx}/${r.ans}`];
  e.ratings.push(r.rating);
  totFab += r.fab;
  if (e.ans.bait && r.reqCredited > 0) e.baitCredit++;
}
const modal = (a: string[]) => {
  const c: Record<string, number> = {};
  for (const x of a) c[x] = (c[x] || 0) + 1;
  let b = a[0],
    n = 0;
  for (const k of Object.keys(c))
    if (c[k] > n) {
      n = c[k];
      b = k;
    }
  return { v: b, f: n / a.length };
};
const rows = Object.values(byKey).map((e) => {
  const m = modal(e.ratings);
  return {
    fx: e.fx.id,
    id: e.ans.id,
    gold: e.ans.gold,
    cluster: e.ans.cluster,
    bait: !!e.ans.bait,
    modal: m.v,
    replay: Number(m.f.toFixed(2)),
    baitCredit: e.baitCredit,
  };
});
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const clusters: Record<string, string[]> = {};
for (const r of rows)
  if (r.cluster)
    (clusters[`${r.fx}/${r.cluster}`] = clusters[`${r.fx}/${r.cluster}`] || []).push(r.modal);
let cCons = 0,
  cTot = 0;
for (const k of Object.keys(clusters)) {
  cTot++;
  if (new Set(clusters[k]).size === 1) cCons++;
}
const bait = rows.filter((r) => r.bait);
const holds = rows.filter((r) => r.modal === "HOLD").length;

console.log("\nper-answer (modal rating · replay):");
for (const r of rows) {
  const flag = r.modal === r.gold ? "  " : "!=";
  console.log(
    `  ${flag} ${r.fx}/${r.id}  ${r.modal} (replay ${r.replay})  gold ${r.gold}${r.bait ? "  [bait]" : ""}`,
  );
}
console.log("\n=== AGGREGATE ===");
console.log(`  mean replay consistency : ${mean(rows.map((r) => r.replay)).toFixed(3)}`);
console.log(
  `  accuracy exact          : ${mean(rows.map((r) => (r.modal === r.gold ? 1 : 0))).toFixed(3)}`,
);
console.log(
  `  accuracy within-1-band  : ${mean(rows.map((r) => (Math.abs((RANK[r.modal] ?? -9) - RANK[r.gold]) <= 1 ? 1 : 0))).toFixed(3)}`,
);
console.log(`  paraphrase consistency  : ${cCons}/${cTot}`);
console.log(
  `  evidence fabrication    : ${totFab} unquotable span(s) dropped across ${results.length} trials`,
);
console.log(
  `  bait false-credit       : ${bait.filter((r) => r.baitCredit > 0).length}/${bait.length} answers credited in any run`,
);
console.log(`  HOLDs (no confident judgment): ${holds}/${rows.length}`);
