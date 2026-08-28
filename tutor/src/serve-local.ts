// Keyless local server for studying without ANTHROPIC/ELEVENLABS keys.
//
// It presents your REAL due cards (voiced cards play their stored /media audio)
// and grades typed answers with the real engine — no LLM, no spend. It walks the
// topic's phases so the phase rail advances live. Spoken answers won't transcribe
// here (STT is stubbed); type your answers to see grading.
import { coursePhases } from "./context.ts";
import { evaluateAnswer } from "./evaluate.ts";
import { startServer } from "./server.ts";
import { getDueCards, reviewCard } from "./store.ts";
import { readTopicConfig } from "./topic.ts";

// biome-ignore lint/suspicious/noExplicitAny: dev stubs for the voice providers.
const stt = { transcribe: async () => "" } as any;
// biome-ignore lint/suspicious/noExplicitAny: voiced cards use stored /media audio.
const tts = { speak: async () => new Uint8Array() } as any;

/** Boot the no-key SPA: real due cards, real grading, no LLM/TTS spend. */
export function startKeylessServer(opts: { port?: number } = {}) {
  return startServer({
    stt,
    tts,
    port: opts.port ?? Number(process.env.PORT ?? 3000),
    // No-LLM driver: walk the real regimen, run a real graded review over due cards.
    run: async (session) => {
      const cfg = await readTopicConfig(session.topicId);
      const phases = coursePhases(cfg);
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
}

// Run directly: `bun run src/serve-local.ts` (or `bun run serve:local`).
if (import.meta.main) {
  const server = startKeylessServer();
  console.log(`recallit (local, no keys): http://localhost:${server.port}`);
  console.log(
    "Type your answers to grade real cards. Spoken answers need ELEVENLABS_API_KEY (use `bun run serve`).",
  );
}
