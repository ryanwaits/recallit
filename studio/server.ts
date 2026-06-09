// recallit Studio backend (Bun). A3: the build chat is a Vercel AI SDK agent
// (streamText + tools) whose tools wrap the recallit engine (the Claude Agent SDK
// lives inside runPackAuthor/runPackEditor). attach_source reads a source into the
// corpus (no spend); author_tutor drafts cards + runs the honesty gate (keyed);
// shape revises + re-gates. The live ledger (intra-author streaming) is A4.
//
// server.ts is Bun-run and imports ../src directly; engine deps resolve from the
// repo-root node_modules. Run from the repo root so author writes packs to ./packs:
//   bun --env-file=.env studio/server.ts
import { anthropic } from "@ai-sdk/anthropic";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convertToModelMessages, jsonSchema, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { prepareSource, runPackAuthor, runPackEditor } from "../src/packgen/author.ts";

const DIST = join(import.meta.dir, "dist");
const PORT = Number(process.env.PORT ?? 3001);
const MAX_BUDGET = Number(process.env.STUDIO_MAX_BUDGET ?? 1);

const BUILD_SYSTEM = [
  "You are recallit's build assistant. You turn someone's materials into an honest tutor:",
  "every card cites a verbatim source line, and grades are computed in code — a model never",
  "decides a rating.",
  "",
  "Tools:",
  "- attach_source(path): read an attached source into the corpus. No spend. Call it for each",
  "  source path the user gives, before authoring.",
  "- author_tutor(source, scope): draft the cards and run the honesty gate. Slow and costs",
  "  money — call once, after sources are attached. Returns ready vs held counts (held = a",
  "  card couldn't be grounded in a source).",
  "- shape(packId, instruction): revise the drafted pack and re-run the gate.",
  "",
  "Flow: attach the sources, author once, then report the result plainly — e.g. '18 of 22",
  "cards ready, 4 held because they weren't in your sources.' Use shape for follow-up changes.",
  "",
  "Style: concise and plain. No emoji, no hype. 1–3 short sentences. Don't restate the request.",
].join("\n");

// Tools wrapping the engine. The model passes a `scope` from the conversation;
// pedagogy-style dispatch into authoring is deferred to S4 (avoids the known
// opts.style card-shape collision), so we don't thread pedagogy style here.
const TOOLS = {
  attach_source: tool({
    description: "Read an attached source (file path or url) into the corpus of record. No spend.",
    inputSchema: jsonSchema<{ path: string }>({
      type: "object",
      properties: { path: { type: "string", description: "server file path or url of the source" } },
      required: ["path"],
      additionalProperties: false,
    }),
    execute: async ({ path }) => {
      const p = await prepareSource(path);
      const out = { ok: true, kind: p.kind, source: p.sourceLabel };
      await p.cleanup?.();
      return out;
    },
  }),
  author_tutor: tool({
    description:
      "Draft the tutor's cards from a source and run the honesty gate. Slow + costs money; call once after sources are attached.",
    inputSchema: jsonSchema<{ source: string; scope?: string }>({
      type: "object",
      properties: {
        source: { type: "string", description: "source path or url to author from" },
        scope: { type: "string", description: "what to focus the cards on" },
      },
      required: ["source"],
      additionalProperties: false,
    }),
    execute: async ({ source, scope }) => {
      const res = await runPackAuthor(source, { scope, maxBudgetUsd: MAX_BUDGET, maxTurns: 30 });
      const v = res.verdict;
      if (!v) return { error: "no pack written", stopReason: res.stopReason, costUsd: res.costUsd };
      return {
        packId: res.packId,
        ready: v.ready,
        total: v.total,
        held: v.needsReview.map((r) => ({ front: r.card.front, reasons: r.reasons })),
        grounding: v.grounding,
        costUsd: res.costUsd,
      };
    },
  }),
  shape: tool({
    description: "Revise the drafted pack and re-run the honesty gate.",
    inputSchema: jsonSchema<{ packId: string; instruction: string }>({
      type: "object",
      properties: {
        packId: { type: "string" },
        instruction: { type: "string", description: "what to change" },
      },
      required: ["packId", "instruction"],
      additionalProperties: false,
    }),
    execute: async ({ packId, instruction }) => {
      const res = await runPackEditor(packId, instruction, { maxBudgetUsd: MAX_BUDGET });
      const v = res.verdict;
      if (!v) return { error: "no change written", stopReason: res.stopReason, costUsd: res.costUsd };
      return {
        packId: res.packId,
        ready: v.ready,
        total: v.total,
        held: v.needsReview.map((r) => ({ front: r.card.front, reasons: r.reasons })),
        costUsd: res.costUsd,
      };
    },
  }),
};

Bun.serve({
  port: PORT,
  idleTimeout: 240, // author runs can take a couple minutes
  async fetch(req) {
    const url = new URL(req.url);

    // Upload an attached file → temp path the engine can read.
    if (url.pathname === "/api/sources" && req.method === "POST") {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return Response.json({ error: "no file" }, { status: 400 });
      const dir = await mkdtemp(join(tmpdir(), "recallit-studio-src-"));
      const path = join(dir, file.name);
      await Bun.write(path, file);
      return Response.json({ path, name: file.name });
    }

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
        tools: TOOLS,
        stopWhen: stepCountIs(6),
      });
      return result.toUIMessageStreamResponse();
    }

    // Static: serve the built Vite app (SPA fallback).
    const path = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = Bun.file(join(DIST, path));
    if (await file.exists()) return new Response(file);
    const index = Bun.file(join(DIST, "index.html"));
    if (await index.exists()) return new Response(index);
    return new Response("studio not built — run `bun run build`", { status: 404 });
  },
});

console.log(`recallit studio · http://localhost:${PORT}`);
