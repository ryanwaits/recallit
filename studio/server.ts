// recallit Studio backend (Bun). A1: the streaming build route + static serving.
// A3+ adds tools that wrap the recallit engine (prepareSource / runPackAuthor /
// runPackEditor / gateCards) and a live honesty-ledger data part. The build chat is
// a Vercel AI SDK agent (here); the grounded author/grade engine is the Claude Agent
// SDK, called through tools.
import { anthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { join } from "node:path";

const DIST = join(import.meta.dir, "dist");
const PORT = Number(process.env.PORT ?? 3001);

const BUILD_SYSTEM = [
  "You are recallit's build assistant. You help turn someone's materials into an honest tutor:",
  "every card cites a verbatim source line, and grades are computed in code — a model never",
  "decides a rating.",
  "",
  "Style: concise and plain. No emoji. No exclamation marks, no hype. Professional but casual,",
  "like a sharp colleague. Lead with the point; skip preamble and filler. Usually 1–3 short",
  "sentences. Don't restate the user's request back to them.",
  "",
  "Right now you can only chat (the source-reading and card-drafting tools come next). Briefly",
  "acknowledge what they're building, and ask one focused question that moves it forward.",
].join("\n");

Bun.serve({
  port: PORT,
  idleTimeout: 120, // allow long streams
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/api/build" && req.method === "POST") {
      if (!process.env.ANTHROPIC_API_KEY) {
        return Response.json(
          { error: "ANTHROPIC_API_KEY not set — the build chat is BYO-key." },
          { status: 503 },
        );
      }
      const { messages } = (await req.json()) as { messages: UIMessage[] };
      const result = streamText({
        model: anthropic("claude-sonnet-4-6"),
        system: BUILD_SYSTEM,
        messages: await convertToModelMessages(messages),
      });
      return result.toUIMessageStreamResponse();
    }

    // Static: serve the built Vite app (SPA fallback to index.html).
    const path = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = Bun.file(join(DIST, path));
    if (await file.exists()) return new Response(file);
    const index = Bun.file(join(DIST, "index.html"));
    if (await index.exists()) return new Response(index);
    return new Response("studio not built — run `bun run build`", { status: 404 });
  },
});

console.log(`recallit studio · http://localhost:${PORT}`);
