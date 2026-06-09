// recallit Studio backend (Bun). A4: the build chat is a Vercel AI SDK agent
// (streamText + tools) wrapping the recallit engine (Claude Agent SDK lives inside
// runPackAuthor/runPackEditor). author_tutor streams a LIVE honesty-ledger data part
// (reading -> drafting -> gating -> N ready / K held), reconciled by a stable id, so
// the chat fills in as the author runs — our honest take on Honen's build sidebar.
//
// server.ts is Bun-run and imports ../src directly; engine deps resolve from the
// repo-root node_modules. Run from the repo root so author writes packs to ./packs:
//   bun --env-file=.env studio/server.ts

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { anthropic } from "@ai-sdk/anthropic";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  jsonSchema,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
  type UIMessageStreamWriter,
} from "ai";
import { installPack } from "../src/install.ts";
import { runPackAuthorMulti, runPackEditor } from "../src/packgen/author.ts";

const DIST = join(import.meta.dir, "dist");
const PORT = Number(process.env.PORT ?? 3001);
const MAX_BUDGET = Number(process.env.STUDIO_MAX_BUDGET ?? 1);

const BUILD_SYSTEM = [
  "You are recallit's build assistant. You turn someone's materials into an honest tutor:",
  "every card cites a verbatim source line, and grades are computed in code — a model never",
  "decides a rating.",
  "",
  "The user's sources (files/links) are attached out-of-band — you don't have or need their",
  "paths; the kickoff message names what's attached.",
  "",
  "Tools:",
  "- author_tutor(scope): draft cards from the attached sources and run the honesty gate. Slow",
  "  + costs money — call ONCE. Returns ready vs held counts (held = a card couldn't be",
  "  grounded). If NOTHING is attached and the user only described a topic, pass",
  "  concept:'<the topic>' to research it instead.",
  "- shape(packId, instruction): revise the drafted pack and re-run the gate.",
  "- finalize_tutor(packId): install the drafted pack as a tutor the learner can study/deploy.",
  "  Call it once the user is happy with the draft.",
  "",
  "Flow: author once, then report plainly — e.g. '18 of 22 cards ready, 4 held because they",
  "weren't in your sources.' Use shape for changes. When the user is happy, finalize_tutor,",
  "then say it's ready. Only ready cards install; held cards stay out until grounded.",
  "",
  "Whenever you end a turn asking the user to choose or confirm something, ALSO call",
  "propose_actions with 2–4 one-click choices (short label; message = exactly what they'd",
  "reply). The draft result already shows Install/Reshape buttons — don't duplicate those two;",
  "propose actions for other decisions (scope, card mix, depth, what to do next).",
  "",
  "Style: concise and plain. No emoji, no hype. 1–3 short sentences. Don't restate the request.",
].join("\n");

const LEDGER_PHASES = ["Reading the source", "Drafting cards", "Running the honesty gate"];
const stepsAt = (phase: number) =>
  LEDGER_PHASES.map((label, i) => ({
    label,
    state: i < phase ? "done" : i === phase ? "active" : "todo",
  }));

// Friendly live-status labels for the author agent's tool calls (the ledger's
// lastAction), so the long fetch/draft phases show motion instead of dead air.
const ACTION_LABEL: Record<string, string> = {
  Read: "reading the source…",
  WebFetch: "fetching the source…",
  WebSearch: "searching the web…",
  Glob: "scanning files…",
  Grep: "searching the source…",
  save_source: "saving the source text…",
  write_pack: "running the honesty gate…",
};

// Tools wrapping the engine. `writer` lets author_tutor stream the live ledger.
// Pedagogy-style dispatch into authoring is deferred to S4 (avoids the opts.style
// card-shape collision), so we don't thread pedagogy style here.
function buildTools(writer: UIMessageStreamWriter, sources: string[], pedagogyStyle?: string) {
  return {
    author_tutor: tool({
      description:
        "Draft the tutor's cards from the attached sources and run the honesty gate. Slow + costs money; call once.",
      inputSchema: jsonSchema<{ scope?: string; concept?: string }>({
        type: "object",
        properties: {
          scope: { type: "string", description: "what to focus the cards on" },
          concept: {
            type: "string",
            description:
              "ONLY if no sources are attached: the topic/concept to research + author from",
          },
        },
        additionalProperties: false,
      }),
      execute: async ({ scope, concept }) => {
        const srcs = sources.length ? sources : concept ? [concept] : [];
        if (srcs.length === 0) {
          return { error: "no sources attached and no concept given — ask the user for a source." };
        }
        let phase = 0;
        // Synthetic first action: onEvent is silent during the initial fetch, so
        // seed a live label immediately, then update it on every author tool_use.
        let lastAction = `reading ${srcs.length} source${srcs.length > 1 ? "s" : ""}…`;
        const emit = () =>
          writer.write({
            type: "data-ledger",
            id: "ledger",
            data: { steps: stepsAt(phase), lastAction },
          });
        emit();
        const res = await runPackAuthorMulti(srcs, {
          scope,
          pedagogyStyle,
          maxBudgetUsd: MAX_BUDGET,
          maxTurns: 30,
          onEvent: (e) => {
            if (e.kind !== "tool_use") return;
            const name = (e.data as { name: string }).name;
            lastAction = ACTION_LABEL[name] ?? `running ${name}…`;
            if (name === "save_source" && phase < 1) phase = 1;
            else if (name === "write_pack" && phase < 2) phase = 2;
            emit();
          },
        });
        const v = res.verdict;
        if (!v) {
          writer.write({
            type: "data-ledger",
            id: "ledger",
            data: { steps: stepsAt(0), error: "no pack written" },
          });
          return { error: "no pack written", stopReason: res.stopReason, costUsd: res.costUsd };
        }
        const held = v.needsReview.map((r) => ({ front: r.card.front, reasons: r.reasons }));
        writer.write({
          type: "data-ledger",
          id: "ledger",
          data: {
            steps: LEDGER_PHASES.map((label) => ({ label, state: "done" })),
            done: true,
            packId: res.packId,
            ready: v.ready,
            total: v.total,
            held,
            grounding: v.grounding,
            costUsd: res.costUsd,
          },
        });
        return { packId: res.packId, ready: v.ready, total: v.total, held, grounding: v.grounding };
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
        // Reshaping is a 1–2 min keyed run; stream a ledger so it isn't a dead spinner.
        const PHASES = ["Revising the cards", "Running the honesty gate"];
        let phase = 0;
        let lastAction = "revising the draft…";
        const emit = () =>
          writer.write({
            type: "data-ledger",
            id: "ledger",
            data: {
              steps: PHASES.map((label, i) => ({
                label,
                state: i < phase ? "done" : i === phase ? "active" : "todo",
              })),
              lastAction,
            },
          });
        emit();
        const res = await runPackEditor(packId, instruction, {
          maxBudgetUsd: MAX_BUDGET,
          onEvent: (e) => {
            if (e.kind !== "tool_use") return;
            const name = (e.data as { name: string }).name;
            lastAction = ACTION_LABEL[name] ?? `running ${name}…`;
            if (name === "write_pack" && phase < 1) phase = 1;
            emit();
          },
        });
        const v = res.verdict;
        if (!v) {
          writer.write({
            type: "data-ledger",
            id: "ledger",
            data: {
              steps: PHASES.map((label) => ({ label, state: "todo" })),
              error: "no change written",
            },
          });
          return { error: "no change written", stopReason: res.stopReason, costUsd: res.costUsd };
        }
        const held = v.needsReview.map((r) => ({ front: r.card.front, reasons: r.reasons }));
        writer.write({
          type: "data-ledger",
          id: "ledger",
          data: {
            steps: PHASES.map((label) => ({ label, state: "done" })),
            done: true,
            packId: res.packId,
            ready: v.ready,
            total: v.total,
            held,
            costUsd: res.costUsd,
          },
        });
        return { packId: res.packId, ready: v.ready, total: v.total, held };
      },
    }),
    propose_actions: tool({
      description:
        "Render one-click choice buttons in the chat instead of making the user type. Call when you ask the user to choose/confirm. 2-4 actions; label is short; message is exactly what the user would have replied.",
      inputSchema: jsonSchema<{ question?: string; actions: { label: string; message: string }[] }>(
        {
          type: "object",
          properties: {
            question: { type: "string", description: "optional one-line framing of the choice" },
            actions: {
              type: "array",
              minItems: 2,
              maxItems: 4,
              items: {
                type: "object",
                properties: {
                  label: { type: "string", description: "short button label (2-5 words)" },
                  message: {
                    type: "string",
                    description: "the reply this button sends as the user",
                  },
                },
                required: ["label", "message"],
                additionalProperties: false,
              },
            },
          },
          required: ["actions"],
          additionalProperties: false,
        },
      ),
      // Pure UI side-effect: the FE renders the tool part's input as buttons.
      execute: async ({ actions }) => ({ shown: actions.length }),
    }),
    finalize_tutor: tool({
      description:
        "Install the drafted pack as a tutor the learner can study and deploy. Call once the user is happy with the draft. Only ready (gated) cards install.",
      inputSchema: jsonSchema<{ packId: string }>({
        type: "object",
        properties: { packId: { type: "string" } },
        required: ["packId"],
        additionalProperties: false,
      }),
      execute: async ({ packId }) => {
        const res = await installPack(join("packs", packId), { activate: true });
        return {
          installed: true,
          courseId: res.topicId,
          cards: res.cards,
          audio: res.audio,
          scenarios: res.scenarios,
          heldForReview: res.heldForReview,
          // So the FE can show the exact study command for this install.
          dataDir: process.env.RECALLIT_DATA_DIR ?? "~/.recallit",
        };
      },
    }),
  };
}

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
      const {
        messages,
        sources = [],
        pedagogyStyle,
      } = (await req.json()) as {
        messages: UIMessage[];
        sources?: string[];
        pedagogyStyle?: string;
      };
      // Guard a malformed/empty request so streamText doesn't throw an uncaught
      // AI_InvalidPromptError (which dumps a stack to the server log).
      if (!messages?.length) {
        return Response.json({ error: "messages must not be empty" }, { status: 400 });
      }
      const stream = createUIMessageStream({
        execute: async ({ writer }) => {
          const result = streamText({
            model: anthropic("claude-sonnet-4-6"),
            system: BUILD_SYSTEM,
            messages: await convertToModelMessages(messages),
            tools: buildTools(writer, sources, pedagogyStyle),
            stopWhen: stepCountIs(6),
          });
          writer.merge(result.toUIMessageStream());
        },
      });
      return createUIMessageStreamResponse({ stream });
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
