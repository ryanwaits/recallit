// Claude Agent SDK glue: exposes the engine primitives + the turn service as
// in-process MCP tools, injects the topic-derived system prompt, and runs the
// loop with maxTurns/maxBudget guardrails. All pedagogy lives in the prompt;
// all invariants live in the tools (turn gating + engine-computed ratings).
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createSdkMcpServer, query, tool } from "@anthropic-ai/claude-agent-sdk";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  clearCheckpoint,
  markPhaseComplete,
  readCheckpoint,
  remainingPhases,
} from "./checkpoint.ts";
import {
  appendContextNote,
  buildDailySessionPrompt,
  buildSystemPrompt,
  dailyPhases,
  gatherFacts,
} from "./context.ts";
import { mineCard } from "./mining.ts";
import { scenariosDir, sessionFile } from "./paths.ts";
import { getProgress, markActive } from "./progress.ts";
import { checkCardQuality } from "./quality.ts";
import { gradeTurn, presentCard, revealAnswer, submitResponse } from "./review.ts";
import { createCard, deleteCard, getCard, getDueCards, searchCards, updateCard } from "./store.ts";
import { readTopicConfig } from "./topic.ts";
import { TurnTracker } from "./turn.ts";
import type { RecallCard, TopicConfig } from "./types.ts";

export type AnswerProvider = (
  cardId: string,
  front: string,
  context?: string,
  /** Relative media filename for the card (e.g. "native.mp3"), if any. */
  media?: string,
) => Promise<string | null>;

export interface SessionEvent {
  t: string;
  kind: "assistant_text" | "tool_use" | "info";
  data: unknown;
}

export interface ReviewSession {
  id: string;
  topicId: string;
  tracker: TurnTracker;
  answerProvider: AnswerProvider;
  /**
   * Card-less spoken/typed turn for free conversation (roleplay): speak a line,
   * capture the learner's reply, no card or grading. Optional — hosts that can't
   * converse (or text-only review) leave it unset and the `converse` tool no-ops.
   */
  converseProvider?: (say: string) => Promise<string | null>;
  log: SessionEvent[];
  completed: boolean;
  summary?: string;
  onEvent?: (e: SessionEvent) => void;
  /**
   * Fired when a card's prompt content (front) changes mid-session, so the host
   * can keep derived artifacts in sync — e.g. re-synthesize native audio. The
   * engine stays subject/voice-blind; the server supplies the implementation.
   */
  onCardContentChanged?: (card: RecallCard) => Promise<void>;
  /**
   * Fired after a card is graded, so the host can surface the engine's grade +
   * receipt (e.g. the coverage breakdown for a checkable item) to the learner.
   */
  onGraded?: (cardId: string, grade: { rating: string; reasons: string[] }) => void;
}

export function createReviewSession(
  topicId: string,
  answerProvider: AnswerProvider,
  onEvent?: (e: SessionEvent) => void,
  id?: string,
): ReviewSession {
  return {
    id: id ?? crypto.randomUUID(),
    topicId,
    tracker: new TurnTracker(),
    answerProvider,
    log: [],
    completed: false,
    onEvent,
  };
}

function record(session: ReviewSession, kind: SessionEvent["kind"], data: unknown): void {
  const e: SessionEvent = { t: new Date().toISOString(), kind, data };
  session.log.push(e);
  session.onEvent?.(e);
}

const ok = (data: unknown): CallToolResult => ({
  content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data) }],
});
const fail = (msg: string): CallToolResult => ({
  content: [{ type: "text", text: msg }],
  isError: true,
});

/** Build the in-process MCP server for one review session. */
function buildServer(session: ReviewSession, goalMetric: string) {
  const t = session.topicId;

  return createSdkMcpServer({
    name: "recallit",
    version: "1.0.0",
    tools: [
      tool(
        "get_due_cards",
        "List cards due for review now (front + id only — never the answer).",
        { limit: z.number().int().positive().optional() },
        async (args) => {
          const due = await getDueCards(t, { limit: args.limit });
          return ok(due.map((c) => ({ id: c.id, front: c.front, context: c.context })));
        },
      ),

      tool(
        "present_card",
        "Begin a review turn for a card; returns its FRONT (not the answer).",
        { card_id: z.string() },
        async (args) => {
          try {
            return ok(await presentCard(t, session.tracker, args.card_id));
          } catch (e) {
            return fail(String(e instanceof Error ? e.message : e));
          }
        },
      ),

      tool(
        "await_user_response",
        "Collect the learner's answer for the presented card. Must be called before reveal_answer.",
        { card_id: z.string() },
        async (args) => {
          const card = await getCard(t, args.card_id);
          if (!card) return fail(`card not found: ${args.card_id}`);
          const answer = await session.answerProvider(
            card.id,
            card.front,
            card.context,
            card.media,
          );
          if (answer === null) {
            return ok({ ended: true, note: "learner ended the session; call complete_session" });
          }
          try {
            await submitResponse(t, session.tracker, args.card_id, answer);
            return ok({ answer });
          } catch (e) {
            return fail(String(e instanceof Error ? e.message : e));
          }
        },
      ),

      tool(
        "converse",
        "Roleplay/free-conversation turn: speak a line to the learner and capture their reply, WITHOUT presenting a card or grading. Returns the transcript. Use this (not await_user_response) for conversational phases.",
        { say: z.string() },
        async (args) => {
          if (!session.converseProvider) {
            return ok({
              note: "no conversational channel in this session; present a card with await_user_response instead",
            });
          }
          const reply = await session.converseProvider(args.say);
          if (reply === null) {
            return ok({ ended: true, note: "learner ended the session; call complete_session" });
          }
          return ok({ transcript: reply });
        },
      ),

      tool(
        "reveal_answer",
        "Reveal the card's answer and the engine-computed rating. Gated: requires a recorded response.",
        { card_id: z.string() },
        async (args) => {
          try {
            return ok(await revealAnswer(t, session.tracker, args.card_id));
          } catch (e) {
            return fail(String(e instanceof Error ? e.message : e));
          }
        },
      ),

      tool(
        "grade_card",
        "Record the review and reschedule via FSRS, using the engine's computed rating.",
        { card_id: z.string() },
        async (args) => {
          try {
            const g = await gradeTurn(t, session.tracker, args.card_id);
            session.onGraded?.(args.card_id, { rating: g.rating, reasons: g.reasons });
            return ok(g);
          } catch (e) {
            return fail(String(e instanceof Error ? e.message : e));
          }
        },
      ),

      tool("get_progress", "Get progress + habit stats for the active topic.", {}, async () =>
        ok(await getProgress(t, goalMetric)),
      ),

      tool("read_context", "Read the learner's context.md notes.", {}, async () => {
        const facts = await gatherFacts(t, (await readTopicConfig(t)) ?? defaultTopic(t));
        return ok({ context: facts.contextNotes });
      }),

      tool(
        "read_card",
        "Read a single card by id (including its answer).",
        { card_id: z.string() },
        async (args) => {
          const c = await getCard(t, args.card_id);
          return c ? ok(c) : fail(`card not found: ${args.card_id}`);
        },
      ),

      tool(
        "create_card",
        "Create a new card in the active topic.",
        {
          front: z.string(),
          back: z.string(),
          type: z.string().optional(),
          context: z.string().optional(),
          tags: z.array(z.string()).optional(),
        },
        async (args) => {
          const c = await createCard(t, {
            front: args.front,
            back: args.back,
            type: args.type,
            context: args.context,
            tags: args.tags,
          });
          return ok({ id: c.id });
        },
      ),

      tool(
        "update_card",
        "Update fields of an existing card.",
        {
          card_id: z.string(),
          front: z.string().optional(),
          back: z.string().optional(),
          context: z.string().optional(),
        },
        async (args) => {
          const { card_id, ...patch } = args;
          const before = await getCard(t, card_id);
          const c = await updateCard(t, card_id, patch);
          if (!c) return fail(`card not found: ${card_id}`);
          // The prompt text changed: let the host refresh derived audio so the
          // stored native.mp3 doesn't go stale against the new front.
          if (patch.front !== undefined && before && patch.front !== before.front) {
            try {
              await session.onCardContentChanged?.(c);
            } catch (e) {
              record(session, "info", {
                warn: "card audio regen failed",
                error: String(e instanceof Error ? e.message : e),
              });
            }
          }
          return ok({ id: c.id });
        },
      ),

      tool("delete_card", "Delete a card by id.", { card_id: z.string() }, async (args) => {
        const removed = await deleteCard(t, args.card_id);
        return ok({ removed });
      }),

      tool(
        "search_cards",
        "Search cards by text across front/back/context/tags.",
        { query: z.string() },
        async (args) => {
          const found = await searchCards(t, args.query);
          return ok(found.map((c) => ({ id: c.id, front: c.front, back: c.back })));
        },
      ),

      tool(
        "mine_card",
        "Capture ONE new element from context as a card (i+1). Rejected if more than one element is new, the element isn't in the content, or it's a duplicate.",
        {
          content: z.string(),
          new_element: z.string(),
          back: z.string().optional(),
          type: z.string().optional(),
        },
        async (args) => {
          try {
            const { card } = await mineCard(t, {
              content: args.content,
              newElement: args.new_element,
              back: args.back,
              type: args.type,
            });
            const q = checkCardQuality({
              front: card.front,
              back: card.back,
              context: card.context,
            });
            return ok({ id: card.id, qualityFlags: q.flags });
          } catch (e) {
            return fail(String(e instanceof Error ? e.message : e));
          }
        },
      ),

      tool(
        "update_context",
        "Append a note to the learner's context (what went well, weak spots) for future sessions.",
        { note: z.string() },
        async (args) => {
          await appendContextNote(t, args.note);
          return ok({ saved: true });
        },
      ),

      tool("list_scenarios", "List available roleplay/practice scenario ids.", {}, async () => {
        try {
          const files = await readdir(scenariosDir(t));
          return ok(files.filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, "")));
        } catch {
          return ok([]);
        }
      }),

      tool(
        "read_scenario",
        "Read a roleplay/practice scenario by id.",
        { id: z.string() },
        async (args) => {
          try {
            const text = await readFile(join(scenariosDir(t), `${args.id}.md`), "utf8");
            return ok({ id: args.id, scenario: text });
          } catch {
            return fail(`scenario not found: ${args.id}`);
          }
        },
      ),

      tool(
        "complete_phase",
        "Mark a daily-session phase complete (checkpoint, so a resumed session skips it).",
        { phase: z.string() },
        async (args) => {
          await markPhaseComplete(t, session.id, args.phase);
          return ok({ phase: args.phase });
        },
      ),

      tool(
        "complete_session",
        "Signal the session is finished. Provide a short summary.",
        { summary: z.string() },
        async (args) => {
          session.completed = true;
          session.summary = args.summary;
          return ok({ done: true });
        },
      ),
    ],
  });
}

function defaultTopic(id: string): TopicConfig {
  return { id, name: id, modality: "text", meta: {} };
}

export const TOOL_NAMES = [
  "get_due_cards",
  "present_card",
  "await_user_response",
  "converse",
  "reveal_answer",
  "grade_card",
  "get_progress",
  "read_context",
  "read_card",
  "create_card",
  "update_card",
  "delete_card",
  "search_cards",
  "mine_card",
  "update_context",
  "list_scenarios",
  "read_scenario",
  "complete_phase",
  "complete_session",
].map((n) => `mcp__recallit__${n}`);

export interface RunOptions {
  prompt?: string;
  model?: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  /** "review" (default) runs the SRS loop; "daily" runs the full multi-phase session. */
  mode?: "review" | "daily";
}

export interface RunResult {
  stopReason: string;
  numTurns: number;
  costUsd: number;
  finalText?: string;
}

async function writeSessionLog(session: ReviewSession, result: RunResult): Promise<void> {
  const lines = [
    `# Session ${session.id}`,
    "",
    `- topic: ${session.topicId}`,
    `- stop reason: ${result.stopReason}`,
    `- turns: ${result.numTurns}`,
    `- cost usd: ${result.costUsd.toFixed(4)}`,
    `- completed: ${session.completed}`,
    session.summary ? `- summary: ${session.summary}` : "",
    "",
    "## Events",
    ...session.log.map((e) => `- [${e.t}] ${e.kind}: ${JSON.stringify(e.data)}`),
    "",
  ];
  await Bun.write(sessionFile(session.id), lines.join("\n"));
}

/** Run the agent loop for one review session. Guardrails: maxTurns + maxBudgetUsd. */
export async function runSession(
  session: ReviewSession,
  opts: RunOptions = {},
): Promise<RunResult> {
  const topic = (await readTopicConfig(session.topicId)) ?? defaultTopic(session.topicId);
  const goalMetric = topic.goalMetric ?? "cards_recalled";
  const facts = await gatherFacts(session.topicId, topic);
  const mode = opts.mode ?? "review";

  let systemPrompt: string;
  let defaultPrompt: string;
  if (mode === "daily") {
    const cp = await readCheckpoint(session.topicId);
    const remaining = remainingPhases(dailyPhases(topic.modality), cp, session.id);
    systemPrompt = buildDailySessionPrompt(facts, remaining);
    defaultPrompt = "Run my full daily session now, phase by phase.";
  } else {
    systemPrompt = buildSystemPrompt(facts);
    defaultPrompt = "Begin my review session now. Review the due cards one at a time.";
  }
  const server = buildServer(session, goalMetric);

  let result: RunResult = { stopReason: "unknown", numTurns: 0, costUsd: 0 };

  for await (const message of query({
    prompt: opts.prompt ?? defaultPrompt,
    options: {
      mcpServers: { recallit: server },
      allowedTools: TOOL_NAMES,
      systemPrompt,
      model: opts.model ?? "claude-sonnet-4-6",
      maxTurns: opts.maxTurns ?? 60,
      maxBudgetUsd: opts.maxBudgetUsd ?? 1,
    },
  })) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") record(session, "assistant_text", block.text);
        else if (block.type === "tool_use")
          record(session, "tool_use", { name: block.name, input: block.input });
      }
    } else if (message.type === "result") {
      result = {
        stopReason: message.subtype,
        numTurns: message.num_turns,
        costUsd: message.total_cost_usd,
        finalText: message.subtype === "success" ? message.result : undefined,
      };
    }
  }

  await markActive(session.topicId);
  // A completed daily session clears its checkpoint; an interrupted one keeps it for resume.
  if (mode === "daily" && session.completed) await clearCheckpoint(session.topicId);
  await writeSessionLog(session, result);
  return result;
}
