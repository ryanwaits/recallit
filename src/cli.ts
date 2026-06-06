#!/usr/bin/env bun
import { join } from "node:path";
import { type AnswerProvider, createReviewSession, runSession } from "./agent.ts";
// Thin CLI harness over the engine primitives. Proves parity headlessly and is
// handy for seeding/inspecting topics. The agent (Sprint 2) uses the same functions.
import { countCards, rebuildIndex } from "./db.ts";
import { evaluateAnswer } from "./evaluate.ts";
import { installPack, planReinstall } from "./install.ts";
import { runPackAuthor, runPackEditor } from "./packgen/author.ts";
import { writePack } from "./packgen/gate.ts";
import { resolveMode } from "./packgen/mode.ts";
import { dayKey } from "./progress.ts";
import { previewSchedule } from "./scheduler.ts";
import {
  createCard,
  deleteCard,
  getCard,
  getDueCards,
  listCards,
  reviewCard,
  searchCards,
  updateCard,
} from "./store.ts";
import {
  createTopic,
  getActiveTopic,
  listTopics,
  readTopicConfig,
  setActiveTopic,
} from "./topic.ts";
import type { Modality } from "./types.ts";

/** Split args into --flags (with values) and bare positionals, order-preserving. */
function parseArgs(args: string[]): { flags: Record<string, string>; pos: string[] } {
  const flags: Record<string, string> = {};
  const pos: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a?.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = "true";
      }
    } else if (a !== undefined) {
      pos.push(a);
    }
  }
  return { flags, pos };
}

async function requireActive(explicit?: string): Promise<string> {
  const topic = explicit ?? (await getActiveTopic());
  if (!topic) throw new Error("no active topic — run: recallit topic use <id>");
  return topic;
}

const USAGE = `recallit <command>

topic create <id> --name <n> [--modality text|voice|both] [--goal <metric>]
topic add <source> [--no-activate] [--force] [--no-audio]   (install a topic pack;
            source = dir | github:owner/repo[#ref] | git+<url> | npm:<spec> | <pack>.tgz)
topic list
topic use <id>
topic show [<id>]
card add --front <f> --back <b> [--type t] [--context c] [--tags a,b] [--topic id]
card list [--topic id]
card search <query> [--topic id]
card rm <cardId> [--topic id]
card set <cardId> --front <f> | --back <b> | ...   [--topic id]
due [--limit n] [--topic id]
review <cardId> <Again|Hard|Good|Easy> [--topic id]
answer <cardId> <spoken/typed answer...> [--topic id]   (evaluate + auto-grade)
preview <cardId> [--topic id]
rebuild [--topic id]
stats [--topic id]
agent [--topic id] [--model m] [--maxTurns n]   (run the interactive agent review loop)
daily [--topic id] [--model m]                  (run the full multi-phase daily session)
pack <source> [--review|--dry-run|--auto] [--scope t] [--style t]   (generate a pack from a PDF/URL/repo/concept)
pack edit <id> "<instruction>" [--dry-run]      (tweak a pack; additive edits preserve your review history)
pack write <pack-dir>                           (gate a drafted pack: stamp needs-review, write cards.json)
pack review <pack-dir>                          (no-LLM: list a pack's needs-review cards + reasons)`;

async function main(argv: string[]): Promise<void> {
  const group = argv[0] ?? "";
  const { flags: f, pos } = parseArgs(argv.slice(1));

  switch (group) {
    case "topic": {
      const sub = pos[0];
      if (sub === "create") {
        const id = pos[1];
        if (!id) throw new Error("usage: topic create <id> --name <name>");
        await createTopic({
          id,
          name: f.name ?? id,
          modality: (f.modality as Modality) ?? "text",
          goalMetric: f.goal,
          meta: {},
        });
        await setActiveTopic(id);
        console.log(`created topic "${id}" (now active)`);
      } else if (sub === "list") {
        const topics = await listTopics();
        const active = await getActiveTopic();
        for (const t of topics) console.log(`${t === active ? "*" : " "} ${t}`);
      } else if (sub === "add") {
        const source = pos[1];
        if (!source) throw new Error("usage: topic add <pack-dir> [--no-activate] [--force]");
        const res = await installPack(source, {
          activate: f["no-activate"] === undefined,
          force: f.force !== undefined,
          audio: f["no-audio"] === undefined,
        });
        console.log(
          `installed "${res.topicId}": ${res.cards} cards, ${res.audio} audio, ${res.scenarios} scenarios${f["no-activate"] === undefined ? " (now active)" : ""}`,
        );
      } else if (sub === "use") {
        const id = pos[1];
        if (!id) throw new Error("usage: topic use <id>");
        await setActiveTopic(id);
        console.log(`active topic: ${id}`);
      } else if (sub === "show") {
        const topic = await requireActive(pos[1]);
        console.log(JSON.stringify(await readTopicConfig(topic), null, 2));
      } else {
        console.log(USAGE);
      }
      break;
    }

    case "pack": {
      const first = pos[0];
      if (first === "write") {
        // No-LLM: gate a drafted pack dir (stamp needs-review, rewrite cards.json).
        const dir = pos[1];
        if (!dir) throw new Error("usage: pack write <pack-dir>");
        const manifest = await Bun.file(join(dir, "manifest.json")).json();
        const cards = await Bun.file(join(dir, "cards.json")).json();
        const v = await writePack(dir, manifest, cards);
        console.log(
          `${v.ready}/${v.total} ready, ${v.needsReview.length} need review (grounding: ${v.grounding})`,
        );
        for (const r of v.needsReview)
          console.log(`  ⚠ ${r.card.front}  [${r.reasons.join(", ")}]`);
      } else if (first === "review") {
        // No-LLM: list a pack's needs-review cards + reasons.
        const dir = pos[1];
        if (!dir) throw new Error("usage: pack review <pack-dir>");
        const cards = (await Bun.file(join(dir, "cards.json")).json()) as Array<{
          front: string;
          meta?: { status?: string; reviewReasons?: string[] };
        }>;
        const flagged = cards.filter((c) => c.meta?.status === "needs-review");
        console.log(`${flagged.length}/${cards.length} cards need review in ${dir}`);
        for (const c of flagged) {
          console.log(`  ⚠ ${c.front}  [${(c.meta?.reviewReasons ?? []).join(", ")}]`);
        }
      } else if (first === "edit") {
        // Tweak an existing pack via the live editor loop, then re-install — merging
        // non-destructively (preserve FSRS) when the edit is purely additive.
        const id = pos[1];
        const instruction = pos[2];
        if (!id || !instruction) throw new Error('usage: pack edit <id> "<instruction>"');
        const dryRun = f["dry-run"] !== undefined;
        console.log(`editing "${id}"${dryRun ? " · dry-run" : ""}: ${instruction}`);
        const res = await runPackEditor(id, instruction, {
          model: f.model,
          maxBudgetUsd: f["max-budget"] ? Number(f["max-budget"]) : undefined,
          onEvent: (e) => {
            if (e.kind === "assistant_text") console.log(`\n🗣  ${e.data}`);
            else if (e.kind === "tool_use")
              console.log(`   · ${(e.data as { name: string }).name}`);
          },
        });
        const v = res.verdict;
        if (!v) {
          console.error(
            `\nno changes written (stop: ${res.stopReason}, $${res.costUsd.toFixed(4)})`,
          );
          process.exit(2);
        }
        console.log(
          `\n${v.ready}/${v.total} ready, ${v.needsReview.length} need review · $${res.costUsd.toFixed(4)}`,
        );
        for (const r of v.needsReview)
          console.log(`  ⚠ ${r.card.front}  [${r.reasons.join(", ")}]`);
        if (dryRun) {
          console.log(`\nupdated packs/${id}/cards.json (not re-installed).`);
          break;
        }
        const plan = await planReinstall(id, res.packDir);
        if (!plan.topicExists) {
          const r = await installPack(res.packDir);
          console.log(`installed "${r.topicId}": ${r.cards} cards (now active)`);
        } else if (plan.additive) {
          const r = await installPack(res.packDir, { merge: true });
          console.log(
            `enhanced "${id}": +${r.cards} new card(s), existing progress preserved (FSRS intact)`,
          );
        } else {
          console.log(
            `\n⚠ ${plan.changedOrRemoved} existing card(s) changed/removed — a clean re-install is needed, which RESETS the review schedule for "${id}".`,
          );
          const skip = f.auto !== undefined || f.yes !== undefined;
          const proceed =
            skip || prompt("Proceed and reset review progress? [y/N] ")?.toLowerCase() === "y";
          if (proceed) {
            const r = await installPack(res.packDir, { force: true });
            console.log(`re-installed "${r.topicId}": ${r.cards} cards (schedule reset)`);
          } else {
            console.log(`left on disk (not re-installed): packs/${id}`);
          }
        }
      } else if (first) {
        // pack <source> — author a pack via the live agent loop, then install per mode.
        const source = first;
        const { mode, rationale } = resolveMode("A", {
          flags: { auto: f.auto !== undefined, review: f.review !== undefined },
        });
        const dryRun = f["dry-run"] !== undefined;
        console.log(
          `authoring pack from: ${source}  (mode ${mode}: ${rationale}${dryRun ? " · dry-run" : ""})`,
        );
        const res = await runPackAuthor(source, {
          scope: f.scope,
          style: f.style,
          model: f.model,
          maxBudgetUsd: f["max-budget"] ? Number(f["max-budget"]) : undefined,
          onEvent: (e) => {
            if (e.kind === "assistant_text") console.log(`\n🗣  ${e.data}`);
            else if (e.kind === "tool_use")
              console.log(`   · ${(e.data as { name: string }).name}`);
          },
        });
        const v = res.verdict;
        if (!v) {
          console.error(`\nno pack written (stop: ${res.stopReason}, $${res.costUsd.toFixed(4)})`);
          process.exit(2);
        }
        console.log(
          `\n${v.ready}/${v.total} ready, ${v.needsReview.length} need review · grounding ${v.grounding} · $${res.costUsd.toFixed(4)}`,
        );
        for (const r of v.needsReview)
          console.log(`  ⚠ ${r.card.front}  [${r.reasons.join(", ")}]`);
        if (v.ready === 0) {
          console.error(`\nno ready cards in packs/${res.packId} — nothing to install`);
          process.exit(2);
        }
        const webGrounded = v.grounding === "web";
        if (dryRun) {
          console.log(
            `\nwrote ${res.packDir} (not installed). install: bun run cli topic add packs/${res.packId}`,
          );
        } else if (mode === "A" && !webGrounded) {
          const r = await installPack(res.packDir, { force: f.force !== undefined });
          console.log(
            `installed "${r.topicId}": ${r.cards} ready cards${r.heldForReview ? `, ${r.heldForReview} held for review` : ""} (now active)`,
          );
        } else {
          if (webGrounded)
            console.log("\n⚠ web-grounded pack — attribution-only, not authoritative.");
          const answer = prompt(`install ${v.ready} ready cards as "${res.packId}"? [y/N/e] `);
          if (answer?.toLowerCase() === "y") {
            const r = await installPack(res.packDir, { force: f.force !== undefined });
            console.log(`installed "${r.topicId}": ${r.cards} ready cards (now active)`);
          } else if (answer?.toLowerCase() === "e") {
            console.log(
              `left on disk: ${res.packDir}. edit cards.json, then: bun run cli topic add packs/${res.packId}`,
            );
          } else {
            console.log(`left on disk (not installed): ${res.packDir}`);
          }
        }
      } else {
        console.log(
          "usage: pack <source> [--review|--dry-run|--auto|--scope <t>|--style <t>|--force]\n       pack write <pack-dir> | pack review <pack-dir>",
        );
      }
      break;
    }

    case "card": {
      const sub = pos[0];
      const topic = await requireActive(f.topic);
      if (sub === "add") {
        if (!f.front || !f.back) throw new Error("card add requires --front and --back");
        const card = await createCard(topic, {
          front: f.front,
          back: f.back,
          type: f.type,
          context: f.context,
          tags: f.tags ? f.tags.split(",").map((s) => s.trim()) : undefined,
        });
        console.log(`added card ${card.id}`);
      } else if (sub === "list") {
        for (const c of await listCards(topic)) {
          console.log(
            `${c.id}  [${c.type}]  ${c.front} -> ${c.back}  (due ${c.fsrs.due.toISOString()})`,
          );
        }
      } else if (sub === "search") {
        for (const c of await searchCards(topic, pos[1] ?? "")) {
          console.log(`${c.id}  ${c.front} -> ${c.back}`);
        }
      } else if (sub === "rm") {
        const ok = await deleteCard(topic, pos[1] ?? "");
        console.log(ok ? "deleted" : "not found");
      } else if (sub === "set") {
        const patch: Record<string, unknown> = {};
        for (const k of ["front", "back", "type", "context", "source"]) {
          if (f[k] !== undefined) patch[k] = f[k];
        }
        if (f.tags !== undefined) patch.tags = f.tags.split(",").map((s) => s.trim());
        const updated = await updateCard(topic, pos[1] ?? "", patch);
        console.log(updated ? "updated" : "not found");
      } else {
        console.log(USAGE);
      }
      break;
    }

    case "due": {
      const topic = await requireActive(f.topic);
      const limit = f.limit ? Number(f.limit) : undefined;
      const due = await getDueCards(topic, { limit });
      console.log(`${due.length} due`);
      for (const c of due) console.log(`${c.id}  ${c.front} -> ${c.back}`);
      break;
    }

    case "review": {
      const topic = await requireActive(f.topic);
      const outcome = await reviewCard(topic, pos[0] ?? "", pos[1] ?? "Good");
      if (!outcome) {
        console.log("not found");
      } else {
        console.log(
          `graded; next due ${outcome.card.fsrs.due.toISOString()} (reps ${outcome.card.fsrs.reps}, lapses ${outcome.card.fsrs.lapses})`,
        );
      }
      break;
    }

    case "answer": {
      const topic = await requireActive(f.topic);
      const cardId = pos[0] ?? "";
      const answer = pos.slice(1).join(" ");
      const card = await getCard(topic, cardId);
      if (!card) {
        console.log("not found");
        break;
      }
      const verdict = evaluateAnswer(answer, card.back);
      const outcome = await reviewCard(topic, cardId, verdict.rating);
      console.log(`answer="${answer}" -> ${verdict.rating} (${verdict.reasons.join("; ")})`);
      if (outcome) console.log(`next due ${outcome.card.fsrs.due.toISOString()}`);
      break;
    }

    case "preview": {
      const topic = await requireActive(f.topic);
      const card = await getCard(topic, pos[0] ?? "");
      if (!card) {
        console.log("not found");
        break;
      }
      console.log(JSON.stringify(previewSchedule(card), null, 2));
      break;
    }

    case "rebuild": {
      const topic = await requireActive(f.topic);
      const n = await rebuildIndex(topic);
      console.log(`indexed ${n} cards`);
      break;
    }

    case "stats": {
      const topic = await requireActive(f.topic);
      const { total, due } = countCards(topic);
      console.log(`topic ${topic}: ${total} cards, ${due} due now`);
      break;
    }

    case "agent": {
      const topic = await requireActive(f.topic);
      // Interactive: the agent presents a card, this reads the learner's answer.
      const provider: AnswerProvider = async () =>
        prompt("\nYour answer (blank to stop)> ") || null;
      const session = createReviewSession(topic, provider, (e) => {
        if (e.kind === "assistant_text") console.log(`\n🗣  ${e.data}`);
        else if (e.kind === "tool_use") console.log(`   · ${(e.data as { name: string }).name}`);
      });
      session.converseProvider = async (say) => {
        console.log(`\n🗣  ${say}`);
        return prompt("> ") || null;
      };
      const res = await runSession(session, {
        model: f.model,
        maxTurns: f.maxTurns ? Number(f.maxTurns) : undefined,
      });
      console.log(
        `\n— session ${res.stopReason} (${res.numTurns} turns, $${res.costUsd.toFixed(4)})`,
      );
      break;
    }

    case "daily": {
      const topic = await requireActive(f.topic);
      const provider: AnswerProvider = async () =>
        prompt("\nYour answer (blank to stop)> ") || null;
      // Stable per-day id so a killed session resumes the same day.
      const session = createReviewSession(
        topic,
        provider,
        (e) => {
          if (e.kind === "assistant_text") console.log(`\n🗣  ${e.data}`);
          else if (e.kind === "tool_use") console.log(`   · ${(e.data as { name: string }).name}`);
        },
        `daily-${dayKey()}`,
      );
      session.converseProvider = async (say) => {
        console.log(`\n🗣  ${say}`);
        return prompt("> ") || null;
      };
      const res = await runSession(session, {
        mode: "daily",
        model: f.model,
        maxTurns: f.maxTurns ? Number(f.maxTurns) : undefined,
      });
      console.log(
        `\n— daily session ${res.stopReason} (${res.numTurns} turns, $${res.costUsd.toFixed(4)})`,
      );
      break;
    }

    default:
      console.log(USAGE);
  }
}

// Only run as a CLI when invoked directly (e.g. the `recallit` bin), so the
// module can also be imported (via the "./cli" export) without side effects.
if (import.meta.main) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
