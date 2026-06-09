// The live pack-author agent loop. Mirrors src/agent.ts runSession (Claude Agent SDK
// query + maxTurns/maxBudget guards) but swaps the system prompt and grants the model
// read-only ingestion tools (Read / WebFetch / WebSearch) + two path-guarded MCP write
// tools. CRITICAL: runPackAuthor NEVER installs — it ends at the write_pack verdict;
// installation is always the caller's seam (cli.ts). One engine; A/B/C differ only in
// what the caller does after this returns.
import { mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSdkMcpServer, query, tool } from "@anthropic-ai/claude-agent-sdk";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { parseSource } from "../resolve.ts";
import { type WriteVerdict, writePack } from "./gate.ts";

const ok = (data: unknown): CallToolResult => ({
  content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data) }],
});
const fail = (msg: string): CallToolResult => ({
  content: [{ type: "text", text: msg }],
  isError: true,
});

export interface PackAuthorEvent {
  kind: "assistant_text" | "tool_use";
  data: unknown;
}

export interface PackAuthorOptions {
  scope?: string;
  style?: string;
  model?: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  onEvent?: (e: PackAuthorEvent) => void;
}

export interface PackAuthorResult {
  packId: string;
  packDir: string;
  verdict: WriteVerdict | null;
  stopReason: string;
  costUsd: number;
}

const AUTHOR_TOOLS = [
  "Read",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
  "mcp__packauthor__save_source",
  "mcp__packauthor__write_pack",
];

export type SourceKind = "file" | "url" | "repo" | "concept";

export interface PreparedSource {
  kind: SourceKind;
  /** What the agent reads/fetches: a file path, a URL, a cloned repo dir, or the concept text. */
  localPath: string;
  packId: string;
  /** Human/manifest source ref (the original `source`, not a temp path). */
  sourceLabel: string;
  /** For repos: the git ref / npm version, stamped into manifest.meta.sourceRef. */
  sourceRef?: string;
  cleanup: () => Promise<void>;
}

const noop = async (): Promise<void> => {};

async function run(cmd: string[], cwd?: string): Promise<void> {
  const proc = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  if ((await proc.exited) !== 0) {
    const err = (await new Response(proc.stderr).text()).trim();
    throw new Error(`\`${cmd[0]}\` failed: ${err || "unknown error"}`);
  }
}

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

/**
 * Classify a source and, for repos, fetch it locally (git clone / npm pack) so the
 * agent never needs Bash or network-clone capability. Returns the local path the
 * agent should read + a cleanup for any temp dir. The honesty model is unchanged:
 * the agent saves what it reads to .author/source.txt, and cards are gated against it.
 */
export async function prepareSource(source: string): Promise<PreparedSource> {
  const s = source.trim();
  const d = parseSource(s);

  if (d.kind === "git" && d.url) {
    const tmp = await mkdtemp(join(tmpdir(), "recallit-srcrepo-"));
    const dir = join(tmp, "repo");
    const args = ["git", "clone", "--depth", "1"];
    if (d.ref) args.push("--branch", d.ref);
    args.push(d.url, dir);
    await run(args);
    return {
      kind: "repo",
      localPath: d.subdir ? join(dir, d.subdir) : dir,
      packId: slugFromSource(s),
      sourceLabel: s,
      sourceRef: d.ref ?? "HEAD",
      cleanup: () => rm(tmp, { recursive: true, force: true }),
    };
  }

  if (d.kind === "npm" && d.spec) {
    const tmp = await mkdtemp(join(tmpdir(), "recallit-srcnpm-"));
    await run(["npm", "pack", d.spec, "--pack-destination", tmp], tmp);
    const tgz = (await readdir(tmp)).find((f) => f.endsWith(".tgz"));
    if (!tgz) throw new Error(`npm pack produced no tarball for "${d.spec}"`);
    await run(["tar", "-xzf", join(tmp, tgz), "-C", tmp]);
    return {
      kind: "repo",
      localPath: join(tmp, "package"), // npm tarballs extract to package/
      packId: slugFromSource(d.spec),
      sourceLabel: s,
      sourceRef: d.spec,
      cleanup: () => rm(tmp, { recursive: true, force: true }),
    };
  }

  if (/^https?:\/\//i.test(s)) {
    return { kind: "url", localPath: s, packId: slugFromSource(s), sourceLabel: s, cleanup: noop };
  }
  if (await isFile(s)) {
    return { kind: "file", localPath: s, packId: slugFromSource(s), sourceLabel: s, cleanup: noop };
  }
  // No resolvable source → a concept/topic described in prose. Research-first, web-grounded.
  return {
    kind: "concept",
    localPath: s,
    packId: slugFromSource(s) || "concept",
    sourceLabel: s,
    cleanup: noop,
  };
}

/** A stable, filesystem-safe pack id derived from the source. */
export function slugFromSource(source: string): string {
  const stripped = source
    .trim()
    .replace(/^(github:|git\+|npm:|https?:\/\/|\.{0,2}\/)/i, "")
    .split(/[?#]/)[0] as string;
  const tail = stripped.split("/").filter(Boolean).pop() ?? stripped;
  const slug = tail
    .replace(/\.[a-z0-9]+$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "pack";
}

/** Prepare N sources (files/urls/repos/concepts). The caller MUST clean up all. */
export async function prepareSources(sources: string[]): Promise<PreparedSource[]> {
  return Promise.all(sources.map((s) => prepareSource(s)));
}

/** Append text to the pack's grounding corpus. The first call creates it; later
 *  calls APPEND with a distinctive separator (so a card quote can't span two
 *  sources, and so single-source authoring writes a byte-identical corpus). */
export async function appendCorpus(packDir: string, text: string): Promise<number> {
  await mkdir(join(packDir, ".author"), { recursive: true });
  const file = join(packDir, ".author", "source.txt");
  const prev = (await Bun.file(file).exists()) ? await Bun.file(file).text() : "";
  const combined = prev ? `${prev}\n\n===== additional source =====\n\n${text}` : text;
  await Bun.write(file, combined);
  return combined.length;
}

function buildAuthorServer(packDir: string, capture: { verdict: WriteVerdict | null }) {
  return createSdkMcpServer({
    name: "packauthor",
    version: "1.0.0",
    tools: [
      tool(
        "save_source",
        "Save extracted source text as the grounding corpus. Call once per source — repeated calls APPEND into one combined corpus. Every card's quote is verified against this exact text.",
        { text: z.string() },
        async (args) => {
          const chars = await appendCorpus(packDir, args.text);
          return ok({ saved: true, chars });
        },
      ),
      tool(
        "write_pack",
        "Validate + gate + write the pack (manifest + cards). Runs the deterministic honesty gate and returns {ready, needsReview}. Call ONCE, last. Do NOT install — that's the user's step.",
        {
          manifest: z.record(z.string(), z.unknown()),
          cards: z.array(z.record(z.string(), z.unknown())),
        },
        async (args) => {
          try {
            const v = await writePack(packDir, args.manifest, args.cards);
            capture.verdict = v;
            return ok({
              ready: v.ready,
              total: v.total,
              grounding: v.grounding,
              needsReview: v.needsReview.map((r) => ({ front: r.card.front, reasons: r.reasons })),
            });
          } catch (e) {
            return fail(String(e instanceof Error ? e.message : e));
          }
        },
      ),
    ],
  });
}

const INGEST: Record<SourceKind, (p: PreparedSource) => string[]> = {
  file: (p) => [
    `INGEST. Read the local file at ${p.localPath} with the Read tool (it reads PDFs natively, page by page).`,
    "Then call save_source(text) ONCE with the full raw text you extracted.",
  ],
  url: (p) => [
    `INGEST. WebFetch ${p.localPath} for the article text (follow a linked page or two only if needed).`,
    "Then call save_source(text) ONCE with the cleaned article text.",
  ],
  repo: (p) => [
    `INGEST. The source is a code repository cloned locally at ${p.localPath} (ref ${p.sourceRef}).`,
    "Read package.json to find the public exports/main/types — treat that as the allowlist of public surface.",
    "Use Glob/Grep/Read on the exported source, type declarations (.d.ts), the README, and examples/tests. Stay on the PUBLIC API; ignore internals.",
    "Then call save_source(text) ONCE with the relevant code + doc spans you will quote from (signatures, README paragraphs, example snippets).",
  ],
  concept: (p) => [
    `INGEST (research-first; highest hallucination risk). There is no document — the source is a concept: "${p.sourceLabel}".`,
    "WebSearch the concept and its key subtopics, then WebFetch the most reputable hits (official docs, .edu, encyclopedias).",
    "Call save_source(text) ONCE with the gathered evidence. The concept name SEEDS your searches; it is never card content. Extract cards ONLY from the fetched evidence.",
  ],
};

const DRAFT_NOTE: Record<SourceKind, string> = {
  file: "Fewer true cards beat many shaky ones.",
  url: "Fewer true cards beat many shaky ones.",
  repo: "Card types: api (signature → behavior), concept (a README/doc claim), idiom (a canonical snippet). Quote real code or doc spans.",
  concept:
    "Every card needs a quote from the evidence you fetched; anything you can't back with a fetched quote, leave out.",
};

function buildPrompt(prep: PreparedSource, opts: PackAuthorOptions): string {
  const directives: string[] = [];
  if (opts.scope) directives.push(`Scope/focus: ${opts.scope}`);
  if (opts.style) directives.push(`Card style preference: ${opts.style}`);
  const grounding = prep.kind === "concept" ? "web" : "source";
  const refField = prep.sourceRef ? `, sourceRef: ${JSON.stringify(prep.sourceRef)}` : "";
  return [
    "You are recallit's pack author. Turn ONE source into an HONEST spaced-repetition pack on disk, then stop.",
    "You do NOT install the pack — that is the user's step. End after write_pack returns.",
    "",
    `Pack id: "${prep.packId}" (the write tools are bound to this pack; your manifest.id must equal it).`,
    "",
    `1. ${INGEST[prep.kind](prep).join("\n   ")}`,
    "   If you cannot extract real text (image-only PDF, empty/blocked page, missing files), STOP and say so. Never invent a corpus.",
    "2. DRAFT cards grounded in that saved text. Two kinds, by what 'knowing it' means:",
    "   (a) FLASHCARD — atomic recall (a term, date, definition, phrase). front (prompt), back (answer),",
    "       context (optional), tags (optional), and meta.sourceQuote: a VERBATIM span from the saved text",
    "       (a literal substring). No quote → no card. The answer must be supported by the quote; add no",
    "       facts/numbers/names not in the source.",
    "   (b) CHECKABLE ITEM — comprehension/free-recall ('explain why X', 'the key points of Y', an argument)",
    "       where one quote can't capture the whole answer. Set type:'explain', meta.grader:'coverage', and",
    "       meta.rubric = 2–5 checkpoints. Each checkpoint = { id (short slug), claim (one point in YOUR words),",
    "       required (true for core points, false for nice-to-have), sourceQuote (a VERBATIM substring of the",
    "       saved text grounding THAT point) }. Set back to a concise exemplar answer (for review). The learner",
    "       passes by covering the required points in their own words; every checkpoint's sourceQuote must be",
    "       literally in the source or the gate holds the whole card.",
    `   Aim for ~15–30 sharp cards, mixing both kinds as the material warrants. ${DRAFT_NOTE[prep.kind]}`,
    ...(directives.length ? [`   Extra directives: ${directives.join(" · ")}`] : []),
    "3. WRITE. Call write_pack(manifest, cards):",
    `   manifest = { schemaVersion: 1, engine: ">=0.1.0", id: "${prep.packId}", name: <human title>, modality: "text",`,
    `     meta: { source: { kind: "${prep.kind}", ref: ${JSON.stringify(prep.sourceLabel)} }, grounding: "${grounding}"${refField} } }`,
    "   The gate flags any quote not literally present in the saved text (kept as needs-review, not installed).",
    "4. Report briefly: how many cards are ready vs need review, then stop.",
    "",
    "Honesty is the whole point. The gate verifies your quotes are literally present in the source you saved.",
  ].join("\n");
}

/** Author prompt for N>1 sources: ingest each, save_source per source (appends into
 *  one corpus), draft cards grounded in the combined text, manifest carries sources[]. */
export function buildPromptMulti(preps: PreparedSource[], opts: PackAuthorOptions): string {
  const directives: string[] = [];
  if (opts.scope) directives.push(`Scope/focus: ${opts.scope}`);
  if (opts.style) directives.push(`Card style preference: ${opts.style}`);
  const packId = preps[0]?.packId ?? "pack";
  const grounding = preps.some((p) => p.kind === "concept") ? "web" : "source";
  const sourcesMeta = preps.map((p) => ({ kind: p.kind, ref: p.sourceLabel }));
  const ingest = preps.map((p, i) => `   1.${i + 1} ${INGEST[p.kind](p).join("\n        ")}`);
  return [
    `You are recallit's pack author. Turn these ${preps.length} sources into ONE HONEST spaced-repetition pack on disk, then stop.`,
    "You do NOT install the pack — that is the user's step. End after write_pack returns.",
    "",
    `Pack id: "${packId}" (the write tools are bound to this pack; your manifest.id must equal it).`,
    "",
    "1. INGEST EACH source below; after reading each, call save_source(text) with THAT source's text",
    "   (repeated calls APPEND into one combined corpus). Do every source before drafting.",
    ...ingest,
    "   If a source yields no real text (image-only PDF, blocked page), skip it and say so. Never invent a corpus.",
    "2. DRAFT cards grounded in the saved combined text. Two kinds, by what 'knowing it' means:",
    "   (a) FLASHCARD — atomic recall. front, back, context (optional), tags (optional), and meta.sourceQuote:",
    "       a VERBATIM span from the saved text (a literal substring). No quote → no card.",
    "   (b) CHECKABLE ITEM — comprehension/free-recall. type:'explain', meta.grader:'coverage', meta.rubric =",
    "       2–5 checkpoints, each { id, claim (your words), required (bool), sourceQuote (a VERBATIM substring) }.",
    "       Set back to a concise exemplar. Every checkpoint's sourceQuote must be literally in the corpus.",
    "   Aim for ~15–30 sharp cards across the sources. Fewer true cards beat many shaky ones.",
    ...(directives.length ? [`   Extra directives: ${directives.join(" · ")}`] : []),
    "3. WRITE. Call write_pack(manifest, cards):",
    `   manifest = { schemaVersion: 1, engine: ">=0.1.0", id: "${packId}", name: <human title>, modality: "text",`,
    `     meta: { sources: ${JSON.stringify(sourcesMeta)}, grounding: "${grounding}" } }`,
    "   The gate flags any quote not literally present in the saved combined text (kept as needs-review).",
    "4. Report briefly: how many cards are ready vs need review, then stop.",
    "",
    "Honesty is the whole point. The gate verifies your quotes are literally present in the combined source you saved.",
  ].join("\n");
}

/**
 * Author a pack from N sources (files/urls/repos/concepts), grounding cards across
 * the combined corpus. Single-source goes through the unchanged buildPrompt path, so
 * `runPackAuthor(source)` is byte-identical. Returns the write_pack verdict; NEVER installs.
 */
export async function runPackAuthorMulti(
  sources: string[],
  opts: PackAuthorOptions = {},
): Promise<PackAuthorResult> {
  const preps = await prepareSources(sources);
  const first = preps[0];
  if (!first) throw new Error("no sources to author from");
  const packId = first.packId;
  const packDir = join(process.cwd(), "packs", packId);
  await mkdir(packDir, { recursive: true });

  const capture: { verdict: WriteVerdict | null } = { verdict: null };
  const server = buildAuthorServer(packDir, capture);
  const systemPrompt = preps.length === 1 ? buildPrompt(first, opts) : buildPromptMulti(preps, opts);

  let stopReason = "unknown";
  let costUsd = 0;

  try {
    for await (const message of query({
      prompt: "Author the pack now, following your instructions exactly.",
      options: {
        mcpServers: { packauthor: server },
        allowedTools: AUTHOR_TOOLS,
        // Headless: no human to approve; capability is constrained by allowedTools.
        permissionMode: "bypassPermissions",
        systemPrompt,
        model: opts.model ?? "claude-sonnet-4-6",
        maxTurns: opts.maxTurns ?? 40,
        maxBudgetUsd: opts.maxBudgetUsd ?? 1,
      },
    })) {
      if (message.type === "assistant") {
        for (const block of message.message.content) {
          if (block.type === "text") opts.onEvent?.({ kind: "assistant_text", data: block.text });
          else if (block.type === "tool_use")
            opts.onEvent?.({ kind: "tool_use", data: { name: block.name } });
        }
      } else if (message.type === "result") {
        stopReason = message.subtype;
        costUsd = message.total_cost_usd;
      }
    }
  } finally {
    // Clean up ALL prepared sources, even if a mid-run throw occurred.
    await Promise.all(preps.map((p) => p.cleanup()));
  }

  return { packId, packDir, verdict: capture.verdict, stopReason, costUsd };
}

/** Author a pack from a single source. Thin wrapper over runPackAuthorMulti. NEVER installs. */
export async function runPackAuthor(
  source: string,
  opts: PackAuthorOptions = {},
): Promise<PackAuthorResult> {
  return runPackAuthorMulti([source], opts);
}

const EDIT_TOOLS = ["Read", "mcp__packauthor__write_pack"];

function buildEditPrompt(packId: string, packDir: string, instruction: string): string {
  return [
    "You are recallit's pack editor. Edit the EXISTING pack on disk, then stop. You do NOT install — that is the user's step.",
    `Pack id: "${packId}" at ${packDir}.`,
    "",
    `1. Read the current cards (${join(packDir, "cards.json")}) and the grounding corpus (${join(packDir, ".author", "source.txt")}).`,
    `2. Apply this instruction exactly: ${instruction}`,
    "   - Edits AND any new cards must stay grounded: every card's meta.sourceQuote must be a VERBATIM substring of the corpus. Never invent facts, numbers, or names beyond the corpus.",
    "   - 'add N' = draft N more cards from the corpus; 'fix card X' = correct it while keeping its quote valid; 'split' = partition; 'merge' = combine + dedup.",
    "3. Call write_pack(manifest, cards) with the FULL updated card set (read the existing manifest.json; keep its id, update name only if asked). The gate re-checks every card.",
    "4. Report what changed (added/edited/removed, ready vs needs-review), then stop.",
    "",
    "Do NOT save a new corpus — it is fixed. Quotes not present in the corpus get flagged needs-review.",
  ].join("\n");
}

/**
 * Edit an existing pack in place from a natural-language instruction. Reuses the
 * same write_pack gate (re-gates the whole set). NEVER installs — the caller
 * re-installs with force and surfaces the FSRS-reset caveat.
 */
export async function runPackEditor(
  packId: string,
  instruction: string,
  opts: PackAuthorOptions = {},
): Promise<PackAuthorResult> {
  const packDir = join(process.cwd(), "packs", packId);
  if (!(await isFile(join(packDir, "cards.json")))) {
    throw new Error(`pack "${packId}" not found at ${packDir}`);
  }

  const capture: { verdict: WriteVerdict | null } = { verdict: null };
  const server = buildAuthorServer(packDir, capture);

  let stopReason = "unknown";
  let costUsd = 0;

  for await (const message of query({
    prompt: "Edit the pack now, following your instructions exactly.",
    options: {
      mcpServers: { packauthor: server },
      allowedTools: EDIT_TOOLS,
      permissionMode: "bypassPermissions",
      systemPrompt: buildEditPrompt(packId, packDir, instruction),
      model: opts.model ?? "claude-sonnet-4-6",
      maxTurns: opts.maxTurns ?? 30,
      maxBudgetUsd: opts.maxBudgetUsd ?? 1,
    },
  })) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") opts.onEvent?.({ kind: "assistant_text", data: block.text });
        else if (block.type === "tool_use")
          opts.onEvent?.({ kind: "tool_use", data: { name: block.name } });
      }
    } else if (message.type === "result") {
      stopReason = message.subtype;
      costUsd = message.total_cost_usd;
    }
  }

  return { packId, packDir, verdict: capture.verdict, stopReason, costUsd };
}
