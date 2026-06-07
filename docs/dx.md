# dx

Developer experience / maintainer guide for **recallit** — the topic-agnostic spaced-repetition recall engine. This is how you work on the codebase: set it up, run it, find your way around the engine, extend the seams that are meant to be extended, and stay clear of the invariants that are not.

Everything here is file- and command-accurate against the repo. Where a capability costs money or is structurally limited, it is marked as such — recallit is honest by construction, and so is its docs.

---

## 1. Setup & run

recallit is **Bun-only**. The engine imports `bun:sqlite` (`src/db.ts`), so it runs and tests under Bun, not Node. There is no build step for development — `.ts` is the source of truth and runs directly.

```bash
bun install
```

### Package scripts (`package.json`)

| Script | Command | What it does |
| --- | --- | --- |
| `typecheck` | `tsc --noEmit` | TypeScript type check (strict, `noUncheckedIndexedAccess`). |
| `test` | `bun test` | Run the suite in `test/`. |
| `lint` | `biome check src` | Biome lint + format check over `src`. |
| `lint:fix` | `biome check --write src` | Auto-fix lint/format. |
| `cli` | `bun run src/cli.ts` | Run the CLI from source. |
| `serve` | `bun run src/server.ts` | The real HTTP + WS server (needs voice provider keys). |
| `serve:local` | `bun run scripts/serve-local.ts` | **Keyless** dev server: real grading, stubbed STT/TTS, no LLM. |
| `serve:marketing` | `bun run scripts/serve-marketing.ts` | Static marketing site server (default port 8080). |
| `examiner:harness` | `bun run scripts/examiner-harness.ts` | Re-runnable examiner stress test (needs `ANTHROPIC_API_KEY`). |
| `seed:spanish` | `bun run src/cli.ts topic add packs/spanish-mx-rgv --force` | Install the bundled RGV Spanish pack. |

Per the user's tooling preference, prefer `bunx` over `npx` when running one-off CLI tools (e.g. `bunx tsc`, `bunx biome`).

### Fastest path to seeing it work

```bash
# Real grading loop, zero API keys, browser UI:
bun run serve:local
# then open the printed localhost URL — push-to-talk is stubbed, but the
# phase rail, grade-receipt chips, and FSRS scheduling are all real.
```

```bash
# Terminal-only, also keyless for lexical cards:
bun run cli quickstart        # guided onboarding
bun run cli daily             # run the daily multi-phase regimen
bun run cli due               # list due cards
bun run cli review            # drill due cards
```

The published binary is `recallit` (`bin` → `src/cli.ts`), so consumers run `bunx @waits/recallit`. In-repo you use `bun run cli …`.

### Environment variables

| Var | Used by | Effect |
| --- | --- | --- |
| `RECALLIT_DATA_DIR` | `src/paths.ts` | Data root. Defaults to `process.cwd()/data`. Tests point it at a temp dir. |
| `RECALLIT_TZ` | `src/progress.ts` | IANA zone (e.g. `America/Chicago`) for the learner's local day key / streaks. Defaults to UTC. |
| `RECALLIT_EXAMINER` | `src/graders/examiner.ts` | Examiner is **ON by default**. Set `=0` for the deterministic-only floor (offline/CI). |
| `RECALLIT_STT` | `src/server.ts` | `openai` selects `openAiStt` (gpt-4o-transcribe); else ElevenLabs Scribe. |
| `RECALLIT_NO_INSTALL` | `src/server.ts` | Any truthy value 403s `POST /api/packs/install` (public/shared deploys). Note: string-truthy, so `"0"` also blocks. |
| `ANTHROPIC_API_KEY` | agent, examiner, packgen | Required for the LLM examiner, the agent loop, and pack generation. Costs real money (~$0.1–0.4/pack). |
| `ELEVENLABS_API_KEY` / `OPENAI_API_KEY` | voice providers | Per-turn STT/TTS cost. Required only for voice surfaces. |

---

## 2. Engine map

The engine has three load-bearing invariants (see §6) wrapped around a files-as-truth core. Key files:

| File | Responsibility |
| --- | --- |
| `src/turn.ts` | **Turn machine** — per-session `TurnTracker`; gates `present → respond → reveal → grade`. |
| `src/scheduler.ts` | FSRS-6 via `ts-fsrs`; `gradeCard`, `previewSchedule`, `toGrade`. |
| `src/evaluate.ts` | Lexical grading (`evaluateAnswer`, `normalize`, `tokenize`). |
| `src/card.ts` | Card model: `newCard`, `parseCard`, `serializeCard` (gray-matter YAML+markdown). |
| `src/store.ts` | CRUD over cards + the review log; writes file → log → index. |
| `src/db.ts` | Derived `bun:sqlite` index. **Fully rebuildable** via `rebuildIndex()`; not a separate source of truth. |
| `src/review.ts` | Orchestration: `presentCard`, `submitResponse`, `revealAnswer`, `gradeTurn`. |
| `src/agent.ts` | Agent loop + in-process MCP server (19 tools); `createReviewSession`, `runSession`. |
| `src/context.ts` | Prompt construction from topic config + `context.md`; `dailyPhases(modality)`. |
| `src/checkpoint.ts` | Daily-session checkpoint/resume. |
| `src/graders/registry.ts` | `gradeResponse` dispatch by `card.meta.grader`. |
| `src/graders/coverage.ts` | Deterministic coverage grading + `mapCoverageToRating`. |
| `src/graders/examiner.ts` | LLM-examiner path (`examineAnswer` → `recountExaminer`). |
| `src/packgen/*` | Pack authoring loop + honesty gate. |
| `src/server.ts` | HTTP + WS server, SPA host. |
| `src/voice/*` | `SttProvider`/`TtsProvider` interfaces + ElevenLabs/OpenAI impls. |
| `src/index.ts` | Public API barrel — every consumer-facing export. |

### Files-as-truth

`card.md` (frontmatter + markdown) is the single source. The SQLite index (`src/db.ts`) is **derived** and rebuildable; the review log (`review_log.jsonl`) is **append-only** (one line per grade). `upsertIndex()` opens and closes the DB per write — there is no long-lived connection; don't cache one. All paths flow from `RECALLIT_DATA_DIR` (`src/paths.ts`). There are no write locks — concurrent writes to the same card can corrupt.

### Daily phases

`dailyPhases(modality)` in `src/context.ts`:

- **text** (and comprehension): `review → socratic → reflect`
- **voice**: `shadowing → review → roleplay → reflect`

Phase *guidance* is prose injected into the system prompt — it is **not enforced by tools**. Only the turn gates and the rating ownership are enforced. The checkpoint tracks phase *completion*, not fidelity.

---

## 3. Grader registry & how to add a deterministic grader

The registry (`src/graders/registry.ts`) is the seam that lets the recall unit generalize from a flashcard to a "checkable item" **without ever letting a model pick a rating**.

```ts
export type Grader = (card: RecallCard, response: string) => EvalResult | Promise<EvalResult>;
```

- `gradeResponse(card, response)` is the **single grading entry point** — both the turn machine (`turn.ts:respond`) and the CLI call it, so there is never a second grading path.
- Dispatch is by `card.meta.grader`; **absent ⇒ `"lexical"`** = today's `evaluateAnswer`, bit-identical.
- Registered out of the box: `lexical` and `coverage` (the examiner-backed grader).
- **Unknown grader names fail closed (throw).** A grader must never silently degrade to "the agent decides."

### Adding a grader

A grader maps `(card, response) → EvalResult` (sync or async) where the **rating is computed by code**. To add one (e.g. an `ordered` grader):

1. Write a pure mapping module under `src/graders/` that turns the response into a `CoverageVector`-style structure and then into an `EvalRating` via a pure function (mirror `mapCoverageToRating` in `coverage.ts`).
2. Register it. Either:
   - statically, by adding to the `REGISTRY` literal in `registry.ts`, or
   - at runtime via `registerGrader(name, grader)` (this is how tests inject custom graders).
3. Tag cards with `card.meta.grader = "ordered"`.
4. Add a test in `test/graders.test.ts` (dispatch) and a dedicated `test/<name>.test.ts` for the pure mapping, including a boundary canary like the off-by-one check kept in `coverage.test.ts`.

**Rules a grader must honor**:
- The model may *propose evidence*; **code decides the rating**. Never let agent/model input reach `toGrade()` or FSRS directly.
- If the grader cannot judge confidently, **HOLD (throw)** — do not silently grade. The caller (agent/CLI) handles the error path.
- Coverage caps at `Good`. `Easy` is a lexical/exact-recall signal only (intentional — bonus-coverage lift caused paraphrase flicker in the stress test).

---

## 4. The examiner & its re-runnable harness

The `coverage` grader is examiner-backed when `RECALLIT_EXAMINER != "0"` (the default). It splits cleanly into a model half and a code half (`src/graders/examiner.ts`):

- **`examineAnswer(input)`** — one-shot Claude (default `claude-sonnet-4-6`, `maxTurns: 1`, no tools). For each rubric checkpoint it returns `{checkpointId, demonstrated, evidence}`, where `evidence` must be a **verbatim substring of the learner's answer**. Returns `null` on any failure (parse/auth/transport).
- **`recountExaminer(rubric, answer, judgments)`** — **pure, deterministic.** It re-verifies each `demonstrated` checkpoint's evidence is literally in the answer (whitespace/case-normalized substring), **drops the unquotable as fabricated**, then counts coverage via `mapCoverageToRating`. The model proposes; code decides.

If `examineAnswer` returns `null`, `examinerCoverageGrader` **throws** (`"examiner held on card X: no confident judgment"`) — HOLD, never silent fallback. With `RECALLIT_EXAMINER=0` the grader uses the deterministic floor (`checkCoverage`), which is near-verbatim only and false-misses real paraphrases.

### The harness

`scripts/examiner-harness.ts` is the **re-runnable, in-repo reproduction** of the stress test (it replaces an ephemeral workflow). It runs the *real* `examineAnswer` over the committed fixtures `REPEATS` times each, recounts with `recountExaminer`, and reports the brand-critical numbers: replay consistency, paraphrase-cluster consistency, evidence fabrication, and near-miss-bait false-credit. It needs `ANTHROPIC_API_KEY`.

```bash
bun run examiner:harness                         # REPEATS=3 default
REPEATS=5 bun run examiner:harness               # match the original workflow
EXAMINER_MODEL=claude-opus-4-8 bun run examiner:harness
```

Fixtures live at `test/fixtures/examiner-fixtures.json`. Validated targets: replay ≈ consistent, evidence-fabrication 0, bait false-credit 0. **Caveats** (don't oversell): validation set is small and single-author-gold; the 50% Hard/Again boundary is not yet broadly validated; `recountExaminer` checks evidence *presence*, not entailment (it stops fabrication, not misjudgment); no coverage card is in production yet.

For deterministic CI runs, set `RECALLIT_EXAMINER=0` so the suite never makes a model call.

---

## 5. Packgen (pack generation)

Three actors, in `src/packgen/`:

1. **`runPackAuthor(source, opts)`** (`author.ts`) — Agent SDK loop. Classifies the source (file/URL/repo/concept), reads it, saves the raw corpus to `.author/source.txt`, drafts cards (flashcards **and** checkable items with per-checkpoint source quotes), then calls the `write_pack` MCP tool. The agent **never installs** and its MCP tools are path-guarded to `packs/<packId>/`.
2. **`gateCards(cards, corpus)` / `writePack(...)`** (`gate.ts`) — the **honesty gate**, code-owned. A card is `ready` only if its `meta.sourceQuote` (or each rubric checkpoint's `sourceQuote`) is a **literal substring of the corpus**; otherwise it is stamped `meta.status: "needs-review"` and held. Also runs `checkCardQuality` and flags unverified numbers/proper-nouns. Writes `manifest.json` + `cards.json`.
3. **`installPack(source, opts)`** (`src/install.ts`) — materializes a pack into `data/topics/<id>/` via `createCard()` (building the index), copies audio/scenarios, and **skips any `needs-review` card** by default. The structural split survives edits.

CLI surface: `recallit pack <source> | write | review | edit | share | export`.

Gotchas to keep in mind when working here:
- Substring verification ≠ entailment — the gate proves a quote is *present*, not *correct*.
- Checkable items are fail-closed: any missing checkpoint quote holds the whole card.
- **Force reinstall resets FSRS** (`installPack(..., {force:true})` does `rm` + rebuild). Only additive edits preserve schedule/streak.
- Concept (no-source) packs are web-grounded: `manifest.meta.grounding = "web"`, attribution-only, and force a gate even under `--auto`.

---

## 6. Sacred invariants — do not touch

These three are the honesty/pedagogy contract. Changing them changes the product's truth claims.

### 6.1 Turn gating (`src/turn.ts`)

A card's answer cannot be revealed or graded until a response is recorded. `reveal()` requires phase `responded`; `ratingFor()` throws without a recorded evaluation. The phase string (`presented → responded → revealed → graded`) **is** the enforcement. `respond()` is async (the examiner may call the model) but the gates are still synchronous and unskippable. Never let the agent reveal before a response, or call `gradeTurn`/`ratingFor` without `respond` first.

### 6.2 FSRS scheduling is code-owned (`src/scheduler.ts`)

`gradeCard` / `previewSchedule` run FSRS-6 via `ts-fsrs`. The rating that reaches `toGrade()` always comes from `gradeResponse()` — never from agent or model input. `card.fsrs` frontmatter maps to/from the `ts-fsrs` Card; **existing cards are immutable, schema changes are forward-only** (new `ts-fsrs` fields break old deserialization silently).

### 6.3 The agent cannot override the rating

`gradeTurn` reads `tracker.ratingFor(cardId)`, which returns the already-computed evaluation from `respond()`. The `grade_card` tool **ignores any rating the agent supplies** and uses the tracker's evaluation. The `onGraded` callback exposes the rating + reasons for UI, but cannot change it. All pedagogy lives in prompts; all invariants live in tool gates.

The honesty gate (`src/packgen/gate.ts`) is in the same category: the agent's `write_pack` payload cannot skip the deterministic substring check.

---

## 7. Seams meant to be extended

| Seam | File | How to extend |
| --- | --- | --- |
| **Graders** | `src/graders/registry.ts` | Add a deterministic grader (§3). Rating stays code-owned. |
| **Daily phases** | `src/context.ts` (`dailyPhases`) | Add/reorder phases per modality + add phase guidance prose. Remember: prose, not enforced. |
| **Voice providers** | `src/voice/types.ts` | Implement `SttProvider.transcribe` / `TtsProvider.speak`; inject via `startServer(deps)`. New impls live alongside `elevenlabs-*.ts` / `openai-stt.ts`. |
| **Source adapters** | `src/packgen/author.ts`, `src/resolve.ts` | Add a source classification/fetch path; honor the gate. |
| **HTTP routes** | `src/server.ts` | Two thin routes only — keep the surface minimal (below). |

### The two thin server routes

Deliberately minimal in `src/server.ts`:

- `GET /api/packs` → `{packs: [{id, name, modality, goalMetric, cards, due, active}]}`
- `POST /api/packs/install` (body `{source}`) → calls `installPack`, **gated by `RECALLIT_NO_INSTALL`** (installing arbitrary sources runs `git`/`npm`).

Plus `GET /api/progress?topicId=…`, `GET /media/{topicId}/{cardId}/{filename}` (card audio), `GET /` (SPA), and the WS endpoint `/ws?topicId=…`. The WS protocol messages (`say`/`listen`/`transcript`/`phases`/`phase`/`graded`/`caption`/`done`/`error`) are a separate protocol from `SessionEvent.kind` — don't conflate them. Keep new routes thin; the SPA is a single file (`public/index.html`, inline CSS/JS, no build).

---

## 8. The test / check / release loop

### Test

```bash
bun test                                  # full suite (test/*.test.ts)
RECALLIT_EXAMINER=0 bun test              # deterministic — no model calls
bun test test/turn.test.ts                # one file
```

Suite covers the invariants and seams: `turn.test.ts`, `scheduler.test.ts`, `graders.test.ts`, `coverage.test.ts`, `examiner.test.ts`, `gate-rubric.test.ts`, `packgen.test.ts`, `install.test.ts`, `public-api.test.ts`, etc. `*.live.test.ts` (e.g. `agent.live.test.ts`, `voice.live.test.ts`) hit real providers and need keys — skip them offline.

Bug-fix discipline (per repo convention): when reproducing a bug, **write a tmp test that reproduces it first**, then fix and prove it with the passing test.

### Check (QA gate)

```bash
bun run typecheck     # tsc --noEmit  (strict)
bun run lint          # biome check src
bun run lint:fix      # biome check --write src
```

Biome: 2-space indent, double quotes, semicolons, line width 100 (`biome.json`). The `/check` skill runs build + typecheck + Biome over git-touched files.

### Release

`@waits/recallit` is published via `bunx`. **There is no changeset config in the repo** — release is manual:

1. Bump `version` in `package.json`.
2. `bun run typecheck && bun test && bun run lint` — green.
3. Publish (`publishConfig.access: "public"`).

**Critical:** the npm tarball ships `files: ["src"]` only. Bundled packs (`packs/spanish-mx-rgv`, `packs/architecture`) are **repo-only, not in the published package** — `spanish-mx-rgv` contains personal conversational content. A consumer installs the engine + CLI; they generate or install their own packs. Do not assume the bundled packs are available to published-package consumers.

---

## 9. Honest constraints to remember when building

- **One deploy = one user.** Not SaaS, not multi-tenant, no managed billing. Cross-device "sync" is the user's own git/Dropbox of `RECALLIT_DATA_DIR`.
- **Costs real money.** The examiner, the agent loop, voice, and pack generation all hit paid APIs. `--max-budget` caps packgen spend (default $1).
- **iOS PWA limits are structural.** No background mic, no screen-off audio — a hands-free "Free Mode" is impossible on iOS; screen-on push-to-talk is the ceiling. Verify on a real device before any marketing copy.
- **Lexical grading is the default and is literal.** Valid paraphrases grade `Again` under the lexical path; the examiner (coverage cards) is what handles meaning, and it costs API calls and can still misjudge (presence ≠ entailment).
- **No offline examiner.** `examineAnswer` is a per-turn model call; there is no local model in `0.2.0`.

When in doubt: every card cites a line you can check, the grading is code-owned, and the model never picks a rating. Keep it that way.
