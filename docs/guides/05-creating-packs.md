# Creating Packs — Every Way

A **pack** is the portable unit of a subject — `manifest.json` + `cards.json` + optional `scenarios/` + `assets/`, no engine code. There are two ways to make one:

1. **Generate** it from a source with `recallit pack` (or the `/recallit-pack` skill) — the agent reads a PDF/URL/repo/concept and drafts honest, source-grounded cards.
2. **Author** it by hand — write `manifest.json` + `cards.json` yourself for full control. See [04-authoring-and-publishing-packs.md](04-authoring-and-publishing-packs.md).

Then refine either with `recallit pack edit` (agent) or by editing `cards.json` directly.

All commands below use `bun run cli <cmd>` (the `cli` script = `bun run src/cli.ts`). Pick whichever, they are identical.

## Read this first — cost & key caveats

| Caveat | Detail |
|---|---|
| **Real API cost** | `pack` / `pack edit` run the live Claude Agent SDK loop. Typical pack: **~$0.10–0.40**. Needs `ANTHROPIC_API_KEY`. Cost is printed at the end of every run. |
| **Honesty gate is substring, not entailment** | The gate verifies each card's `meta.sourceQuote` is a *literal substring* of the saved source. It proves the quote is **present**, NOT that the `back` faithfully interprets it. Treat "ready" as "cites a checkable line," not "verified true." |
| **Concept packs are attribution-only** | A bare concept (no source doc) is researched via web search → `meta.grounding: "web"`. It forces a confirm on install **even under `--auto`**, and is not authoritative. |
| **`needs-review` never auto-installs** | The gate stamps `meta.status: "needs-review"` on flagged cards; `topic add` skips them. They stay in `cards.json` for later promotion. |
| **Generated packs are `modality: text` only** | `pack` ships text cards — no audio, no scenarios. Turning a pack into a voice pack is a manual step (see [Voice](#turning-a-generated-pack-into-a-voice-pack)). |
| **Non-additive edits reset FSRS** | `pack edit` that *changes or removes* an existing card needs a force re-install that **wipes the review schedule** for that topic. Purely additive edits are merged non-destructively. |
| **Grading is lexical** | Once installed, answers are graded by normalized string match (diacritics stripped). Fine for comprehension; valid paraphrases can grade `Again`. Not a pack-gen issue but shapes how you write `back`. |

---

## 1. Generate a pack: `recallit pack <source>`

```bash
bun run cli pack <source> [--review|--dry-run|--auto] \
  [--scope "..."] [--style qa|term|cloze|mixed] \
  [--force] [--max-budget <usd>] [--model <m>]
```

The agent ingests the source, drafts cards (each with a verbatim `meta.sourceQuote`), runs the deterministic honesty gate, then installs per mode. The pack lands on disk at `packs/<id>/` as a portable, re-editable artifact.

### Source types

| Source | Example | What the agent does |
|---|---|---|
| **Local file / PDF** | `./atomic-habits.pdf`, `./notes.md` | `Read`s it (PDFs natively, chapter-chunked). Image-only/scanned PDFs abort honestly. |
| **URL / article** | `https://…/article` | `WebFetch`s clean text; falls back to a browser for JS/paywall pages. |
| **Git / npm repo** | `github:colinhacks/zod`, `git+https://…/p.git`, `npm:zod` | Cloned to a temp dir; grounds in real code spans, `package.json` exports, README, `.d.ts`. Stamps the git ref in `meta.sourceRef`. |
| **Bare concept** | `"TCP vs UDP"` | Research-first: web-searches the concept, fetches reputable hits, writes them to the corpus, extracts only from that. `grounding=web` (attribution-only). |

```bash
bun run cli pack ./atomic-habits.pdf
bun run cli pack github:colinhacks/zod --scope "the public API and common idioms"
bun run cli pack npm:date-fns --style term
bun run cli pack "TCP vs UDP" --review
```

### Modes — A / B / C, and when to use which

The same loop runs every time; modes differ only in **who confirms install, and when**.

| Mode | Trigger | Preview | Installs | Use when |
|---|---|---|---|---|
| **A · one-shot** | *default* on CLI, or `--auto` | none (just progress + summary) | auto-installs **ready** cards | You trust the source and want the deck now. |
| **B · review (preview gate)** | `--review` | shows samples + the verdict, then a `y/N/e` prompt | only on `y` | You want to eyeball cards/scope before committing. |
| **C · ambient** | the `/recallit-pack` skill with a prose request | inherits B unless you say "just do it" | deferred, stated | You're describing intent in natural language (Claude Code). |

**`y/N/e` prompt** (mode B and all concept/web-grounded packs):
- `y` — install ready cards now.
- `N` — leave the pack on disk, don't install.
- `e` — leave on disk so you can edit `cards.json` first, then `bun run cli topic add packs/<id>`.

> Note: a **web-grounded (concept) pack always shows the `y/N/e` confirm**, even with `--auto`, with an "attribution-only, not authoritative" warning. Source-grounded packs honor `--auto`/default A and install straight away.

### Steering & guardrails

| Flag | Effect |
|---|---|
| `--scope "..."` | Free-text steering appended to the prompt ("only chapter 3", "actionable advice only"). |
| `--style qa\|term\|cloze\|mixed` | Card shape preference. |
| `--dry-run` | Author + gate + write `packs/<id>/`, but **never install**. Inspect, then `topic add` manually. |
| `--max-budget <usd>` | Hard cost ceiling for the agent loop. |
| `--force` | On install, overwrite an existing topic of the same id (wipes + replaces — resets FSRS). |
| `--model <m>` | Override the agent model. |

### Reading the verdict

Every run ends with a line like:

```
23/25 ready, 2 need review · grounding source · $0.18
  ⚠ Atomic habits compound at 1% daily  [unverified-number]
  ⚠ James Clear ran a marathon          [unverified-proper-noun]
```

`ready` = cards that passed the gate (install). `need review` = held back. **Reason codes:**

| Code | Meaning |
|---|---|
| `quote-not-in-corpus` | `sourceQuote` is not a literal substring of the saved source. |
| `missing-source-quote` | Card has no `meta.sourceQuote` at all. |
| `unverified-number` | `back` introduces a number absent from the quote/context. Mitigation, not a guarantee. |
| `unverified-proper-noun` | `back` introduces a proper noun absent from the quote/context. (Errs toward review — can over-flag e.g. dates; safe direction.) |
| `duplicate-front` | An exact-`normalize(front)` duplicate of another card (paraphrase dupes are NOT caught). |
| `quality:*` | Empty/placeholder/`front==back`/over-long card. |

### The `/recallit-pack` skill (Claude Code door)

The same engine, conversational. Use it inside Claude Code:

```
/recallit-pack ./atomic-habits.pdf
/recallit-pack turn this article into a deck of only the actionable advice: https://…
/recallit-pack make a zod deck and just install it, no preview
```

| You say | Mode |
|---|---|
| a path/URL alone | **B** — scopes briefly, previews ~3 samples, confirms |
| a prose request ("turn this into a deck of only X") | **C** — parses intent from your words, echoes "here's what I understood", then proceeds as B |
| "just do it" / "no preview" | **A** — generates, gates, installs ready cards, reports |

Use the **CLI door** for scripting/repeatable runs; the **skill door** for exploratory, conversational authoring. Both write the same `packs/<id>/` and both honor the gate.

---

## 2. The honesty gate & needs-review handling

The gate is **code** (`src/packgen/gate.ts`), not prompt-faith — the model cannot talk past it.

**Inspect a drafted pack without the LLM:**

```bash
bun run cli pack write packs/<id>    # (re-)gate: stamp meta.status, rewrite cards.json, print verdict
bun run cli pack review packs/<id>   # list only the needs-review cards + reason codes
```

`pack write` re-reads `manifest.json` + `cards.json` + `.author/source.txt`, runs substring + quality + number/proper-noun checks + `normalize(front)` dedup, and stamps `meta.status: "needs-review"` (+ `meta.reviewReasons`) on flagged cards. `pack review` is a read-only dump — handy any time.

**Promoting a needs-review card** (after you verify it by hand): open `packs/<id>/cards.json`, remove the `meta.status`/`meta.reviewReasons` from that card (or fix the `sourceQuote` so it's a real substring), then re-install:

```bash
bun run cli topic add packs/<id> --force   # ⚠ resets FSRS for an existing topic
```

`topic add` always installs **ready cards only** and skips `needs-review` automatically — reported as `heldForReview: N` on install.

---

## 3. Author a pack by hand

For full control (precise wording, voice/scenarios, no API cost) write the files yourself. Minimal layout:

```
packs/<id>/
  manifest.json   # { schemaVersion:1, engine:">=0.1.0", id, name, modality, meta }
  cards.json      # NewCardInput[]
```

```bash
bun run cli topic add packs/<id>           # install (ready cards only)
bun run cli stats --topic <id>
```

Full schema (manifest fields, `cards.json` `audio`, engine-range gate, remote sources, publishing via git/npm/tarball, `loadPack` validation): **[04-authoring-and-publishing-packs.md](04-authoring-and-publishing-packs.md)**. Card field semantics + the i+1 rule + scenario format: **[02-authoring-cards-and-scenarios.md](02-authoring-cards-and-scenarios.md)**.

**Best for:** voice packs (gen is text-only), hand-curated wording, zero API spend, or projecting an existing live instance into a pack.

---

## 4. Edit & enhance: `recallit pack edit`

```bash
bun run cli pack edit <id> "<instruction>" [--dry-run] [--auto] [--max-budget <usd>]
```

The agent reopens the pack (`cards.json` is the source of truth), applies your instruction, re-gates, and re-installs per the change type:

```bash
bun run cli pack edit zod "add 10 cards on the .refine() API"
bun run cli pack edit atomic-habits "card 7's answer is wrong, fix it"
bun run cli pack edit zod "add cards on transforms" --dry-run   # write cards.json, don't re-install
```

**Two outcomes — this is the key distinction:**

| Edit type | Behavior |
|---|---|
| **Additive** (only *new* cards added) | Merged non-destructively — `+N new card(s)`, **existing FSRS review history preserved**. No confirm needed. |
| **Non-additive** (existing card changed/removed) | Needs a clean re-install that **RESETS the review schedule** for the topic. Prints a warning and asks `Proceed and reset review progress? [y/N]` (skipped with `--auto`/`--yes`). |

`--dry-run` updates `packs/<id>/cards.json` and stops (no re-install). If no changes were written the command exits 2 with the stop reason + cost.

**Editing by hand instead:** open `packs/<id>/cards.json`, change cards, re-gate with `pack write`, re-install with `topic add --force` (which resets FSRS — same caveat). Use hand-editing for surgical/bulk changes you'd rather not spend API tokens on; use `pack edit` for "add N cards on X" where the agent grounds new cards in the source for you.

> v1 limits: dedup is exact-`normalize(front)` only (paraphrase dupes slip through); non-additive edits cannot yet merge by card key, hence the full reset.

---

## Turning a generated pack into a voice pack

`pack` ships `modality: text`. To make it voice (shadowing + roleplay in `daily`), edit the pack by hand:

1. Set `manifest.json` `"modality": "voice"` (or `"both"`); optionally `meta.voiceId` (per-topic ElevenLabs voice — now wired) and `meta.language`.
2. Add `scenarios/*.md` for roleplay (format in [02](02-authoring-cards-and-scenarios.md)).
3. Supply `assets/*.mp3` + per-card `audio` for offline native audio, **or** omit audio and let voice topics synthesize at runtime (needs `ELEVENLABS_API_KEY`).
4. `bun run cli topic add packs/<id> --force`.

Voice internals (phases, providers, env, push-to-talk `serve`): **[03-operating-the-agent.md](03-operating-the-agent.md)**, **[01-instantiate-multimodal-spanish.md](01-instantiate-multimodal-spanish.md)**.

---

## Pick your path

| Goal | Path |
|---|---|
| Deck from a doc/repo/URL fast | `pack <source>` (mode A) |
| Same, but vet scope/cards first | `pack <source> --review` |
| Conversational, in Claude Code | `/recallit-pack <source-or-request>` |
| Study an idea with no source | `pack "<concept>"` (web-grounded, confirm required) |
| Add cards to a pack, keep progress | `pack edit <id> "add ..."` (additive merge) |
| Precise wording / voice / no API cost | hand-author ([04](04-authoring-and-publishing-packs.md)) |

After any path: `bun run cli stats --topic <id>` then `bun run cli daily --topic <id>` to study.
