# Multimodal & Voice — Speak and Hear Your Packs

THE guide to the spoken side of recallit: what makes a pack *voice*, how the daily regimen runs over audio (in the browser and the CLI), the TTS/STT providers and their keys, and the honest limits. Worked example: the shipped Conversational Mexican Spanish (RGV) pack.

All commands run from repo root. Runtime: Bun. CLI invoked as `bun run cli <cmd>` (= `bun run src/cli.ts`).

For the deep tool-by-tool internals, see [03-operating-the-agent.md](03-operating-the-agent.md). For the full Spanish end-to-end, see [01-instantiate-multimodal-spanish.md](01-instantiate-multimodal-spanish.md). To *generate* a pack from a source, see [05-creating-packs.md](05-creating-packs.md) (note: generated packs ship `modality:text` only — voice is added by hand, see "Make any pack voice" below).

## 1. What makes a pack "voice"

A pack is voice when its `manifest.json` (→ installed `topic.json`) sets `modality`. The engine reads exactly one field to decide whether to run the spoken phases:

| Field | Where | Effect |
|---|---|---|
| `modality: "voice" \| "both"` | manifest / `topic.json` | Daily phases expand `[review, reflect]` → `[shadowing, review, roleplay, reflect]` (`context.ts:83-87`). `text` = no audio phases. |
| `meta.voiceId` | manifest `meta` | TTS voice for the topic. Resolved once per connection (`server.ts:225`); plays without the `ELEVENLABS_VOICE_ID` env. |
| `meta.language` | manifest `meta` | Sent to STT so it doesn't auto-detect (`server.ts:147`, e.g. `"es"`). |
| per-card `native.mp3` | `assets/*.mp3` → `data/topics/<id>/cards/<cardId>/native.mp3` | Played in **shadowing**; served via `GET /media/...`; regenerated when a card's `front` is edited (`regenerateCardAudio`, `server.ts:237`). |

Reference manifest (`packs/spanish-mx-rgv/manifest.json`):

```json
{
  "schemaVersion": 1, "engine": ">=0.1.0",
  "id": "spanish-mx-rgv", "name": "Conversational Mexican Spanish (RGV)",
  "modality": "voice",
  "goalMetric": "minutes_spoken",
  "meta": { "language": "es", "voiceId": "ewn5JTa3lNPY8QVuZJi6", "dialect": "mx-rgv" }
}
```

Notes:
- `modality` alone gates the phases. `meta.voiceId`/`meta.language` only tune *which* voice/language — a `voice` pack with no `voiceId` falls back to the default ElevenLabs voice (George `JBFqnCBsd6RMkjVDRZzb`).
- Audio is optional per card. If a card has no `native.mp3`, shadowing falls back to live TTS (needs `ELEVENLABS_API_KEY`). Bundled mp3s mean shadowing works with **no** key.

## 2. The worked example — install the Spanish pack

```bash
bun run seed:spanish                          # == bun run cli topic add packs/spanish-mx-rgv
# installs topic + 41 cards + bundled native mp3s + 8 scenarios, sets active
```

Verify:

```bash
bun run cli stats --topic spanish-mx-rgv                 # total cards, due now
ls data/topics/spanish-mx-rgv/cards/*/native.mp3 | wc -l # expect 41
```

Because audio ships in the pack, install + shadowing + review need **no ElevenLabs key**. You only need `ELEVENLABS_API_KEY` for: live STT (your spoken answers), roleplay TTS, and any card without a bundled mp3.

## 3. Run it — browser (`serve`)

```bash
bun run serve     # http://localhost:3000  (PORT to override)
```

The browser client is push-to-talk (hold the button or Space → records `audio/webm` → STT → engine → TTS reply). `serve`'s default `run` is `mode:"daily"` — it runs the **full daily regimen**, not a bare review loop.

Daily phases (voice/`both` modality):

| Phase | What happens |
|---|---|
| **shadowing** | Agent presents 3-5 cards; plays each card's `native.mp3` (or live TTS); you repeat aloud. |
| **review** | Gated SR loop. Agent speaks the front, you answer aloud, STT → engine grades (lexical), FSRS schedules. |
| **roleplay** | Agent picks a scenario (`scenarios/*.md`), holds a short conversation forcing you to PRODUCE, corrects (recast → explicit → metalinguistic), mines new items. Driven by the **`converse`** turn (free conversation, no card, no grading) — `server.ts:239` wires `makeConverseProvider`. |
| **reflect** | Agent appends notes via `update_context`, reports `get_progress`. |

Checkpointed: each completed phase is recorded; a killed session resumes the same day from the last completed phase. One active session per topic per day.

## 4. Run it — CLI (`daily`)

The full regimen over the terminal (you type instead of speak; same phases, same `converse` roleplay turn):

```bash
bun run cli daily [--topic spanish-mx-rgv] [--model m]
```

Also available:

```bash
bun run cli agent [--topic id] [--model m] [--maxTurns n]   # interactive review loop only
```

Defaults: model `claude-sonnet-4-6`, `maxTurns 60`, `maxBudgetUsd 1`. Both `agent` and `daily` wire `session.converseProvider` (`cli.ts:398,426`), so the roleplay phase reads/writes free-conversation turns over the terminal.

For a **text** pack, daily is just `review → reflect` — no shadowing/roleplay. See [06-using-packs.md](06-using-packs.md) for the topic-agnostic run loop.

## 5. Providers + env

One ElevenLabs key powers both TTS and STT (Scribe). Selection branch: `server.ts:261-266`.

| Var | Required | Enables |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | The agent loop (`daily`/`agent`/`serve`). |
| `ELEVENLABS_API_KEY` | yes for live voice | TTS (`speak`) **and** Scribe STT (`transcribe`) — one key, both. Throws if unset when needed. |
| `ELEVENLABS_VOICE_ID` | no | Override the topic's `meta.voiceId`. Falls back to George if neither set. |
| `RECALLIT_STT=openai` | no | Switch STT to OpenAI `gpt-4o-transcribe`. Default = ElevenLabs Scribe. |
| `OPENAI_API_KEY` | only if `RECALLIT_STT=openai` | OpenAI STT auth. |
| `RECALLIT_TZ` | no | Local-day boundary for streaks (e.g. `America/Chicago`). UTC if unset. |
| `RECALLIT_DATA_DIR` | no | Data root. Default `<cwd>/data`. |
| `PORT` | no | Voice server port. Default `3000`. |

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export ELEVENLABS_API_KEY=...
# optional:
export RECALLIT_STT=openai && export OPENAI_API_KEY=sk-...
export ELEVENLABS_VOICE_ID=ewn5JTa3lNPY8QVuZJi6
```

Provider interfaces (`src/voice/types.ts`): `transcribe(Uint8Array,{mime,language})→string`, `speak(text,{voiceId})→Uint8Array`. Add one by implementing the interface and injecting into `startServer({stt,tts})`; the loop is offline-testable with `voice/mock.ts`.

## 6. Make any pack voice

Pack generation ([05](05-creating-packs.md)) ships `modality:text` only — there is no automated text→voice bridge. To turn a generated/authored pack into a voice pack, by hand:

1. Set `modality: "voice"` (or `"both"`) in `manifest.json` → turns on shadowing + roleplay.
2. (Optional) set `meta.voiceId` + `meta.language` for a per-topic voice/STT language.
3. (Optional) add `scenarios/*.md` for the roleplay phase to draw from.
4. Audio is optional: omit `assets/*.mp3` and shadowing uses live TTS (needs `ELEVENLABS_API_KEY`), or pre-bake mp3s into `assets/` to make shadowing key-free.
5. Reinstall: `bun run cli topic add packs/<id> --force`.

See [04-authoring-and-publishing-packs.md](04-authoring-and-publishing-packs.md) for the manifest/scenario schema and [02-authoring-cards-and-scenarios.md](02-authoring-cards-and-scenarios.md) for the card + scenario + i+1 format.

## Gotchas (honest limits)

- **Live voice needs `ELEVENLABS_API_KEY`.** Without it: install, shadowing of *bundled* mp3s, and the typed CLI loop work; STT, roleplay TTS, and any card without bundled audio do not.
- **Grading is lexical**, not semantic (`evaluate.ts`): Levenshtein + Jaccard with diacritics/ñ/¿¡ normalized away. Fine for comprehension, but a valid paraphrase grades `Again`.
- **STT language matters.** It uses `meta.language` so a voice pack should set it; otherwise STT auto-detects and may mis-transcribe.
- **Mining is morphology-blind** (`mining.ts`): inflections/conjugations count as distinct tokens, so a known lemma in a new surface form can wrongly trip the one-new-thing rule.
- **`update_card` (agent) exposes only front/back/context** — tags/type/meta are set in the pack, not via the agent. Editing a card's `front` triggers `native.mp3` regeneration (needs TTS).
- **Generated packs are text-only** — voice is a manual manifest edit (see section 6).
- **Resolved (was a known gap):** roleplay free-conversation now uses a card-less `converse` turn, wired end-to-end — engine (`agent.ts:157`), CLI (`cli.ts:398,426`), and browser/server (`server.ts:239`). Earlier guide drafts flagged this as missing; it has shipped.
