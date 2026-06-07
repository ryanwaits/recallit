// Bake a RECORDED comprehension-grade for the keyless demo: run the real examiner
// on a strong + a weak free-recall answer to an architecture checkable card, and
// write window.RECALLIT_TUTOR (rating + coverage receipt + per-checkpoint cited
// source lines) to marketing/demo/tutor.js. Recorded artifact (the examiner is an
// LLM call) — re-run to refresh. Needs ANTHROPIC_API_KEY.
//
// Run: bun run scripts/bake-tutor-demo.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RubricCheckpoint } from "../src/graders/coverage.ts";
import { examineAnswer, recountExaminer } from "../src/graders/examiner.ts";

const PACK = join(import.meta.dir, "..", "packs", "architecture");
const cards = JSON.parse(readFileSync(join(PACK, "cards.json"), "utf8"));
const card = cards.find(
  (c: { meta?: { status?: string; grader?: string; rubric?: unknown } }) =>
    c.meta?.status !== "needs-review" && c.meta?.grader === "coverage",
);
if (!card) throw new Error("no ready checkable card in packs/architecture");
const rubric: RubricCheckpoint[] = card.meta.rubric;
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

const ANSWERS = [
  { label: "A strong answer", text: card.back as string },
  {
    label: "A vague answer",
    text: "It's pretty flexible and works with lots of different subjects, so you can use it for whatever you want to learn.",
  },
];

const baked = [];
for (const a of ANSWERS) {
  const judgments = (await examineAnswer({ front: card.front, rubric, answer: a.text })) ?? [];
  const rc = recountExaminer(rubric, a.text, judgments);
  const na = norm(a.text);
  const checkpoints = rubric.map((cp) => {
    const j = judgments.find((x) => x.checkpointId === cp.id);
    const ev = j?.evidence ? norm(j.evidence) : "";
    const hit = !!j?.demonstrated && ev.length > 0 && na.includes(ev);
    return { claim: cp.claim, required: cp.required, hit, evidence: hit ? j?.evidence : "", sourceQuote: cp.sourceQuote ?? "" };
  });
  baked.push({ label: a.label, text: a.text, rating: rc.result.rating, receipt: rc.result.reasons[0], checkpoints });
  console.log(`${a.label}: ${rc.result.rating} (${rc.result.reasons[0]})`);
}

const out = {
  question: card.front,
  pack: "architecture",
  note: "Recorded: the examiner's real per-checkpoint judgment, re-verified and counted by code. The model proposes evidence; code decides the rating.",
  answers: baked,
};
const path = join(import.meta.dir, "..", "marketing", "demo", "tutor.js");
await Bun.write(path, `window.RECALLIT_TUTOR = ${JSON.stringify(out, null, 2)};\n`);
console.log(`wrote ${path}`);
