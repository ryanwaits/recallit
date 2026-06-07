// Keyless local server for verifying the SPA without ANTHROPIC/ELEVENLABS keys.
//
// It presents your REAL due cards (voiced cards play their stored /media audio)
// and grades typed answers with the real engine — no LLM, no spend. It walks the
// topic's phases so the phase rail advances live. Spoken answers won't transcribe
// here (STT is stubbed); type your answers to see grading.
//
// Run:  bun run scripts/serve-local.ts        (then open http://localhost:3000)
//   or: bun run serve:local
import { dailyPhases } from "../src/context.ts";
import { evaluateAnswer } from "../src/evaluate.ts";
import { startServer } from "../src/server.ts";
import { getDueCards, reviewCard } from "../src/store.ts";
import { readTopicConfig } from "../src/topic.ts";

// biome-ignore lint/suspicious/noExplicitAny: dev stubs for the voice providers.
const stt = { transcribe: async () => "" } as any;
// biome-ignore lint/suspicious/noExplicitAny: voiced cards use stored /media audio.
const tts = { speak: async () => new Uint8Array() } as any;

const server = startServer({
  stt,
  tts,
  port: Number(process.env.PORT ?? 3000),
  // No-LLM driver: walk the real regimen, run a real graded review over due cards.
  run: async (session) => {
    const cfg = await readTopicConfig(session.topicId);
    const phases = dailyPhases(cfg?.modality ?? "text");
    const due = await getDueCards(session.topicId, { limit: 6 });
    let answered = 0;
    for (const phase of phases) {
      session.onEvent?.({
        t: new Date().toISOString(),
        kind: "assistant_text",
        data: `**${phase}** phase.`,
      });
      if (phase === "review") {
        for (const c of due) {
          const ans = await session.answerProvider(c.id, c.front, c.context, c.media);
          if (ans === null) break;
          const v = evaluateAnswer(ans, c.back);
          await reviewCard(session.topicId, c.id, v.rating);
          // Mirror the real grade_card path so the SPA shows the receipt chip.
          session.onGraded?.(c.id, { rating: v.rating, reasons: v.reasons });
          answered++;
        }
      }
      // Mirror the agent's real complete_phase signal so the rail advances.
      session.onEvent?.({
        t: new Date().toISOString(),
        kind: "tool_use",
        data: { name: "complete_phase", input: { phase } },
      });
    }
    return { stopReason: "ok", numTurns: answered, costUsd: 0 };
  },
});
console.log(`recallit (local, no keys): http://localhost:${server.port}`);
console.log(
  "Type your answers to grade real cards. Spoken answers need ELEVENLABS_API_KEY (use `bun run serve`).",
);
