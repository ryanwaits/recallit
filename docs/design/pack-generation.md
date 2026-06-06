# Design: generate a pack from anything

> Status: proposed (from a multi-agent design pass). Two decisions still open — see end.
> Goal: let anyone create a recallit pack by pointing at a source (PDF, book, code repo, URL/article) or just describing a concept in natural language, then keep tweaking it with the same elegant UX.

## North star

One verb:

```
recallit pack <source-or-idea>
```

`<source>` = `./atomic-habits.pdf` · `github:colinhacks/zod` · `https://…/article` · `npm:zod` · or a quoted concept `"TCP vs UDP"`.
Refine with: `recallit pack edit <id>` ("add 10 on chapter 3", "card 7 is wrong, fix it", "split into beginner/advanced").

## Architecture (agent-native, almost no new code)

Rejected as over-engineering:
- A **dynamic-workflows fan-out** over chunks — the Agent SDK has no programmatic map primitive (subagents are model-invoked Task calls). Sequential read→extract is simpler; honesty matters more than throughput. Revisit only if large-source latency hurts.
- A **multi-tool bespoke MCP server** (split/merge/synth-audio as TypeScript) — those are *prose in the skill* composing primitives. "Features are prompts, not code."

What we build:
1. **One `recallit-pack` SKILL.md** owns all ingestion + extraction + pedagogy. `src/` stays 100% subject-blind.
2. **`runPackAuthor`** — mirror the existing `runSession` harness (Agent SDK `createSdkMcpServer` + `query`), swap the system prompt, grant `Read` / `WebFetch` / `WebSearch` + one write tool, keep the maxTurns/budget guards.
3. **One MCP tool `write_pack(manifest, cards[])`** — path-guarded to `packs/<id>/`, zod-validates against the existing `PackManifestSchema`/`PackCardSchema`, runs the honesty + quality gate, returns `{ ready, needsReview[] }`.
4. **`installPack()` unchanged** as the terminal "install it" seam. The pack stays on disk as the portable, re-editable artifact.

## Honesty strategy (the crux — deterministic, not prompt-faith)

A generator that hallucinates facts is worse than no generator. The gate is **code**, not "trust the model":

- **Source-grounded by default.** Every card carries `meta.sourceQuote` (a verbatim span). Raw source saved to `packs/<id>/.author/source.txt` as the corpus of record.
- **~20-line deterministic gate inside `write_pack`:** reject / `needs-review`-tag any card whose `sourceQuote` is not a literal substring of the corpus. The model cannot vibe-bypass a substring check. This is the engine-owns-invariants ethos applied to generation.
- **Wire `checkCardQuality` into `write_pack`** — it is NOT in the `createCard`/install path today, so this is the right seam to flag placeholder/empty/`front==back`/over-long cards.
- **Honest naming:** this verifies *quote-presence (substring)*, NOT *entailment* — so additionally flag cards whose `back` introduces numbers/proper-nouns absent from quote+context.
- **Concept-only = untrusted.** No source doc → the skill BUILDS one first (`WebSearch` → `WebFetch` reputable hits → write evidence to the corpus), then extracts only from that evidence. The concept name seeds queries, never card content. `manifest.meta.grounding = "web"` advertises attribution-only.
- **`needs-review` cards survive with the tag**, are excluded from the "ready" count, and a concept pack never auto-installs without showing the unverified list.
- **Provenance persists on the cards.json install path** (`createCard` preserves `meta` — verified). It canNOT persist via the `create_card` MCP tool (no `meta` param), which is exactly why provenance is a cards.json-only convention.

## Shared pipeline (one funnel for every source)

`INGEST → SCAFFOLD manifest → EXTRACT cards (with verbatim quotes) → GATE (substring + checkCardQuality) → DEDUP/SEQUENCE (normalize(front) equality; prereqs first) → WRITE pack files → PREVIEW + installPack`.

Note: **do NOT route bulk extraction through `mineCard`** — its token-level i+1 rule rejects nearly every real prose sentence against a fresh known-set. Reserve `mineCard`/i+1 for the existing live mining flow. Dedup for generation = `normalize(front)` equality against the draft array (reuse `evaluate.ts`).

## Per-source adapters (all prose in the skill)

| Source | How | Note |
|---|---|---|
| PDF / book | harness `Read` reads PDFs natively (no PDF lib), chapter-chunked; term/def + fact + Q&A with verbatim quotes | guard: probe page 1 for text → reject image-only scans |
| Code repo / npm | skill's own `git clone --depth 1`; `package.json` exports as public-surface allowlist; card types `api`/`concept`/`idiom`; stamp git ref in `manifest.meta.sourceRef` | grounds in real code spans, not model memory |
| URL / article | `WebFetch`, `agent-browser` fallback for SPA/paywall; save offline copy; ~30-card cap, chunk by heading | |
| Concept / idea | research-first: build a verified source, then extract; strictest `needs-review` defaults; `deep-research` skill for large topics | highest hallucination risk |

## Tweak / enhance loop

`recallit pack edit <id>` reopens with `cards.json` as the single source of truth. Each edit = `Read`+`Edit` cards.json → `write_pack` (re-gate) → re-install. Split/merge/regen-audio are prose composing primitives.

**Honest caveat:** `installPack(..., {force:true})` does `rm(topicDir) + rebuild`, which **resets FSRS schedule/review history**. So "enhance" is destructive to progress in v1. True non-destructive append needs a merge-by-card-key install mode (Phase 4). Do not claim seamless append works yet.

## UX layer — one engine, three doors

The product exposes three interaction models — **A one-shot**, **B conversational**, **C ambient (natural language)** — across three surfaces (CLI, the `/recallit-pack` skill, agent-native). They are **modes of one engine, not three implementations.**

### The contract that kills all forks

`query()` is fire-and-forget — no mid-loop human gate. So:

> **`runPackAuthor` NEVER installs.** It runs the loop, calls `write_pack`, and stops, returning `{ ready, needsReview[], manifest, grounding }`. **`installPack` is always the caller's seam.** A/B/C are just *who calls install, and when*, around the identical loop.

Two engine-owned invariants no surface can bypass:
1. **Honesty gate lives in `write_pack`** (substring + `checkCardQuality`) — deterministic, not prompt-faith.
2. **The ready / needs-review split is structural on disk:** `write_pack` stamps `meta.status: "needs-review"` into `cards.json`; `installPack` skips those by default. "needs-review never auto-installs" is enforced by the engine for every surface, for free. `manifest.meta.grounding: "web"` is likewise engine metadata that forces a confirm everywhere (even under `--auto`).

The only place surfaces differ: a pure `resolveMode(surfaceDefault, flags|utterance) → {mode, rationale}`. Everything after flows through the same loop → same verdict → same install seam.

### Interaction policy

| Mode | Asks | Previews | Installs |
|---|---|---|---|
| **A one-shot** | nothing (fail-honest if source unreadable) | none; progress + summary | caller auto-installs **ready** cards |
| **B conversational** | ≤1 framing Q, only if it changes the deck | **~3 gated samples from the first chunk**, before full extraction | defers until preview + explicit `y/N/e` |
| **C ambient** | only if prose is ambiguous; the **prompt** parses intent, surface echoes "here's what I understood" | inherits B unless "just do it" | deferred seam; auto-vs-gate inferred **and stated** |

### CLI surface (Phase 2)

| Command | Does |
|---|---|
| `recallit pack <source>` | Mode A — generate + auto-install ready cards |
| `recallit pack <source> --review` | Mode B — preview + `y/N/e` gate |
| `recallit pack <source> --dry-run` | author only; never installs |
| `recallit pack <source> --scope "…" --style qa\|term\|cloze\|mixed` | steering, appended to the prompt |
| `recallit pack "<concept>"` | research-first; `grounding=web` forces the gate even under `--auto` |
| `recallit pack edit <id> ["instruction"]` | reopen `cards.json`, re-gate, re-install (FSRS-reset caveat) |
| `recallit pack review <id>` | **no-LLM** honesty inspector — dumps needs-review cards + reason codes |

The CLI spawns `runPackAuthor` via the Agent SDK directly (it cannot run a Claude Code skill). Exit 0 if `ready>0`; exit 2 fail-honest if `ready==0` or source unreadable.

### Skill surface (`/recallit-pack`)

The skill does **exactly three things**: (a) pick the mode via `resolveMode`, (b) pass the raw utterance/path **verbatim** into the system prompt, (c) drive the loop and **render whatever `write_pack` returns**, then install after the gate. *All* classification (path vs concept, filter, scope) is the **prompt's** job, never skill code — that's the line that stops the skill growing a per-utterance parser that forks the engine.

### Agent-native substrate (the shared contract both ride)

- **`runPackAuthor(opts)`** mirrors `runSession` (same `maxTurns`/`maxBudget`/`onEvent`). Swaps only the system prompt + granted tools (`Read`/`WebFetch`/`WebSearch` + `write_pack`). **Never installs.**
- **`write_pack(manifest, cards[])`** — single write seam: path-guard regex + zod + substring honesty gate (+ net-new `unverified-number`/`unverified-proper-noun` flags) + `checkCardQuality` wired in here (it's only in `mine_card` today) + `normalize(front)` dedup. Stamps `meta.status`. Returns one machine-readable verdict with a shared **reason vocabulary** every surface renders identically.
- Honest naming: the gate verifies quote-**presence** (substring), **not entailment**. The number/proper-noun flags are mitigation, not a guarantee. Say so.

## Build phases (smallest valuable first)

| Phase | Goal | Deliverable | Surfaces | Effort |
|---|---|---|---|---|
| 1 | Prove the honest loop, **zero `src/` changes** | `recallit-pack` SKILL.md (PDF + URL adapters); writes pack files by hand; inline `bun -e` substring check; `topic add`. Demo: `/recallit-pack ./atomic-habits.pdf` → previewed, steered, installed deck. *No-bypass invariant is not yet structural here.* | Skill (B + C) | S |
| 2 | Engine-owned gate + the unifying contract | `write_pack` tool; `runPackAuthor` (never installs); `installPack` default-skips `meta.status==='needs-review'`; pure `resolveMode` + unit-test table; CLI verbs (`pack`/`pack edit`/`pack review`); SKILL.md rewired to render the verdict | CLI + Skill, one engine | M |
| 3 | Repo + concept adapters, tweak prose | git/npm adapter (exports allowlist, `meta.sourceRef`); concept adapter (research-first, `grounding=web`, force-confirm); split/merge/regen-audio as prose; `policy.editCaveat` surfaced before `force` | all sources | M |
| 4 (opt) | Non-destructive enhance | scope the cheap win first — a **pure-add** edit `createCard`s new cards without `force` (preserves FSRS); then full merge-by-card-key for changed cards | engine | M |

Phase 1 is the unlock: a single SKILL.md proves the entire experience (B + C) with no engine changes.

## Decisions (resolved for v1)

1. **Pause seam:** caller-side install (loop returns the verdict, the surface decides) — simpler, equally fork-proof. ✅
2. **needs-review lives in `cards.json` via `meta.status`** (not a sidecar) — one file, the edit loop reopens it directly. ✅ *(Phase-1 simplification: until `installPack` skips by status, the skill keeps needs-review cards out of the installed `cards.json` and holds them in `.author/` for review.)*
3. **Provenance = `meta` convention** (`meta.{sourceQuote, grounding, sourceRef, status}`), keeping `src/` subject-blind. ✅
4. **Entrypoint:** skill-first (`/recallit-pack`), `recallit pack` CLI verb as Phase-2 sugar. ✅

## Open questions

- Mode C ambiguity threshold + a concrete card-count cap, defined in the prompt so "asks only when it matters" is reproducible.
- Near-dup detection: `normalize(front)` catches exact dupes, not paraphrases — document the v1 limit, revisit in Phase 3 (esp. the `add 10 on X` edit path).
- Confirm the SDK Task subagent inherits native PDF reading; if not, the PDF-capable harness does the chapter Reads.

## Open questions

- Confirm the SDK Task subagent inherits native PDF reading; if not, the PDF-capable harness (not a spawned subagent) does the chapter Reads.
- Near-dup detection: `normalize(front)` catches exact dupes, not paraphrased facts across a large pack. Acceptable for v1, or add a cheap semantic dedup pass?
