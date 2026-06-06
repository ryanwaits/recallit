// Build the static study->speak playground data from the bundled RGV pack.
//
// This is a BUILD-TIME read of the real engine: it runs recallit's actual
// deterministic grader (evaluateAnswer) and FSRS-6 scheduler (previewSchedule)
// over a curated handful of real pack cards, then bakes the output to JSON the
// static demo page loads. No engine code is modified; the demo only consumes
// existing exports. Fuzz is disabled so the baked intervals are reproducible
// (the same FSRS math the app runs, minus the per-review randomization jitter).
//
// Run: bun run marketing/scripts/build-demo.ts

import { join } from "node:path";
import {
  evaluateAnswer,
  getScheduler,
  gradeCard,
  newCard,
  previewSchedule,
} from "../../src/index.ts";
import type { EvalRating, RecallCard } from "../../src/types.ts";

const PACK_DIR = join(import.meta.dir, "../../packs/spanish-mx-rgv");
const OUT_DIR = join(import.meta.dir, "../demo");
const AUDIO_OUT = join(OUT_DIR, "audio");

// Fixed clock + no fuzz => identical output every run (honest, reproducible).
const NOW = new Date("2026-01-01T12:00:00.000Z");
const scheduler = getScheduler({ enable_fuzz: false });

interface RawCard {
  type: string;
  front: string;
  back: string;
  context?: string;
  audio?: string;
}

// The recall direction is study->speak: the prompt is the English meaning, the
// answer is the Spanish. Each sample answer below is a real learner attempt we
// run through the grader verbatim; we display whatever rating the code returns.
const SAMPLES: { front: string; typed: string }[] = [
  { front: "Tengo hambre.", typed: "Tengo hambre." }, // exact
  { front: "¿Qué onda?", typed: "que onda" }, // accents/punct only
  { front: "Ándale pues.", typed: "andale pues" }, // accents/punct only
  { front: "¿Ya comiste?", typed: "ya comites" }, // near-miss typo
  { front: "Estoy cansado.", typed: "I'm tired" }, // wrong (recalled meaning, not form)
  { front: "la troca", typed: "la troca" }, // exact
];

// A demo card stands in for one you've practiced before, not a brand-new one
// (the pitch is "practice it forever"). Replay real Good reviews through the
// actual scheduler so the card reaches the Review state, where the four ratings
// spread into meaningful intervals. Returns the warmed card and the clock after
// its last review, both fed straight into previewSchedule.
function warmUp(card: RecallCard, reviews: number): { card: RecallCard; at: Date } {
  let at = NOW;
  for (let i = 0; i < reviews; i++) {
    const { card: next } = gradeCard(card, "Good", at, scheduler);
    card = next;
    at = new Date(card.fsrs.due);
  }
  return { card, at };
}

const raw: RawCard[] = await Bun.file(join(PACK_DIR, "cards.json")).json();
const byFront = new Map(raw.map((c) => [c.front, c]));

await Bun.$`mkdir -p ${AUDIO_OUT}`.quiet();

const cards = [];
for (const { front, typed } of SAMPLES) {
  const card = byFront.get(front);
  if (!card) throw new Error(`demo card not found in pack: "${front}"`);
  if (!card.audio) throw new Error(`demo card has no audio: "${front}"`);

  // Real grader output for the sample answer.
  const evalResult = evaluateAnswer(typed, card.front);

  // Real FSRS next-interval per rating, for a card already in the Review state.
  const fresh = newCard({ type: "sentence", front: card.front, back: card.back });
  const warmed = warmUp(fresh, 3);
  const preview = previewSchedule(warmed.card, warmed.at, scheduler);
  const schedule = Object.fromEntries(
    (Object.keys(preview) as EvalRating[]).map((r) => [r, preview[r].scheduled_days]),
  ) as Record<EvalRating, number>;

  // Self-contained: copy only the audio this demo uses into demo/audio/.
  await Bun.write(
    Bun.file(join(AUDIO_OUT, card.audio)),
    Bun.file(join(PACK_DIR, "assets", card.audio)),
  );

  cards.push({
    front: card.front,
    back: card.back,
    context: card.context,
    audio: `audio/${card.audio}`,
    sample: {
      typed,
      rating: evalResult.rating,
      score: evalResult.score,
      reasons: evalResult.reasons,
      nextDays: schedule[evalResult.rating],
    },
    schedule,
  });
}

const out = {
  pack: { id: "spanish-mx-rgv", name: "Conversational Mexican Spanish (RGV)" },
  // Provenance, shown verbatim on the page so the numbers are never mistaken for mock data.
  engine:
    "Grades and intervals computed offline by recallit's own grader (evaluateAnswer) and FSRS-6 scheduler (previewSchedule), fuzz disabled for reproducibility.",
  cards,
};

const json = JSON.stringify(out, null, 2);
await Bun.write(join(OUT_DIR, "data.json"), `${json}\n`);
// Also emit a JS global so the page loads with zero fetch (works on file:// too).
await Bun.write(join(OUT_DIR, "data.js"), `window.RECALLIT_DEMO = ${json};\n`);
console.log(`wrote ${cards.length} cards -> marketing/demo/data.json + data.js`);
console.log(cards.map((c) => `  ${c.sample.rating.padEnd(5)} ${c.front}`).join("\n"));
