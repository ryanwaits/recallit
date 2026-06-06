# Operating the Agent (review, daily, roleplay, voice)

How to drive a live multimodal Spanish instance (`spanish-mx-rgv`) day-to-day, and extend it. Builder-oriented. Exact files/env vars below are verified against the codebase.

## 1. Tool surface (the primitives)

18 in-process MCP tools (`src/agent.ts:91-319`), allowlisted by `TOOL_NAMES` (`src/agent.ts:326-345`), driven by the Agent SDK `query()` loop (`src/agent.ts:406-431`). Subject-blind — every tool is a thin wrapper over the same atomic function `src/index.ts` exports. Pedagogy = prompts; invariants = wrapped code.

| Tool | File | Use |
|---|---|---|
| `get_due_cards` | `agent.ts:95` | due `{id,front,context}` — never `back` |
| `present_card` | `agent.ts:105` | front only; phase→`presented` |
| `await_user_response` | `agent.ts:118` | **the multimodal seam**; calls `answerProvider`; null→`{ended:true}` |
| `reveal_answer` | `agent.ts:138` | back + `EvalResult{rating,score,reasons}`; gated on a recorded response |
| `grade_card` | `agent.ts:151` | FSRS grade w/ engine-computed rating; persists `item.md` + `review_log.jsonl` |
| `get_progress` | `agent.ts:164` | `{goalMetric,dueNow,reviewedToday,streak,longestStreak,dangerZone}` |
| `read_context` / `update_context` | `agent.ts:168` / `:265` | read/append GLOBAL `context.md` (see Gotchas) |
| `read_card` / `create_card` / `update_card` / `delete_card` / `search_cards` | `agent.ts:173-234` | card CRUD |
| `mine_card` | `agent.ts:236` | i+1 generative; 1-new-thing rule enforced (`mining.ts:40-93`) |
| `list_scenarios` / `read_scenario` | `agent.ts:275` / `:284` | roleplay content from `topics/<id>/scenarios/*.md` |
| `complete_phase` / `complete_session` | `agent.ts:298` / `:308` | daily checkpoint / end session |

**Review loop** (gated state machine, `turn.ts:20-72`):
```
get_due_cards → present_card → await_user_response → reveal_answer → grade_card
```
Cannot reveal/grade before a response is recorded. Agent never picks the rating — `evaluateAnswer` (`evaluate.ts:74-114`) computes it: exact→Easy, normalized-equal→Good, sim≥0.7→Hard, else Again.

**Features = prompts over this set.** `src/context.ts`: `buildSystemPrompt` (review), `buildDailySessionPrompt` (daily). Same tools, different prose. `buildPracticePrompt` exists (`context.ts:133`) but is **dead code** — no caller.

## 2. Daily session phases

`mode:'daily'` (`RunOptions.mode`, `agent.ts:353`). Phases selected purely by `modality` (`dailyPhases`, `context.ts:83-87`):

| modality | phases |
|---|---|
| `text` | review → reflect |
| `voice` / `both` | **shadowing → review → roleplay → reflect** |

Spanish is `modality:"voice"` → full 4-phase regimen. Phase prose: `PHASE_GUIDE` (`context.ts:89-98`):
- **shadowing** — present 3-5 cards; learner hears audio + repeats via `await_user_response`.
- **review** — gated SR loop.
- **roleplay** — `list_scenarios`/`read_scenario`, force PRODUCE, tiered correction (recast→explicit→metalinguistic), `mine_card`.
- **reflect** — `update_context` notes + `get_progress`.

**Checkpoint/resume** (`checkpoint.ts:30-58`): each `complete_phase(phase)` appends to checkpoint; on resume `runSession` computes `remainingPhases` (`agent.ts:394-396`) and skips done phases. `complete_session` clears checkpoint (`agent.ts:435`). One active session per topic per day.

## 3. Spoken-turn data flow

Voice server: `src/server.ts` (Bun HTTP+WS). Client: `public/index.html` (push-to-talk, Space/button).

```
mic (MediaRecorder, audio/webm)
  → WS {type:'audio',cardId,mime,dataBase64}        index.html:115
  → handleMessage: persist user-<ts>.webm           server.ts:75-76
  → stt.transcribe(bytes,{mime,language})           server.ts:79
  → resolve pending await_user_response w/ transcript server.ts:85
  → engine grades transcript TEXT (lexical)         evaluate.ts
  → agent next prompt → tts.speak(front)            server.ts:41
  → WS {type:'say',audioBase64} → client plays mp3
```

The agent→WS bridge is `makeAnswerProvider` (`server.ts`): for a card with bundled audio it sends a `say` carrying a `mediaUrl` (the stored `native.mp3` via `/media`); otherwise it synthesizes `speak(front, {voiceId})` in the topic's voice (TTS failure degrades to text-only `say`). Then `listen` → awaits the client msg. The injected `AnswerProvider` (`agent.ts`, signature `(cardId, front, context?, media?) => Promise<string|null>`) is the only learner-input channel — audio is flattened to one transcript string. On STT failure the turn re-prompts once before grading.

Run server:
```
bun run src/server.ts            # http://localhost:3000
```

## 4. Swap STT / TTS providers

Provider interfaces: `src/voice/types.ts` — `transcribe(Uint8Array,{mime,language})→string`, `speak(text,{voiceId})→Uint8Array`.

| Provider | File | Selector |
|---|---|---|
| ElevenLabs STT (Scribe `scribe_v1`) | `voice/elevenlabs-stt.ts` | default |
| OpenAI STT (`gpt-4o-transcribe`) | `voice/openai-stt.ts` | `RECALLIT_STT=openai` |
| ElevenLabs TTS (`eleven_multilingual_v2`) | `voice/elevenlabs-tts.ts` | default |
| mock STT/TTS | `voice/mock.ts` | tests/offline |

Selection branch: `server.ts:152-155`. Env:

| Env | Where | Note |
|---|---|---|
| `ELEVENLABS_API_KEY` | `elevenlabs-tts.ts:9`, `elevenlabs-stt.ts:6` | one key, both TTS+STT; throws if unset |
| `ELEVENLABS_VOICE_ID` | `elevenlabs-tts.ts:10` | falls back to George `JBFqnCBsd6RMkjVDRZzb` |
| `RECALLIT_STT` | `server.ts:153` | `openai` → OpenAI STT |
| `OPENAI_API_KEY` | `openai-stt.ts:19` | only when `RECALLIT_STT=openai` |
| `PORT` | `server.ts:156` | default 3000 |
| `RECALLIT_DATA_DIR` | `paths.ts:5-7` | data root, default `<cwd>/data` |

To add a provider: implement the 1-method interface, inject into `startServer({stt,tts})`. Loop is offline-testable with `mockStt`/`mockTts`.

## 5. Progress / streak / danger-zone

`get_progress` → `getProgress` (`progress.ts`). `markActive` advances the streak across consecutive **local** days (day boundary from `RECALLIT_TZ`, e.g. `America/Chicago`; UTC if unset), idempotent within a day. `dangerZone=true` when `streak>0` and today not yet done. `goalMetric` (`minutes_spoken` for Spanish) is a passthrough **label** — surfaced in prompt + reflect phase + UI `/api/progress`; no code computes minutes.

## Gotchas

**Still true:**
- **Roleplay turns aren't graded.** Roleplay now collects free-conversation spoken turns via the card-less **`converse`** tool (`session.converseProvider`, wired in `cli.ts` + `server.ts`) — the earlier "no converse primitive" gap shipped. But `converse` turns are *production practice*, not scheduled review: they don't grade or touch FSRS (only `present_card`→`grade_card` does).
- **Grader is lexical only** (`evaluate.ts`): strips diacritics/ñ/punctuation; valid paraphrases grade Again. Acceptable for the comprehension review loop (front=Spanish → back=English); semantic match deferred.
- **`mine_card` is morphology-blind** — token = accent-stripped word; conjugations count as unknown, can wrongly reject valid i+1 cards.
- **`update_card` tool exposes only front/back/context** (`agent.ts`) — cannot edit tags/type/meta via the agent (set them in the pack); editing `front` does trigger `native.mp3` regen.
- **No topic-CRUD/switch tools** — agent parity is within-a-topic; topic setup is host/CLI (`topic add`, `topic use`).

**Fixed since first draft:**
- ✅ **`meta.voiceId` is wired** — server resolves it per connection and calls `speak(front, {voiceId})`; the RGV voice plays without `ELEVENLABS_VOICE_ID`.
- ✅ **`native.mp3` is served + played** — `GET /media/:topic/:card/:file`; shadowing plays the stored recording (TTS fallback if absent).
- ✅ **STT language is sent** (`meta.language`) and **STT failure re-prompts once** instead of grading an empty transcript as Again.
- ✅ **`context.md` is per-topic** and ✅ **streak uses local time** (`RECALLIT_TZ`).
