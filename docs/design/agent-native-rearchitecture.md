# Agent-native rearchitecture — assessment and plan

Reference: [Every, "Agent-Native Architectures"](https://every.to/guides/agent-native). Goal per the kickoff: rearchitect recallit toward a headless retention engine that "slots into any modality" (text, voice, visual), using the guide as a north star for what to gut, refactor, and keep.

Produced by a 12-agent research → propose → judge → critique pass (guide distillation, three independently-angled codebase maps, three competing rearchitecture proposals, one synthesis, two adversarial critiques). This doc is my synthesis of that output, not a raw dump of it — the critiques found a real, blocking design gap in the first draft of the plan (see Phase 1 below), so what follows is the corrected version, not the judge's original.

## TL;DR

recallit is already unusually agent-native for a young project — more so than the average codebase this guide is written to fix. The sacred stuff (grading, scheduling, turn-gating) is clean, pure, and correctly isolated. The real gap isn't "the engine needs gutting" — it's two narrower things: (1) the one true modality seam (`TutorIO`) only carries flat text strings, so voice/visual can't send structured input without inventing side channels, and (2) the tool surface can only ever be driven by the Claude Agent SDK's own loop, not by an external agent. Fixing both is additive, in-place work — no new package, no engine rewrite, nothing sacred touched.

The adversarial pass also caught that "let an external agent drive a full review session over MCP" has a real, unsolved I/O problem as currently scoped (below). That part needs a design spike before any code moves, not a phase number.

## What "agent-native" means (the guide, condensed)

Five principles: **parity** (anything the UI can do, a tool can do — no orphan UI-only actions), **granularity** (tools are atomic primitives; judgment lives in prompts, not tool code — the litmus test is "to change behavior, do you edit a prompt or refactor code?"), **composability** (parity + atomicity means new features are prompt-only), **emergent capability** (agents compose primitives to do things nobody built a feature for), and **improvement without shipping code** (accumulated context + prompt refinement, not just releases).

Concrete patterns worth lifting directly: files as the state layer over a database ("files for legibility, databases for structure"); a portable `context.md`-style working-memory file per entity; explicit completion signals instead of guessing when an agent is done; a stakes × reversibility approval matrix (auto-apply low-stakes/reversible, require explicit approval for high-stakes/hard-to-reverse); dynamic capability discovery over hand-listed tools; agent-to-UI event streaming so nothing looks broken while it's actually working.

The guide does **not** cover headless/multi-modality design directly — that mapping onto recallit specifically is mine, not the guide's.

## The good news: what's already right

This is the part worth sitting with before touching anything. The research pass found:

- **The one invariant that actually matters is untouchable and clean.** `turn.ts`'s `TurnTracker` gates present → responded → revealed → graded, and the rating always comes from `gradeResponse`, never the agent. `scheduler.ts` (FSRS), `evaluate.ts`, `graders/coverage.ts`, `graders/examiner.ts`'s evidence re-verification — all pure, all deterministic, all consistent with "code decides the rating, the model only proposes evidence." Nothing in this plan touches any of it.
- **The data layer already follows the guide's own "files > DB" principle**, unprompted: cards/topics/review logs are files (source of truth), SQLite is an explicitly disposable, rebuildable index. `store.ts`, `card.ts`, `pack.ts` all separate pure logic from I/O with header comments saying so.
- **A real modality seam already exists and already proves itself**: `tutor.ts`'s `TutorIO` (`answerProvider`, `converseProvider`, `onEvent`, `onGraded`) is genuinely transport-blind, and three different callers (`server.ts`, `cli.ts`, `serve-local.ts`) already supply three different concrete implementations to the same `buildTutorSession`/`runSession` core. This is the guide's parity principle, already working.
- **`converse` is already a deliberate, working modality escape hatch** — a card-less, permanently-ungraded turn, used identically for roleplay, socratic probing, and free-talk. It degrades gracefully (no-ops) for hosts with no conversational channel.
- **`context.ts`'s prompt assembly is genuinely topic-agnostic**, proven at "zero code change" strength by the World Capitals test siblinged against the Spanish pack in your own test suite.

None of this needed to be built for this rearchitecture — it's why the actual gap is smaller than "rearchitect" might imply.

## The real gaps

1. **`TutorIO`'s answer/converse callbacks are flat strings only** — `(args) => Promise<string | null>`, one exchange, no structured payload, no streaming. Voice already gets fully transcribed to text before it crosses this boundary; there's no slot for a tapped choice, a drawn answer, or a media reference that isn't a bare relative filename.
2. **The tool surface can only be driven by `@anthropic-ai/claude-agent-sdk`'s own `query()` loop.** `buildServer()` (the 18 in-process MCP tools) is never exported — it's constructed inline inside `runSession`. "Any driving agent" isn't actually possible today; only "any I/O host driving our fixed SDK loop" is.
3. Two process-global singletons (`topic.ts`'s active-topic file, `graders/registry.ts`'s module-level `REGISTRY`) would clobber each other if two sessions ever ran at once locally — real, but only worth fixing if something in this plan actually creates that scenario.
4. Smaller stuff: `server.ts`'s WS handling is fused directly into the transport (closures over `ws.data`, one pending-turn slot, no reusable adapter); `cli.ts` has three copy-pasted `TutorIO` builders; `context.ts:133`'s `buildPracticePrompt` is confirmed dead code; `TOOL_NAMES` is a hand-maintained list that can silently drift from the actual tool array.

Two of the three independent proposals (a "clean-core `packages/engine`" rebuild, and a "protocol-first standalone MCP server") were seriously evaluated and explicitly **not** chosen as the chassis — both are real angles, but oversized for what's actually broken, and both would put the live voice loop or `agent.ts`'s shape through a rewrite the smaller fix doesn't need. The full reasoning is worth having on record: they're the right move *if* an external agent host or a hosted/multi-tenant future is actually imminent, and the wrong move otherwise. That's exactly the question I need answered before scoping past Phase 0.

## The plan

**Phase 0 — do now, zero behavior change, no open questions.** Run a CRUD-completeness audit across the 18 tools (confirm `update_card`/`delete_card`/etc. are actually symmetric per the guide's own checklist, not just create/read). Auto-derive `TOOL_NAMES` from the real tool array instead of hand-maintaining a parallel list. Delete `buildPracticePrompt`. Consolidate `cli.ts`'s three duplicated `TutorIO` builders into one factory. This is pure hygiene — I'd start here regardless of anything else in this doc.

**Phase 1 — widen `TutorIO`, additively.** Extend `answerProvider`/`converseProvider` from a bare string to a superset that can carry structured content blocks and a real resolvable media reference (not today's bare relative filename) — every existing text-only caller must keep compiling unchanged. Pull `server.ts`'s WS-fused `makeAnswerProvider`/`makeConverseProvider`/`handleMessage` out of the WS handler into a standalone adapter module against the *same wire protocol*, so a second UI modality can be written against a real contract instead of copy-pasted closures. This is the part of "any modality" that's actually just an extension of an existing, working seam — lowest risk, no open question attached.

**Phase 2 — the "any driving agent" piece, and where I need to stop you before it becomes a roadmap.** The instinct is: export `buildServer()`, wrap it with the MCP SDK on stdio, ship `recallit mcp serve`. The adversarial critique found a real problem with that framing: `await_user_response` is a tool the driving LLM calls that internally *blocks* on a callback wired to one specific transport (the CLI's synchronous stdin `prompt()`, or the WS's `pendingResolve`). Stdio MCP transport uses stdin/stdout *for the protocol itself* — there's no channel left over for a human to actually type an answer through, the way the mechanism works today. This means "attach an external agent and run a full review session" is not the smallest possible move it looks like — it likely needs `await_user_response` split into an emit-question tool plus a separate `submit_answer` tool the external driver calls with the answer as an argument, which is a real protocol change to the turn model, not an export. **I'm not scoping this as a numbered phase yet** — it needs a design spike first, and it should only happen at all if you confirm there's an actual external agent host you want driving recallit, not a hypothetical one.

**Everything past here is explicitly conditional, not a roadmap** — this is the correction the critique forced: the first draft of this plan wrote five phases as default work off the back of open questions that were never answered. I'm not doing that here.

## Resolution (2026-08-27)

Phase 0 is done (tool CRUD audit clean, `TOOL_NAMES` auto-derived, `buildPracticePrompt`
deleted, `cli.ts`'s TutorIO builders consolidated into `cliIO()`). Phase 1 and Phase 2 are
explicitly **not** happening right now — not deferred-by-neglect, decided:

- **Phase 2** (`recallit mcp serve`, an external driving agent) — declined. The actual "any
  driving agent" need was already met with zero engine changes: `skills/recallit/SKILL.md`'s
  CLI-only flow already proves it, and a live-broadcast web app feature (the same shape as
  Phase 2) was scoped and explicitly declined in `~/.claude/plans/generic-drifting-comet.md`.
- **Phase 1** (widen `TutorIO` to structured content blocks) — declined for now. No second
  modality is actually being built; "flexible enough for any modality" stays a design property
  the current string-based seam already satisfies well enough, not a concrete near-term build.
  Revisit if and when a real second modality shows up — building the wider shape speculatively,
  with nothing to validate it against, was the exact failure mode the adversarial critique
  flagged in the first draft of this plan.

The open questions below are answered by the above; kept for the reasoning trail.

## Open questions — I need these answered before anything past Phase 0/1

1. **Is a second modality (voice UI beyond today's, a visual review UI) or an external driving agent actually imminent** — something you want built soon — or is this exploratory? This is the single biggest lever on how much of this plan is worth doing at all.
2. **Does exporting the tool surface for external attachment count as "engine" work protected by "reuse over rebuild; the engine is sacred," or is it fair game as "wiring"?** Your own docs don't define that line — I read it as: sacred protects the grading/scheduling/turn-gating *algorithms*, not the process topology of how a call reaches them. That's my interpretive call, not something PRODUCT.md states outright, and Phase 2 shouldn't start until you either confirm or correct that reading.
3. If `recallit mcp serve` ever ships, it grants any local process CRUD/delete access to your card data with no confirmation layer — is a stakes-based approval gate (per the guide's matrix) needed from day one, or is "local machine, one user" trust enough for now?
4. Should modality-agnosticism become a named, load-bearing principle in your docs (on par with topic-agnosticism), or stay an implementation convenience? Governs whether the `Modality` enum/`PHASE_GUIDE` (currently language-pedagogy-flavored despite the engine's topic-agnostic charter) is ever worth generalizing.
5. Does this rearchitecture reopen "Free Mode" / grading voice free-recall (paused in `tutor-multimodal.md`), or does converse stay permanently ungraded regardless of modality work? I've assumed the latter throughout.

## What is explicitly not on the table

`turn.ts`'s gating, `scheduler.ts`'s FSRS, `evaluate.ts`/`coverage.ts`/`examiner.ts`'s code-owned rating, `store.ts`/`db.ts`/`card.ts`'s files-as-source-of-truth, `pack.ts`/`install.ts`/`gate.ts`'s honesty pipeline, `converse`'s permanently-ungraded status, and "one deploy, one user" itself. Nothing in this plan asks to gut any of it, and if a future phase ever seemed to require touching one of these, that's a signal the problem got bigger than this plan, not a reason to proceed anyway.
