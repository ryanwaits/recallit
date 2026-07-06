# Changelog

All notable changes to `@waits/recallit`. Releases before 0.7.0 predate this file — see the
git tags (`v0.1.1`–`v0.6.0`) for their history.

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
