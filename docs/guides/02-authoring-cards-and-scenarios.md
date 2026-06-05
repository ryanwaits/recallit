# Authoring Cards, Scenarios & the i+1 Pack

Authoring guide for the `spanish-mx-rgv` instance. Cards + scenarios are plain files; engine is topic-blind. Domain lives in data.

> **Two layers.** The *durable, shareable* authoring form is the **pack** (`packs/spanish-mx-rgv/cards.json` + `scenarios/` + `assets/`) — see [04-authoring-and-publishing-packs.md](04-authoring-and-publishing-packs.md). This guide describes the *runtime* form: how cards live on disk under `data/` once installed, which is what the engine + agent read/write during sessions.

Data root: `RECALLIT_DATA_DIR` (default `<cwd>/data`). Installed topic dir: `data/topics/spanish-mx-rgv/`.

```
data/topics/spanish-mx-rgv/
  topic.json
  index.sqlite          # derived, rebuildable (db.ts)
  cards/<uuid>/item.md  # source of truth
  cards/<uuid>/native.mp3
  scenarios/<id>.md
```

## Card `item.md` anatomy

Gray-matter YAML frontmatter + optional markdown body (`card.notes`). Parser is tolerant: missing `fsrs` → `createEmptyCard()`, missing `type` → `basic` (`card.ts:26,64`).

| field | engine role | notes |
|---|---|---|
| `id` | card id, = dir name | `crypto.randomUUID()` (`card.ts:79`) |
| `type` | free-form domain tag | `vocab` \| `sentence` here |
| `front` | shown in review (prompt) | target Spanish |
| `back` | answer, graded against | English gloss — NEVER leaked by `get_due_cards`/`present_card` |
| `context` | optional, shown with front | example sentence |
| `tags[]` | searchable; mining sets `mined`/`needs-review` | |
| `media` | relative path in card dir | `native.mp3` (shadowing audio) |
| `meta` | free-form, untyped by engine | `{dialect: mx-rgv}` |
| `fsrs{}` | engine-owned FSRS state | do NOT hand-edit; written by `grade_card` |
| body (after `---`) | `card.notes` | usage notes, mnemonics |

Real vocab card (`cards/d9219b18-.../item.md`):

```markdown
---
id: d9219b18-f0c0-46ad-bfd5-f56976106023
type: vocab
front: el mandado
back: the grocery run / errand
tags:
  - rgv
  - noun
fsrs:
  due: '2026-05-26T17:00:50.212Z'
  stability: 0
  difficulty: 0
  elapsed_days: 0
  scheduled_days: 0
  learning_steps: 0
  reps: 0
  lapses: 0
  state: 0
  last_review: null
context: Voy a hacer el mandado.
media: native.mp3
meta:
  dialect: mx-rgv
---
```

Sentence card template (no `context`):

```markdown
---
id: <uuid>
type: sentence
front: Tengo hambre.
back: I'm hungry.
tags:
  - food
media: native.mp3
meta:
  dialect: mx-rgv
---
```

Authoring routes:
- **Pack (canonical):** add entries to `packs/<id>/cards.json` (array of `NewCardInput` + optional `audio`), then `topic add <pack> --force`. `installPack` mints ids, copies audio, sets `media`. See guide 04.
- Agent (in-session): `create_card {front, back, type?, context?, tags?}` (`agent.ts`) — no `meta`/`media` param.
- Agent edit: `update_card {card_id, front?, back?, context?}` (`agent.ts`) — cannot set `tags`/`type`/`meta`/`media`; on a `front` change the server regenerates `native.mp3`.

Writes go through `store.ts` (`writeCardFile → upsertIndex`); never edit `index.sqlite`.

## i+1 (one-new-thing) rule

A mined card introduces **exactly one** new normalized-word token vs. known cards. Enforced in code (`mineCard`, `mining.ts:40-93`), not prose.

`mine_card {content, new_element, back?, type?}` (`agent.ts:236-263`) rejects (`MiningError`) when:
- `new_element` absent from `content`
- >1 unknown token beyond `new_element` (extraUnknown)
- duplicate front (normalized)
- `new_element` already known

On pass: card tagged `mined` (+`needs-review` if quality flags). Returns `{id, qualityFlags}`.

Token = normalized word (lowercased, diacritics stripped). To bias new cards toward i+1 RGV sentences:
- pick `content` = a natural RGV sentence where every word is already a card except one
- set `new_element` to that single new word
- keep `recallStyle` aligned: `"Speak answers aloud; i+1 sentences; mine new words from conversation."` (already in `topic.json`)

Example (known: `voy`, `a`, `hacer`, `el` from existing cards; new: `mandado`):

```
mine_card {
  content: "Voy a hacer el mandado.",
  new_element: "mandado",
  back: "I'm going to do the grocery run.",
  type: "sentence"
}
```

## Scenario `*.md` format

Drop a file in `scenarios/<id>.md` — no schema, no index, discovered by directory listing. Surfaced to agent via `list_scenarios` (basenames) and `read_scenario {id}` (raw text) (`agent.ts:275-296`).

Shape (same in `packs/<id>/scenarios/*.md`, copied verbatim on install):

```markdown
---
id: morning-at-home
title: Morning at home
---

## Setting
It's morning in the kitchen before work.

## Your role
Play the learner's partner (wife). Speak natural Mexican/RGV Spanish.

## Objective
Greet, ask how they slept, and agree on a plan for the day.

## Target vocab
- ¿Cómo amaneciste?
- ¿Qué hacemos hoy?
- ya me voy al trabajo
```

8 seeded scenarios: `morning-at-home`, `cooking-dinner`, `grocery-run`, `about-the-kids`, `weekend-plans`, `catching-up`, `chores-negotiation`, `affection`.

How the agent uses it: reads scenario text as tool output → drives PRODUCE-focused roleplay → applies tiered correction on learner errors:

| tier | when |
|---|---|
| Recast | first error — restate correctly, no flag |
| Explicit | repeat error — name the correction |
| Metalinguistic | persists — explain the rule |

Correction ladder is **prose-only** (`PHASE_GUIDE`/daily prompt) — no code enforcement. Reachable only in `mode:'daily'` with `modality:'voice'` (phases `[shadowing, review, roleplay, reflect]`). (Note: `buildPracticePrompt`'s standalone roleplay path is dead code — never invoked.)

## needs-review quality flag

Advisory heuristics (`checkCardQuality`, `quality.ts:13-27`). Flags: missing `front`/`back`, `front==back`, placeholder text (`todo`/`tbd`/`xxx`/`fixme`/`???`), `back` >240 chars. Non-fatal.

`mineCard` applies these → adds `needs-review` tag + `qualityFlags` to `meta` (`mining.ts:79-81`). Only mining auto-flags; `create_card` has no quality gate. Audit flagged cards by `search_cards {query: "needs-review"}` and fix/delete.

## Gotchas

**Still true:**
- **Grader is lexical** (`evaluate.ts`): strips diacritics + lowercases, so `sí/si`, `papá/papa`, `ñ/n`, `¿/¡` all collapse → wrong-accent grades Good; valid paraphrases grade Again. No semantic match. (Acceptable for the comprehension review loop.)
- **i+1 is morphology-blind**: token = exact normalized word. Spanish conjugations/inflections (`hago` vs `hacer`, clitics `dámelo`) count as new tokens → can wrongly reject legit i+1 cards or pass dupes. No lemmatization.
- **`meta`/`media` not settable via the agent's `create_card`/`update_card`** — set them in the pack's `cards.json` (`meta`, `audio`) or hand-edit `item.md` + `rebuildIndex`.
- **Roleplay voice input is card-bound** — the browser runs the full daily regimen, but `await_user_response` needs a `card_id`, so free-conversation roleplay has no clean spoken-turn primitive (known follow-up: a card-less `converse` turn).

**Fixed since first draft:**
- ✅ `voiceId` is wired (server reads `meta.voiceId`); ✅ `native.mp3` is served (`/media`) + played in shadowing; ✅ `context.md` is per-topic.
- ✅ **Re-install is `topic add --force`** (wipes + replaces) — no more front-text dedupe / duplicate-on-edit; the deleted `seed-spanish.ts` is gone.
