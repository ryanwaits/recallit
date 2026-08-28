// Context injection: builds the agent's system prompt from the topic config,
// context.md, and live counts. The prompt is assembled from data — it contains
// no subject-specific knowledge in code, so it works for any topic.
import { appendFile } from "node:fs/promises";
import { countCards } from "./db.ts";
import { contextFile } from "./paths.ts";
import { getStyle, styleName } from "./styles/registry.ts";
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

// Every prompt below is built as STATIC (topic-stable, identical across every session
// of the same topic — cacheable) + PROMPT_CACHE_BOUNDARY + DYNAMIC (changes call to
// call: live counts, learner-context notes, guardrails). Anthropic's prompt cache only
// pays off on a stable prefix, and the agent SDK only honors the split when systemPrompt
// is an array with SYSTEM_PROMPT_DYNAMIC_BOUNDARY marking it (see agent.ts) — so static
// content MUST come first in these strings, dynamic content MUST come after the marker.
// Reordering is safe for anything downstream that just checks substring presence.
export const PROMPT_CACHE_BOUNDARY = "\n\n<<<RECALLIT_DYNAMIC_BOUNDARY>>>\n\n";

/** The part of the identity block that never changes for a given topic. */
function staticIdentity(t: TopicConfig): string[] {
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
  return lines;
}

/** The part that changes on every call: live counts + accumulated learner-context notes. */
function dynamicFacts(facts: SessionFacts): string[] {
  return [
    "## What exists right now",
    `- ${facts.totalCards} cards total`,
    `- ${facts.dueNow} cards due for review now`,
    "",
    "## Learner context",
    facts.contextNotes.trim() || "(no context.md yet)",
  ];
}

export function buildSystemPrompt(facts: SessionFacts): string {
  const staticLines = [
    ...staticIdentity(facts.topic),
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
  ];
  return staticLines.join("\n") + PROMPT_CACHE_BOUNDARY + dynamicFacts(facts).join("\n");
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

/** Phase names that have agent guidance (validation + tests). */
export function knownPhases(): string[] {
  return Object.keys(PHASE_GUIDE);
}

// Named practice regimens the learner can pick at session time, composed ONLY of
// phases that already have a PHASE_GUIDE entry. The grade is identical regardless
// (grading dispatches on the card, never on the regimen); a regimen only changes
// HOW the session is presented — a quick graded drill vs a conversation. This is
// what makes "practice it your way" real without touching grading or FSRS.
const REGIMENS: Record<string, string[]> = {
  drill: ["review", "reflect"], // fast graded recall, no conversation
  converse: ["socratic", "reflect"], // conversation-first deep practice (modality-agnostic via `converse`)
};
/** Learner-pickable regimen names ("full" = the pack's modality default). */
export const REGIMEN_NAMES = ["drill", "converse", "full"];
/** Phases for a learner-chosen regimen, or undefined to fall back to the pack's modality default. */
export function regimenPhases(name?: string): string[] | undefined {
  if (!name || name === "full") return undefined;
  return REGIMENS[name];
}

/** The phases a session runs for a course — its style's regimen for the modality.
 *  Null-tolerant for display (e.g. the SPA phase rail before a config is loaded). */
export function coursePhases(topic: { style?: string; modality?: Modality } | null): string[] {
  return getStyle(styleName(topic ?? {})).regimen(topic?.modality ?? "text");
}

/**
 * The base daily phases for a run: the learner's --regimen if the style permits an
 * override, otherwise the style's own regimen. Throws if a learner tries to override
 * a style that disallows it — overriding must never skip a style's required phases
 * (e.g. a compliance assessment).
 */
export function resolveDailyPhases(topic: TopicConfig, regimen?: string): string[] {
  const override = regimenPhases(regimen); // undefined for "full"/absent/unknown
  if (override) {
    const style = getStyle(styleName(topic));
    if (!style.allowsRegimenOverride) {
      throw new Error(
        `the "${style.id}" style does not allow a --regimen override (it would skip required phases)`,
      );
    }
    return override;
  }
  return coursePhases(topic);
}

/**
 * Daily-session orchestration prompt. One autonomous run that walks the topic's
 * phases (optionally only the `remaining` ones, for resume). Pure prose over the
 * existing tools — no bespoke code per the agent-native principle.
 */
export function buildDailySessionPrompt(facts: SessionFacts, remaining?: string[]): string {
  // `remaining` (checkpoint resume) narrows to not-yet-done phases and is genuinely
  // per-session, so it can't be cached; the full phase list for a fresh session is
  // static per topic+style and belongs in the cacheable prefix.
  const isResume = remaining !== undefined;
  const phases = remaining ?? coursePhases(facts.topic);
  const staticLines = [
    ...staticIdentity(facts.topic),
    "",
    "## CRITICAL: how you operate",
    "You run autonomously through TOOLS in a single session. The learner's answers arrive",
    "ONLY via await_user_response — never wait for chat input. After each phase, call",
    "complete_phase(phase). When all phases are done, call complete_session. Do not stop early.",
    "",
    "## Turn rules (apply in every phase that collects answers)",
    "- present_card gives only the FRONT; never reveal the back before await_user_response.",
    "- grade_card uses the engine's computed rating — never invent it.",
    "- Keep your turns short; maximize the learner's production time.",
  ];
  if (!isResume) {
    staticLines.push(
      "",
      "## Today's session — run these phases in order:",
      ...phases.map((p, i) => `${i + 1}. ${p}: ${PHASE_GUIDE[p] ?? p}`),
    );
  }
  const dynamicLines = dynamicFacts(facts);
  if (isResume) {
    dynamicLines.push(
      "",
      "## Today's session — run these remaining phases in order:",
      ...phases.map((p, i) => `${i + 1}. ${p}: ${PHASE_GUIDE[p] ?? p}`),
    );
  }
  return staticLines.join("\n") + PROMPT_CACHE_BOUNDARY + dynamicLines.join("\n");
}

/**
 * Open free-talk conversation: the learner practises by just talking, can ask the
 * agent directly for help, and the agent captures the useful phrases, facts, and
 * ideas that come up into cards for later spaced practice. UNGRADED — nothing here
 * grades or moves a schedule; the captured cards are graded later on the normal
 * card path. The honest "conversation = coach + gap-finder" loop.
 */
export function buildTalkPrompt(facts: SessionFacts): string {
  const t = facts.topic;
  const staticLines = [
    "# recallit free-talk partner",
    "",
    `You are a warm conversation partner for "${t.name}". The learner is practising by just`,
    "talking with you. This session is UNGRADED: you never score them. Your two jobs are to keep a",
    "natural conversation going, and to CAPTURE the useful things that come up so they can practise",
    "them later.",
    "",
    "## Topic",
    `- id: ${t.id}`,
    `- modality: ${t.modality}`,
  ];
  if (Object.keys(t.meta).length > 0)
    staticLines.push(`- domain config: ${JSON.stringify(t.meta)}`);
  staticLines.push(
    "",
    "## How to talk",
    "- Adapt to the subject: if this is a LANGUAGE topic, hold the conversation in the target language (infer it from the domain config and the cards); for any other subject, just talk about it naturally — explore it, think out loud together, follow their curiosity.",
    "- Drive EVERY turn with `converse`: say your line, get their reply. Never use await_user_response — there are no cards in this mode.",
    "- They may ask you things directly (how do I say this, why did that happen, how would I explain this, how should I handle this situation). Answer as a coach: give them what they need plus a short tip if useful, then steer gently back into the conversation.",
    "- Correct or sharpen in the moment, lightly; keep your turns short and let them do most of the talking.",
    "",
    "## Capture what's worth keeping (this is the point)",
    "Whenever something the learner would want to LEARN AND REMEMBER surfaces — a phrase they wanted to be able to say, a fact, an explanation, a correction, an idea they fumbled — call capture_card to save it for later spaced practice:",
    '- front = the prompt, question, or situation (e.g. "Order the al pastor tacos, no onions" — or — "Why did the invasion of Poland trigger the war?"),',
    "- back = what they should be able to recall or produce,",
    "- context = where it came from (the moment in the conversation) so it's recognisable when it comes back.",
    "Capture the WHOLE thing — capture_card has no one-new-thing limit, it only dedups on the front. These cards are scheduled by the engine and come back for honest grading in a few days; the conversation itself never grades.",
    "",
    "## Rules",
    "- Favor them talking and thinking over you talking.",
    "- Never fabricate that they said something; always get it via converse.",
    "- When they wind down, or converse reports they ended, call complete_session with a one-line summary of what you captured.",
  );
  const dynamicLines = facts.contextNotes.trim()
    ? ["## What they've been working on", facts.contextNotes.trim()]
    : ["## What they've been working on", "(nothing recorded yet)"];
  return staticLines.join("\n") + PROMPT_CACHE_BOUNDARY + dynamicLines.join("\n");
}
