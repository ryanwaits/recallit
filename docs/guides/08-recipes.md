# Recipes — End-to-End Use Cases

Copy-pasteable, end-to-end walkthroughs for getting the most out of recallit. Every command is real (verified against `src/cli.ts`). Run from repo root; all examples use `bun run cli <cmd>` (the `cli` npm script = `bun run src/cli.ts`).

For deeper reference: pack format + publishing → [04-authoring-and-publishing-packs.md](04-authoring-and-publishing-packs.md); card/scenario authoring → [02-authoring-cards-and-scenarios.md](02-authoring-cards-and-scenarios.md); agent/voice internals → [03-operating-the-agent.md](03-operating-the-agent.md); Spanish reference instance → [01-instantiate-multimodal-spanish.md](01-instantiate-multimodal-spanish.md); design rationale → [../design/pack-generation.md](../design/pack-generation.md).

## Before you start — keys & cost

| What you do | Key required | Cost |
|---|---|---|
| Generate a pack (`pack`, `pack edit`) | `ANTHROPIC_API_KEY` | real API spend, **~$0.1–0.4 per pack** (live-measured ~$0.13–0.34) |
| Run a session (`agent`, `daily`) | `ANTHROPIC_API_KEY` | per-session; defaults cap at `maxBudgetUsd 1` |
| Voice (`serve`, voice/both packs) | `ELEVENLABS_API_KEY` (one key = TTS + Scribe STT) | ElevenLabs usage |
| Install / inspect (`topic add`, `due`, `stats`, `pack review`, `pack write`) | none (no LLM) | free |

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export ELEVENLABS_API_KEY=...          # voice only
export RECALLIT_TZ=America/Chicago     # optional — local-day streaks
```

Two doors generate the same packs from the same engine: the **CLI** (`bun run cli pack`) and the **Claude Code skill** (`/recallit-pack <source>`). The skill is conversational (previews + asks); the CLI is scriptable. Pick whichever fits.

---

## Recipe 1 — Turn a PDF / book into a deck

```bash
bun run cli pack ./atomic-habits.pdf --review --scope "chapters 1-3"
#   authoring pack from: ./atomic-habits.pdf  (mode B: --review)
#   · Read  · write_pack
#   42/45 ready, 3 need review · grounding source · $0.21
#     ⚠ Habits compound over 1% daily  [unverified-number]
# install 42 ready cards as "atomic-habits"? [y/N/e] y
#   installed "atomic-habits": 42 ready cards (now active)
#   (the 3 needs-review cards stay in the pack; see them with: pack review packs/atomic-habits)

bun run cli due       # confirm cards are live
bun run cli daily     # study — text pack runs review → reflect
```

The harness `Read`s PDFs natively (no PDF lib), chapter-chunked. Each card carries a verbatim `meta.sourceQuote`; cards whose quote isn't a literal substring of the source get held back as `needs-review`. Image-only scans are rejected (no text on page 1).

- `--review` (mode B) previews ~samples and gates with `y/N/e` (`e` = leave on disk to hand-edit).
- Default (no flag, mode A) auto-installs ready cards.
- `--dry-run` writes the pack but never installs.

## Recipe 2 — Learn a library

```bash
bun run cli pack npm:zod --style mixed
#   authoring pack from: npm:zod  (mode A: default)
#   · Read · Grep · write_pack
#   20/20 ready, 0 need review · grounding source · $0.18
#   installed "zod": 20 ready cards (now active)

bun run cli stats        # topic zod: 20 cards, 20 due now
bun run cli agent        # type answers; engine grades + schedules
```

Repo/npm sources are cloned shallow to a temp dir (the agent never shells out); cards ground in real code spans, not model memory. The git ref is stamped in `manifest.meta.sourceRef`. Other repo forms: `github:colinhacks/zod`, `github:owner/repo#ref`, `git+https://…`.

Card styles via `--style`: `qa | term | cloze | mixed`.

## Recipe 3 — Study an article

```bash
bun run cli pack "https://martinfowler.com/articles/microservices.html" --review
#   17/18 ready, 1 need review · grounding source · $0.15
#   install 17 ready cards as "microservices"? [y/N/e] y

bun run cli daily
```

URLs are fetched (`WebFetch`), capped ~30 cards, chunked by heading. An offline copy is saved to the pack's `.author/source.txt` as the corpus of record, so the honesty gate verifies against what was actually fetched.

## Recipe 4 — Drill a concept from scratch

```bash
bun run cli pack "TCP vs UDP"
#   authoring pack from: TCP vs UDP  (mode A: default)
#   · WebSearch · WebFetch · write_pack
#   25/25 ready, 0 need review · grounding web · $0.13
#
#   ⚠ web-grounded pack — attribution-only, not authoritative.
# install 25 ready cards as "tcp-vs-udp"? [y/N/e] y
#   installed "tcp-vs-udp": 25 ready cards (now active)
```

A bare concept string has no source doc, so the agent **researches first** (`WebSearch` → `WebFetch` reputable hits → writes evidence to the corpus), then extracts only from that evidence. The concept name seeds queries, never card content.

**Honest:** `manifest.meta.grounding = "web"` marks these **attribution-only, not authoritative** — they are grounded in web pages, not vetted truth. Web-grounded packs **always force a confirm**, even under `--auto`. Highest hallucination risk of any source.

## Recipe 5 — Enhance a deck over time

```bash
# Additive edit — only NEW cards → merged non-destructively (FSRS history preserved):
bun run cli pack edit zod "add 8 cards on .refine() and custom errors"
#   editing "zod": add 8 cards on .refine() and custom errors
#   8/8 ready, 0 need review · $0.09
#   enhanced "zod": +8 new card(s), existing progress preserved (FSRS intact)

# Edit that changes/removes existing cards → needs a force rebuild that RESETS the schedule:
bun run cli pack edit zod "card 7 is wrong, fix the back"
#   ⚠ 1 existing card(s) changed/removed — a clean re-install is needed,
#     which RESETS the review schedule for "zod".
#   Proceed and reset review progress? [y/N] n
#     left on disk (not re-installed): packs/zod
```

**The distinction that matters:** purely additive edits merge via `installPack({merge:true})` — your review history survives. Any edit that changes or removes an existing card needs `force` (which does `rm + rebuild`), so the **whole topic's FSRS schedule resets**. The CLI detects which (by `normalize(front)` comparison) and only prompts for confirmation on the destructive path. `--dry-run` writes without re-installing; `--auto` skips the reset confirm.

**Limit:** dedup is exact-front-match only (`normalize(front)`), so paraphrased near-duplicates aren't caught.

## Recipe 6 — Speak a language (voice)

```bash
bun run seed:spanish      # install the reference Conversational Mexican Spanish (RGV) pack (41 cards, bundled audio)
bun run serve             # voice browser at localhost:3000 — push-to-talk, runs the daily regimen
#   or headless:
bun run cli daily         # shadowing → review → roleplay → reflect
```

A `voice` / `both` modality pack turns on shadowing + roleplay phases (text packs run only review → reflect). Per-card `native.mp3` is played in shadowing; roleplay drives free spoken turns via a card-less `converse` turn (no card required — wired in `agent`, `daily`, and the browser `serve`). Seeded audio is bundled, so seeding needs **no** ElevenLabs key; live TTS/STT in `serve` does. STT provider swap: `RECALLIT_STT=openai` + `OPENAI_API_KEY` uses `gpt-4o-transcribe` instead of ElevenLabs Scribe. Full voice internals: [03-operating-the-agent.md](03-operating-the-agent.md).

**Honest:** generated packs ship `modality:text` only — turning a generated pack into a voice pack means editing `manifest.json` modality + supplying scenarios/audio by hand (see [01](01-instantiate-multimodal-spanish.md)/[02](02-authoring-cards-and-scenarios.md)); pack generation does not do this for you. Grading is **lexical** (Levenshtein + Jaccard, diacritics/ñ/¿¡ normalized away) — great for comprehension, but valid paraphrases grade `Again`. Mining is morphology-blind.

## Recipe 7 — Bring your own pack + share it

```bash
# 1. Author by hand: packs/<id>/{manifest.json, cards.json, scenarios/*.md, assets/*.mp3}
#    (schema + fields: see 04-authoring-and-publishing-packs.md)

# 2. Gate it (no LLM) before sharing — stamps needs-review, lists reasons:
bun run cli pack write packs/my-pack
#   18/18 ready, 0 need review (grounding: source)

# 3. Install locally to verify:
bun run cli topic add packs/my-pack
bun run cli stats

# 4. Publish — consumers install from any of:
bun run cli topic add github:you/my-pack          # GitHub repo (optionally #ref)
bun run cli topic add git+https://example.com/p.git
bun run cli topic add npm:my-pack
bun run cli topic add ./my-pack-1.0.0.tgz         # tarball
```

`installPack` validates the manifest, enforces the `engine` semver range, materializes each card through `createCard` (builds the sqlite index — packs never ship it), and **skips `meta.status:"needs-review"` cards** (reported as `heldForReview`). Re-installing an existing id **errors unless `--force`** (force replaces, never duplicates). `--no-activate` installs without switching active topic; `--no-audio` skips bundled mp3s.

To later promote held cards: `pack review packs/<id>` to see what's flagged + why, fix the cards (or their `sourceQuote`), then re-run `pack write` and `topic add --force`.

---

## Reading the honesty verdict

Every `pack` / `pack edit` ends with `<ready>/<total> ready, <n> need review · grounding <source|web> · $<cost>` and lists flagged cards with reason codes:

| Reason code | Meaning |
|---|---|
| `missing-source-quote` | card has no `meta.sourceQuote` |
| `quote-not-in-corpus` | quote isn't a literal substring of the source corpus |
| `unverified-number` | a number in the answer isn't in the quote/context |
| `unverified-proper-noun` | a proper noun in the answer isn't grounded (errs toward review) |
| `duplicate-front` | exact-front duplicate of another card |
| `quality:<flag>` | `checkCardQuality` flag (empty / placeholder / front==back / over-long) |

**The gate is deterministic code, not prompt-faith** — but it verifies quote **presence (substring), NOT entailment**. A card can quote the source correctly and still draw a wrong conclusion from it. The number/proper-noun flags are mitigation, not a guarantee. Inspect anything held; nothing flagged installs by default.

Inspect without spending tokens: `bun run cli pack review packs/<id>`.

## The three modes at a glance

| Mode | CLI | Skill | Behavior |
|---|---|---|---|
| A one-shot | default (no flag) / `--auto` | "just do it" | auto-install **ready** cards (web-grounded still confirms) |
| B conversational | `--review` | default | preview ~samples, gate with `y/N/e` |
| C ambient | — | prose utterance | parses intent from natural language, echoes understanding |

`--dry-run` (any mode) writes the pack but never installs: `bun run cli topic add packs/<id>` later.