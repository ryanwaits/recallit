# recallit

Learn & remember **anything**. An agent-native, **topic-agnostic** spaced-repetition recall engine.

The engine knows nothing about any subject. A topic is a plug-in: config + cards + (later) practice prompts, all data, no code. Spanish-conversation practice is the first instance, not a special case.

- **Scheduling:** FSRS-6 via [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs)
- **Storage:** files are the source of truth (`item.md` w/ frontmatter); a derived `bun:sqlite` index makes due-queries O(due)
- **Grading:** deterministic rubric (`evaluateAnswer`) — code decides the rating, not the agent, so FSRS stays consistent
- **Stack:** Bun + TypeScript

## Layout

```
src/
  types.ts      generic domain types (no topic specifics)
  paths.ts      data-dir layout
  card.ts       item.md <-> RecallCard (+ FSRS) serialization
  scheduler.ts  ts-fsrs wrapper: gradeCard, previewSchedule (pure)
  evaluate.ts   deterministic answer grader
  db.ts         derived sqlite index: due-queries + rebuild
  topic.ts      topic CRUD + active-topic selection
  store.ts      card CRUD + reviewCard (file + index + log, consistent)
  pack.ts       topic-pack spec: manifest/card schemas + loadPack
  install.ts    installPack: validate + materialize a pack into ./data
  resolve.ts    resolve `topic add` source (dir/tarball/git/npm) to a pack dir
  server.ts     Bun HTTP+WS voice host
  index.ts      public API barrel (also the engine's importable package surface)
  cli.ts        headless CLI harness
```

Data lives under `./data` (override with `RECALLIT_DATA_DIR`). Subjects ship as **packs** under `packs/<id>/`; install with `topic add` (see ARCHITECTURE.md → *Topic packs*).

## Develop

```bash
bun install
bun test            # unit + integration
bun run typecheck   # tsc --noEmit
bun run lint        # biome
```

## CLI demo

```bash
export RECALLIT_DATA_DIR=./data
bun run cli topic create capitals --name "World Capitals" --goal cards_recalled
bun run cli card add --front "France" --back "Paris"
bun run cli due
bun run cli answer <cardId> "Paris"    # evaluate spoken/typed answer -> auto-grade -> reschedule
bun run cli preview <cardId>           # next interval per rating
bun run cli stats
```

## Agent review loop (Claude Agent SDK)

The engine primitives are exposed to a Claude agent as in-process MCP tools. The
agent drives the review turn-by-turn; the turn machine (`turn.ts`) enforces
"respond before reveal" and the rating is always engine-computed (`evaluate.ts`),
so the agent never fudges scheduling.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export RECALLIT_DATA_DIR=./data
bun run cli agent                      # interactive: agent presents, you answer, it grades + reschedules
```

Live integration test (opt-in; needs a key, makes real calls):

```bash
RECALLIT_LIVE_TEST=1 ANTHROPIC_API_KEY=sk-ant-... bun test test/agent.live.test.ts
```

## Voice mode (browser)

A Bun HTTP+WS server hosts a voice review session: the browser records push-to-talk
audio, the server transcribes it (STT), stores the attempt next to the card, and feeds
the transcript into the same turn machine; the agent's prompts are spoken back (TTS).

```bash
export ANTHROPIC_API_KEY=sk-ant-...      # agent loop
export ELEVENLABS_API_KEY=...            # TTS + STT (Scribe) — covers voice on its own
export ELEVENLABS_VOICE_ID=...           # optional; per-topic voice
bun run serve                            # http://localhost:3000
```

By default both TTS and STT use ElevenLabs (Scribe). To use OpenAI `gpt-4o-transcribe`
for STT instead, set `RECALLIT_STT=openai` and provide `OPENAI_API_KEY` (needs credits).
STT/TTS sit behind `SttProvider`/`TtsProvider` interfaces (`src/voice/`), so providers
are swappable and the WS/turn wiring is tested offline with mocks. Optional live
round-trip: `RECALLIT_LIVE_TEST=1 bun test test/voice.live.test.ts`.

## Mining & correction

During practice the agent captures new items as cards via `mine_card` (`src/mining.ts`),
which enforces the **one-new-thing (i+1) rule** in code: a mined card must introduce
exactly one new element vs the learner's known set — more-than-one-new and duplicates
are rejected. `checkCardQuality` (`src/quality.ts`) flags low-confidence cards
("needs-review") so confidently-wrong content doesn't silently enter the schedule.
`buildPracticePrompt` adds tiered correction guidance (recast → explicit → metalinguistic).

## Spanish pack (the first plug-in instance)

The Spanish topic ships as a portable **pack** (data, not engine code) under
`packs/spanish-mx-rgv/` — a `manifest.json` + `cards.json` (41 cards biased toward
i+1 sentences with RGV vocab) + 8 wife-conversation `scenarios/` + bundled
`assets/*.mp3` native audio. Install it into your data dir with `topic add`:

```bash
bun run src/cli.ts topic add packs/spanish-mx-rgv      # install (materializes cards + audio)
bun run seed:spanish                                   # same thing, with --force (re-seed)
bun run src/cli.ts topic add packs/spanish-mx-rgv --no-audio   # skip bundled audio
```

A pack is the durable, versioned unit of a subject (see ARCHITECTURE.md → *Topic
packs*); `installPack` (`src/install.ts`) validates the manifest, checks the engine
range, and projects it into `data/topics/<id>/` through the engine primitives.

## Daily session, habit & progress

`bun run cli daily` runs the full multi-phase regimen as one autonomous agent loop —
the orchestration is just a prompt (`buildDailySessionPrompt`) over the existing
primitives, parameterized by the topic's modality (voice topics add shadowing +
roleplay; text topics run review + reflect). Each phase is checkpointed
(`src/checkpoint.ts`) under a stable per-day session id, so a killed session resumes
from the last completed phase. Habit state (streak, longest, danger-zone) lives in
`progress.json`; the browser client shows due / done-today / streak / goal-metric and
warns when a streak is at risk (`GET /api/progress`).
