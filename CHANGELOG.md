# Changelog

All notable changes to `@waits/recallit`. Releases before 0.7.0 predate this file — see the
git tags (`v0.1.1`–`v0.6.0`) for their history.

## 0.9.0 — 2026-08-28

### Breaking

- **The bundled reference web app is gone from this package.** `bunx @waits/recallit start`,
  `bun run serve`, `bun run serve:local`, and `public/` no longer exist here — they've moved to
  a new, separate package, [`@waits/recallit-tutor`](https://www.npmjs.com/package/@waits/recallit-tutor)
  (first release, `0.1.0`), which depends on this engine exactly like any other consumer.
  If you were using the browser tutor: `bunx @waits/recallit-tutor` replaces
  `bunx @waits/recallit start`; `cd tutor && bun run serve`/`serve:local` (or install the new
  package standalone) replaces the old dev scripts. Nothing about the tutor's functionality
  changed, only where it lives.
- `recallit start` is removed from the CLI. Everything else (`due`, `answer`, `pack`, `topic`,
  `agent`, `talk`, `quickstart`, ...) is unchanged.

### Added

- The public API (`src/index.ts`) now exports several primitives that existed internally but
  were never surfaced: `review.ts`'s turn functions (`presentCard`, `submitResponse`,
  `revealAnswer`, `gradeTurn`), the full `paths.ts` data-layout module, `coursePhases`, and the
  `HoldResult`/`GradeCheckpoint` types. These were real gaps — the moved tutor package needed
  them to consume the engine through its public surface instead of reaching into internal files,
  and any other "build your own UI" consumer needs them too.

## 0.8.0 — 2026-08-27

### Added

- **The Reading Room**, a redesign of the marketing site, demo, web app, and Studio around one
  visual system: cream paper, a serif headline, a mono "receipt," and mint reserved strictly for
  an honest passed grade — never a generic button or status color.
- **Grader HOLD state.** When the examiner can't produce a confident judgment, the engine now
  returns an honest `{hold: true, reason}` instead of throwing — the turn stays retryable, never
  silently graded and never a killed session. Surfaced through the CLI (`recallit answer`), the
  agent's `await_user_response` tool result, the WS protocol (`{type:"held"}`), the tutor's
  system prompt, and a new held-state panel in the web app.
- **Per-checkpoint grading receipt.** Coverage and examiner grades now report which rubric
  checkpoints were hit and cite the source line backing each one; the web app renders a real
  checklist plus a highlighted cited quote. A lexically-graded card has no rubric to cite and
  degrades honestly to the rating and reason only, never a synthesized citation.
- **Prompt caching** in the tutor's agent loop, cutting the cold-start latency every session used
  to pay on first load.
- OpenClaw skill docs: the Node install spec and gate reason codes are now fully documented, and
  the skill is listed on ClawHub.

### Fixed

- A review question could render twice (once as a caption, once as the spoken prompt) — deduped.
- Holding the spacebar to start voice recording while a text answer was focused would eat the
  space keystroke and submit the field's contents as if it were an unintelligible recording.

### Changed

- `agent.ts`'s tool-name list is now auto-derived from the real tool set instead of hand-maintained
  separately, so it can no longer silently drift out of sync.

## 0.7.0 — 2026-07-06

### Added

- **Swappable examiner provider.** Comprehension grading (`coverage` cards) can now run on any
  OpenAI-compatible endpoint instead of Anthropic — a local Ollama, LM Studio, vLLM, OpenRouter:
  set `RECALLIT_EXAMINER_URL` + `RECALLIT_EXAMINER_MODEL` (+ optional `RECALLIT_EXAMINER_KEY`).
  The endpoint wins over `ANTHROPIC_API_KEY` when both are set. The grading contract is
  unchanged whichever provider you use: the model only proposes per-checkpoint judgments with
  verbatim evidence; code re-verifies every span against the learner's answer and computes the
  rating.
- **OpenClaw skill** (`skills/recallit/`): drive pack authoring and the daily drill loop from an
  OpenClaw agent, fully keyless, CLI-only. Validated against the `openclaw-umbrel` container
  image (npm-global install path, `/data` persistence).
- Pack-authoring skills now classify each card as a **flashcard** (exactness graded lexically) or
  a **checkable item** (`meta.grader: "coverage"` + `meta.rubric` — comprehension graded by the
  examiner, paraphrase-tolerant).

### Fixed

- A missing/blank `ANTHROPIC_API_KEY` (and no configured endpoint) now quietly falls back to the
  deterministic coverage floor instead of throwing "examiner held" — keyless environments never
  crash on a coverage card.
- Bracketed checkpoint ids (`"[a]"` instead of `"a"`), which small local models copy from the
  rubric formatting, are normalized before matching so a formatting quirk can't silently drop a
  genuinely demonstrated checkpoint.

### Changed

- The examiner's one-shot judgment call moved from `@anthropic-ai/claude-agent-sdk` to the AI SDK
  (`ai` + `@ai-sdk/anthropic` / `@ai-sdk/openai-compatible`) with schema-validated structured
  output. The Claude Agent SDK remains for the genuinely agentic loops (pack author, tutor).
