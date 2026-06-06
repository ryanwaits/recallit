# recallit guides

Detailed, copy-pasteable use-case guides for **recallit** — an agent-native, topic-agnostic spaced-repetition engine (Bun + TS). All commands run from repo root via `bun run cli <cmd>` unless noted.

Engine knows no topic; topics are data packs you **create**, **install**, and **drill** (text or voice). Pick a guide by where you are in the journey.

## Get started

| Guide | What it covers |
|---|---|
| [01 — Instantiate a Multimodal Spanish Instance](01-instantiate-multimodal-spanish.md) | End-to-end: stand up the reference voice Spanish (RGV) instance — install, verify, env, `serve`. The fastest "see it working" path. |

## Create packs

| Guide | What it covers |
|---|---|
| [05 — Creating Packs (Every Way)](05-creating-packs.md) | `pack <source>` generation from a file/PDF, URL, repo, or bare concept; the two doors (CLI + `/recallit-pack` skill); modes A/B/C; cost + `ANTHROPIC_API_KEY`; reading the honesty verdict. |
| [06 — Using a Pack §9 (editing)](06-using-packs.md#editing) | `pack edit <id> "<instruction>"` — additive merge (FSRS preserved) vs change/remove (force rebuild resets schedule). |
| [04 — Authoring & Publishing Topic Packs](04-authoring-and-publishing-packs.md) | Hand-authoring the pack format by hand (`manifest.json`, `cards.json`, scenarios, assets) and publishing. The schema source of truth that 05/06 link to. |

## Use packs

| Guide | What it covers |
|---|---|
| [06 — Using a Pack](06-using-packs.md) | Topic-agnostic install → `stats` → `due` → `daily`/`agent` loop for any pack. `heldForReview` on install, promoting needs-review cards, card CRUD. |
| [03 — Operating the Agent](03-operating-the-agent.md) | Day-to-day driving of a live instance: review loop, daily phases, checkpoint/resume, the full tool surface. Deepest operating reference. |

## Multimodal & voice

| Guide | What it covers |
|---|---|
| [07 — Multimodal & Voice](07-multimodal-voice.md) | Turn any `modality: voice`/`both` pack into a spoken drill: `serve` push-to-talk, `native.mp3` lifecycle, scenarios, STT/TTS provider swap, `ELEVENLABS_*` env. |
| [02 — Authoring Cards, Scenarios & i+1](02-authoring-cards-and-scenarios.md) | Card `item.md` format, scenario format, i+1 sequencing, `needs-review` flag. The card/scenario reference the other guides link to. |

## Recipes

| Guide | What it covers |
|---|---|
| [08 — Recipes (End-to-End)](08-recipes.md) | Full copy-paste flows: PDF → drill, repo → study deck, concept → pack, voice pack from scratch, incremental `pack edit`. Stitches 05/06/07 together. |

## Deeper references

| Doc | What it covers |
|---|---|
| [design/pack-generation.md](../design/pack-generation.md) | The *why* behind `pack`: north-star verb, honesty gate, source adapters, modes A/B/C, build-phase status. Rationale, not how-to. |
| [../../ARCHITECTURE.md](../../ARCHITECTURE.md) | Engine internals: FSRS scheduler, sqlite index, pack loader/installer, turn/agent providers. |
| [../../README.md](../../README.md) | Project overview + the CLI command demo. |

## Honest limits (true across every guide)

- **Pack generation costs real money** — needs `ANTHROPIC_API_KEY`, ~$0.1–0.4 per pack; `--max-budget <n>` caps it (default cap $1).
- **The honesty gate verifies quote *presence* (substring), not entailment** — a grounded card can still misread its source.
- **Grading is lexical** (diacritics/accents normalized) — fine for comprehension, but valid paraphrases grade `Again`.
- **Non-additive `pack edit` resets FSRS** review history (explicit confirm).
- **Voice needs `ELEVENLABS_API_KEY`**; concept (`grounding=web`) packs are attribution-only, not authoritative.
- **`--style qa|term|cloze|mixed` is an advisory hint** passed verbatim to the model, not an enforced enum.

> Invocation note: these guides use `bun run cli <cmd>`. The package.json `cli` script = `bun run src/cli.ts`, so older guides showing `bun run src/cli.ts <cmd>` are equivalent.