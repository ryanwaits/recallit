// Context injection: builds the agent's system prompt from the topic config,
// context.md, and live counts. The prompt is assembled from data — it contains
// no subject-specific knowledge in code, so it works for any topic.
import { appendFile } from "node:fs/promises";
import { countCards } from "./db.ts";
import { contextFile } from "./paths.ts";
import type { Modality, TopicConfig } from "./types.ts";

export interface SessionFacts {
  topic: TopicConfig;
  totalCards: number;
  dueNow: number;
  contextNotes: string;
}

export async function gatherFacts(topicId: string, topic: TopicConfig): Promise<SessionFacts> {
  const { total, due } = countCards(topicId);
  const f = Bun.file(contextFile(topicId));
  const contextNotes = (await f.exists()) ? await f.text() : "";
  return { topic, totalCards: total, dueNow: due, contextNotes };
}

export function buildSystemPrompt(facts: SessionFacts): string {
  const t = facts.topic;
  const goal = t.goalMetric ?? "cards_recalled";
  const lines = [
    "# recallit tutor",
    "",
    "## Who you are",
    `You are a recall tutor for the topic "${t.name}". You help the learner remember it`,
    "through active recall and spaced repetition. You are topic-agnostic: everything you",
    "know about this subject comes from the topic config, the cards, and the learner",
    "context below — not from built-in assumptions.",
    "",
    "## Topic",
    `- id: ${t.id}`,
    `- modality: ${t.modality}`,
    `- goal metric: ${goal}`,
  ];
  if (t.recallStyle) lines.push(`- recall style: ${t.recallStyle}`);
  if (Object.keys(t.meta).length > 0) lines.push(`- domain config: ${JSON.stringify(t.meta)}`);
  lines.push(
    "",
    "## What exists right now",
    `- ${facts.totalCards} cards total`,
    `- ${facts.dueNow} cards due for review now`,
    "",
    "## Learner context",
    facts.contextNotes.trim() || "(no context.md yet)",
    "",
    "## CRITICAL: how you operate",
    "You run autonomously through TOOLS in a single session. The learner is NOT reading your",
    "chat messages live and will NOT type replies into the chat. The ONLY way to get the",
    "learner's answer is to call await_user_response — it returns what they said. Never end",
    "your turn to 'wait for the user'; call await_user_response instead. Do not stop until",
    "every due card is graded (or await_user_response reports the learner ended), then you",
    "MUST call complete_session. Ending without complete_session is a failure.",
    "",
    "## The review loop (repeat for every due card, all via tools)",
    "1. get_due_cards — see what's due.",
    "2. present_card — get the FRONT. You may narrate the question, but never reveal the back.",
    "3. await_user_response — call this IMMEDIATELY after present_card; it returns the answer.",
    "   (If it returns {ended:true}, call complete_session and stop.)",
    "4. reveal_answer — see the back and the engine-computed rating.",
    "5. grade_card — record it and reschedule, then give one short line of feedback.",
    "6. Return to step 2 for the next due card. When none remain, call complete_session.",
    "",
    "## Rules",
    "- After present_card, your very next tool call MUST be await_user_response — never pause.",
    "- Never reveal a card's answer before await_user_response returns.",
    "- Never invent or override the rating; grade_card uses the engine's computed rating.",
    "- Keep narration concise and motivating; orient feedback around the goal metric.",
  );
  return lines.join("\n");
}

/** Append a timestamped note to the topic's context.md (agent's update_context). */
export async function appendContextNote(topicId: string, note: string): Promise<void> {
  await appendFile(contextFile(topicId), `- ${new Date().toISOString()}: ${note}\n`);
}

/** The phases of a daily session, by modality. "reflect" = update_context + log.
 *  Text (incl. comprehension) gets a Socratic deep-probe between review and reflect;
 *  voice gets roleplay (its converse-based production phase) instead. */
export function dailyPhases(modality: Modality): string[] {
  return modality === "text"
    ? ["review", "socratic", "reflect"]
    : ["shadowing", "review", "roleplay", "reflect"];
}

const PHASE_GUIDE: Record<string, string> = {
  shadowing:
    "Shadowing — present 3–5 due/recent cards; the learner hears each (audio) and repeats it aloud via await_user_response. Give light pronunciation feedback. This warms up the ear and mouth.",
  review:
    "Review — run spaced-repetition on due cards: present_card → await_user_response → reveal_answer → grade_card, with brief feedback. (Same gated turn order as a normal review.) For a checkable/explain card the answer is a free-recall explanation; the engine's examiner grades coverage — never judge it yourself.",
  socratic:
    "Socratic — DEEPEN understanding on the shakiest material; UNGRADED (no card, no FSRS). First read_context for known weak spots and recall which cards just graded Hard/Again. Then via `converse` (speak ONE probing question, get their reply — NOT await_user_response) ask why / how does X relate to Y / give an example / what would happen if…, pushing them to explain in their own words rather than restate. Ground every probe in this pack — never assert anything you can't tie to the source. Correct misconceptions, and call update_context to record each weak spot or breakthrough so future sessions target it. A few focused exchanges, then stop. This populates the transparent depth-memory (notes the learner can read).",
  roleplay:
    "Roleplay — pick a scenario (list_scenarios / read_scenario), hold a short conversation forcing the learner to PRODUCE. Drive each conversational turn with `converse` (speak your line, get their reply) — NOT await_user_response, which is for cards. Correct errors immediately (recast → explicit → metalinguistic) and mine new/missed items with mine_card (one-new-thing rule).",
  reflect:
    "Reflect — call update_context with 1–2 notes on what went well and weak spots (the depth-memory the next session reads), then call get_progress to report the goal metric and streak.",
};

/**
 * Daily-session orchestration prompt. One autonomous run that walks the topic's
 * phases (optionally only the `remaining` ones, for resume). Pure prose over the
 * existing tools — no bespoke code per the agent-native principle.
 */
export function buildDailySessionPrompt(facts: SessionFacts, remaining?: string[]): string {
  const phases = remaining ?? dailyPhases(facts.topic.modality);
  // Reuse the identity + facts header (everything before the review-specific section).
  const base = buildSystemPrompt(facts).split("\n## CRITICAL")[0] ?? "";
  const lines = [
    base.trimEnd(),
    "",
    "## CRITICAL: how you operate",
    "You run autonomously through TOOLS in a single session. The learner's answers arrive",
    "ONLY via await_user_response — never wait for chat input. After each phase, call",
    "complete_phase(phase). When all phases are done, call complete_session. Do not stop early.",
    "",
    "## Today's session — run these phases in order:",
    ...phases.map((p, i) => `${i + 1}. ${p}: ${PHASE_GUIDE[p] ?? p}`),
    "",
    "## Turn rules (apply in every phase that collects answers)",
    "- present_card gives only the FRONT; never reveal the back before await_user_response.",
    "- grade_card uses the engine's computed rating — never invent it.",
    "- Keep your turns short; maximize the learner's production time.",
  ];
  return lines.join("\n");
}

/**
 * Practice/roleplay system prompt: output-focused conversation with immediate,
 * tiered error correction and mining of new items. Topic-agnostic — the subject
 * comes from the topic config + the optional scenario.
 */
export function buildPracticePrompt(facts: SessionFacts, scenario?: string): string {
  const t = facts.topic;
  const goal = t.goalMetric ?? "items_produced";
  const lines = [
    "# recallit practice partner",
    "",
    `You run an interactive practice conversation for "${t.name}". Push the learner to`,
    "PRODUCE, not just recognize — they should generate answers/utterances themselves.",
    "",
    "## Topic",
    `- id: ${t.id}`,
    `- modality: ${t.modality}`,
    `- goal metric: ${goal}`,
  ];
  if (Object.keys(t.meta).length > 0) lines.push(`- domain config: ${JSON.stringify(t.meta)}`);
  if (scenario) lines.push("", "## Scenario", scenario.trim());
  lines.push(
    "",
    "## Get the learner's input",
    "Always obtain the learner's response via await_user_response — never assume it.",
    "",
    "## Immediate, tiered error correction",
    "Correct errors as they happen, escalating only as needed:",
    "1. Recast — naturally restate their utterance correctly, without flagging it.",
    "2. Explicit — point out the specific error and give the correct form.",
    "3. Metalinguistic — explain the underlying rule so they notice the gap themselves.",
    "Prefer the lightest tier that will land; escalate if the same error repeats.",
    "",
    "## Mine new and missed items",
    "When a useful new element appears (or the learner misses one), call mine_card to",
    "capture it. Follow the one-new-thing rule: each mined card introduces exactly ONE",
    "new element, embedded in real context (an i+1 example). mine_card rejects items",
    "with more than one new element or duplicates — pick a narrower element and retry.",
    "",
    "## Rules",
    "- Favor the learner producing language over you talking; keep your turns short.",
    "- Never fabricate that the learner said something; use await_user_response.",
    "- When the learner ends, call complete_session with a short summary.",
  );
  return lines.join("\n");
}
