# Instantiate a Multimodal Spanish Instance (end-to-end)

Stand up a fresh voice Mexican-Spanish (RGV) instance, or reproduce/extend the shipped `spanish-mx-rgv` pack. All commands run from repo root. Runtime: Bun.

## 1. Prereqs & env vars

| Var | Required | Enables |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Claude Agent SDK `query()` loop (`bun run cli agent`/`daily`) |
| `ELEVENLABS_API_KEY` | yes (for voice) | One key powers both TTS (`speak`) + Scribe STT (`transcribe`). `src/voice/elevenlabs-tts.ts:9`, `elevenlabs-stt.ts:6` |
| `ELEVENLABS_VOICE_ID` | no (optional override) | The instance's `meta.voiceId` is now wired through the server per connection, so the RGV voice plays **without** this env. Set it only to override. `server.ts` (open → `speak({voiceId})`) |
| `RECALLIT_DATA_DIR` | no | Data root. Defaults `<cwd>/data`. Holds `topics/spanish-mx-rgv/`. `paths.ts:6` |
| `RECALLIT_STT=openai` | no | Switch STT to `gpt-4o-transcribe`. Default = ElevenLabs Scribe. `server.ts:153` |
| `OPENAI_API_KEY` | only if `RECALLIT_STT=openai` | OpenAI STT auth. `openai-stt.ts:19` |
| `PORT` | no | Voice server port. Default `3000`. `server.ts:156` |

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export ELEVENLABS_API_KEY=...
export ELEVENLABS_VOICE_ID=ewn5JTa3lNPY8QVuZJi6   # RGV Mexican voice
```

## 2. Create the topic (`topic.json`)

Path: `$RECALLIT_DATA_DIR/topics/<id>/topic.json` (dir name MUST equal `id`). Literal config from the shipped pack:

```json
{
  "id": "spanish-mx-rgv",
  "name": "Conversational Mexican Spanish (RGV)",
  "modality": "voice",
  "recallStyle": "Speak answers aloud; i+1 sentences; mine new words from conversation.",
  "goalMetric": "minutes_spoken",
  "meta": {
    "dialect": "mx-rgv",
    "register": "norteño/fronterizo",
    "language": "es",
    "codeSwitch": "tolerate RGV Spanglish in comprehension; model standard Mexican forms in production",
    "voiceId": "ewn5JTa3lNPY8QVuZJi6"
  }
}
```

Field effects:
- `modality:"voice"` → daily phases expand `[review,reflect]` → `[shadowing,review,roleplay,reflect]`. `context.ts:83-87`
- `goalMetric:"minutes_spoken"` → north-star label in prompts + `get_progress` (label only; no code computes minutes). `progress.ts:81`, `agent.ts:387`
- `meta` → JSON-dumped verbatim into system prompt as "domain config" (engine never types it). `context.ts:41`
- CLI `topic create` hardcodes `meta:{}` — write `topic.json` by hand (or `updateTopicConfig`) to set `meta`/`recallStyle`.

Then set active (`data/user.json`):
```bash
bun run cli topic use spanish-mx-rgv   # or seed:spanish sets it automatically
```

## 3. Install the pack (one command)

The Spanish instance ships as a portable **pack** at `packs/spanish-mx-rgv/` (manifest + `cards.json` + `scenarios/` + bundled `assets/*.mp3`). Installing materializes the topic, 41 cards, native audio, and 8 scenarios into `RECALLIT_DATA_DIR` and sets it active — **no ElevenLabs key needed** (audio is bundled):

```bash
bun run src/cli.ts topic add packs/spanish-mx-rgv          # install (== bun run seed:spanish)
bun run src/cli.ts topic add packs/spanish-mx-rgv --no-audio   # skip bundled mp3s
bun run src/cli.ts topic add packs/spanish-mx-rgv --force        # overwrite an existing install
```

Remote sources work too: `topic add github:you/repo[#ref]`, `git+<url>`, `npm:<spec>`, or `<pack>.tgz`. `installPack` (`src/install.ts`) validates the manifest, checks the `engine` semver range, and writes each card through `createCard` so the sqlite index is built (packs never ship the index). Re-installing the same id **errors unless `--force`** (force replaces, never duplicates).

Step 2's `topic.json` is written for you by the install. To author your **own** pack from scratch, see [04-authoring-and-publishing-packs.md](04-authoring-and-publishing-packs.md); for the on-disk card format, see [02-authoring-cards-and-scenarios.md](02-authoring-cards-and-scenarios.md).

## 4. Native audio

Bundled in the pack (`packs/spanish-mx-rgv/assets/*.mp3`) and copied to `data/topics/spanish-mx-rgv/cards/<cardId>/native.mp3` on install (`cardAttemptFile`), with `media` set on each card. If you edit a card's `front` via the agent's `update_card`, the server regenerates that card's `native.mp3` so audio never drifts (`regenerateCardAudio`, `server.ts`). Shadowing plays the stored recording, falling back to live TTS only when a card has none.

## 5. Run it

| Command | What it gives you |
|---|---|
| `bun run serve` | Voice server on `:3000`. `/` push-to-talk browser client, `/ws` mic→STT→turn→TTS, `/api/progress`. Hold button/Space to record `audio/webm`. |
| `bun run cli daily [--topic spanish-mx-rgv] [--model m]` | Full multi-phase regimen: shadowing → review → roleplay → reflect. Resumes mid-day from last completed phase (checkpoint). |
| `bun run cli agent [--topic id] [--model m] [--maxTurns n]` | Interactive review loop: agent presents card, CLI reads your typed answer, engine grades, schedules. |

Defaults: model `claude-sonnet-4-6`, `maxTurns 60`, `maxBudgetUsd 1`. Raise `--maxTurns` for longer spoken sessions.

## 6. Verify

```bash
bun run cli due --topic spanish-mx-rgv     # lists due card fronts (never backs)
bun run cli stats --topic spanish-mx-rgv   # totalCards, dueNow, reviewedToday, streak
ls data/topics/spanish-mx-rgv/cards/*/native.mp3 | wc -l   # expect 41 if audio seeded
```
- Spoken turn: `bun run serve`, open `http://localhost:3000`, hold to speak → caption shows transcript, agent replies with synthesized audio.
- Progress: `/api/progress` (server) or `get_progress` in an agent session → `{goalMetric:"minutes_spoken", dueNow, reviewedToday, streak, dangerZone}`.

## Gotchas

**Fixed since these guides were first drafted** (multimodal wiring sprints — no longer issues):
- ✅ **voiceId is wired** — the server reads `topic.json meta.voiceId` per connection; the RGV voice plays without `ELEVENLABS_VOICE_ID`.
- ✅ **STT language is sent** — `meta.language` (`"es"`) is passed to `transcribe`, not left to auto-detect.
- ✅ **native.mp3 is served + played** — `GET /media/:topic/:card/:file` route; shadowing plays the stored recording (TTS fallback only if absent).
- ✅ **STT failure retries once** — a transcribe error re-prompts (single re-listen) instead of silently grading `Again`.
- ✅ **`context.md` is per-topic** — `contextFile(topicId)`; notes no longer bleed across topics.
- ✅ **Streak honors local time** — set `RECALLIT_TZ=America/Chicago` for RGV; day boundaries match the wall clock (UTC if unset).

**Still true:**
- **Roleplay turns aren't graded.** The browser runs the full daily regimen (shadowing→review→roleplay→reflect — `serve`'s default `run` is `mode:"daily"`). Roleplay collects free-conversation spoken turns via the card-less **`converse`** tool (shipped — wired in `cli.ts`/`server.ts`); but those turns are production practice, not scheduled review (they don't grade or touch FSRS).
- **Grading is lexical** (Levenshtein + Jaccard; diacritics/ñ/¿¡ normalized away) — fine for the comprehension review loop, but valid paraphrases grade `Again`. Semantic match is deferred (`evaluate.ts`).
- **Mining is morphology-blind** — Spanish conjugations/inflections count as distinct tokens, so a known lemma in a new surface form can wrongly fail the 1-new-thing rule (`mining.ts`).
