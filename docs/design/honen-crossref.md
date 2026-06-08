# Honen × recallit — cross-reference brief

> Status: competitive analysis (2026-06-08), from a multi-agent cross-reference of [honen.com](https://honen.com) against recallit. Feeds the adopted direction in [courses-and-styles.md](./courses-and-styles.md). Findings are tagged `aligned` / `tension` / `violates` against recallit's honesty + retention wedge.

## TL;DR

Honen is a **course-delivery / corporate-training SaaS**: it ingests anything (call recordings, videos, decks, links, docs) and renders it into a multi-format "complete experience" (~10 activity types) with team workspaces, manager analytics, and proactive nudges — optimized for *finishing* and *breadth*. recallit is a **local-first, honest, topic-agnostic retention engine**: every card cites a verbatim source span, grades are code-owned (lexical/coverage + FSRS-6).

**They are not direct competitors** — Honen owns "consume content many ways across a team," recallit owns "trust exactly what stuck." The biggest takeaway: Honen's strongest real lever is its **ingestion breadth (audio/video/links → course)**, and recallit can adopt most of it nearly for free because its STT seam + substring honesty gate survive transcripts — while its sharpest uncontested wedge (a grade no model and no human can quietly edit, plus a real forgetting-curve) is currently **under-marketed, not under-built.** Honen has zero spaced-repetition language anywhere.

## Where Honen is genuinely ahead

- **Ingestion breadth.** Audio/video/call-recordings/decks/links → course. recallit ingests only file|url|repo|concept; it *has* STT (`src/voice/*-stt.ts`) that authoring never calls — a real reuse miss.
- **Time-to-first-doing.** "Topic → course in 30s, in-browser, tutor-on-by-default." recallit's live experience is gated behind a terminal, and the landing demo is fully *baked* (pre-written answers) — the visitor watches, never does.
- **Course arc / completion.** Ordered modules, progress bars, "actually finish." recallit's queue is flat (`due ASC`); a 41-card pack is an undifferentiated pile with no introduction order and no "M of N mastered" view.
- **Share-via-link virality.** One-link share drives the loop. recallit has no first-wow share moment.
- **Self-contained onboarding.** Honen never leaves the browser; recallit's SPA empty state dead-ends into a copy-this-CLI-command.

## Recommended improvements (prioritized, aligned only)

| # | Idea | Effort | Impact | Seam |
|---|------|--------|--------|------|
| 1 | **`cloze` card type** (deletion = verbatim source token) — honest *by construction*, grades on the existing lexical grader | S | high | `cards.json` schema, unchanged `src/evaluate.ts`, author option in `src/packgen/author.ts` |
| 2 | **Interactive keyless demo** — type your own answer, get the real grade in-browser | M | high | transpile pure `src/evaluate.ts` → `evaluate.browser.js`, wire a real `<input>` into `marketing/demo/index.html` |
| 3 | **Name the enemy** in landing hero — "you did the deck, the app said 95%, you blanked when it counted" (critique, not a capability claim) | S | high | `marketing/index.html` hero |
| 4 | **Promote the code-owned-grade claim to dominant message** — Honen structurally cannot say this | S | high | `marketing/index.html` "honest math" band |
| 5 | **Audio/video → transcript → gated cards** (reuse STT seam); gate is unchanged, re-anchors to the transcript | M | high | `SourceKind 'media'` in `prepareSource`; call existing `transcribe()`; route through Mode B forced-review |
| 6 | **Local mastery dashboard** `recallit progress --detail` — cards-to-watch / retention% / reviews-day from `review_log.jsonl` | M | high | extend `src/progress.ts`; new CLI verb; no new storage |
| 7 | **Optional `units` introduction-order** — new cards only, FSRS untouched | M | high | `units[]` in manifest; `introduceOrder:'unit'` in `src/db.ts`; zero scheduler change |
| 8 | **"Course" / unit-progress view** in SPA — derive "sticking" from FSRS stability, never self-report | M | high | derive in `src/progress.ts`; panel in `public/index.html` |
| 9 | **SPA empty-state "Load starter pack" button** — kills the terminal round-trip | M | high | `public/index.html` empty state + keyless server route mirroring `src/start.ts` |
| 10 | **First-class markdown/dir ingestion** — 90% wired already | S | medium | `src/packgen/author.ts`; gate needs zero changes |
| 11 | **`progress export --with-progress`** — portable honest snapshot, not a login-gated dashboard | S | medium | extend `src/export.ts` |

## Adopt with care (tensions — only if reframed)

- **MCQ / quiz formats.** MCQ measures *recognition*, not recall — it inflates apparent mastery and **corrupts FSRS intervals**. Reframe: add an `mcq` grader (correct option = verbatim span, pure index match, no model), but **gate to learn/intro/assessment phases only — never the FSRS-driving recall grade.**
- **Long-form audio "podcast/narration."** Honest only as explicitly **non-graded passive review**, firewalled from FSRS. Listening earns nothing.
- **"Share via link."** Honen's is a hosted-course URL (SaaS). Reframe: a static deep-link to a card + its verbatim source citation — "share the proof, not your data."
- **Softer BYO-key tutor on-ramp.** Can't match "tutor free by default" (no managed keys, in the local tier). Reframe: after the demo grade lands, surface the start command + a cost-framed key-unlock hint; don't fake a managed tutor.
- **Slide decks.** Bullet shards are too lossy for verbatim citation. Reframe: PPTX only via speaker-notes / genuine sentence-level body; image-only deck → stop, never OCR-and-pretend.

## Do NOT follow

- **Multi-tenant / manager dashboards / seat-based cohorts** *as the only model* — but note this is now reframed by [courses-and-styles.md](./courses-and-styles.md): hosting is allowed, **lock-in is not.** Honen's most credible user complaint was *data loss on tier change*; recallit's export-your-course + own-your-volume is the counter-position. Don't trade it away.
- **Hard prerequisite / lockstep review-gating.** **Never let a "unit not complete" withhold a due review** — that fights the one thing recallit is honest about (retention). Constrain ordering to new-card introduction only.
- **Output-format breadth (comics/music/games).** Content theater, zero retention signal, real maintenance tax. Decline. Streaks/XP stay motivation chrome, never a grade input.
- **Proactive nudges / live-updating content.** That's recallit's gated "It reminds you" — do not market as shipping. ⚠️ The current REMEMBER copy ("It comes back before you forget") risks being **misread as proactive** — tighten to show-up framing ("when you sit down, the right cards are already waiting") and turn the gap into a calm-software wedge: "no notifications, no streak-guilt."
- **Fabricated social proof** (usage counts, enterprise logos). Violates never-market-ahead-of-code. Make the honest demo the proof instead.

## Sharpen the wedge (lean into what Honen structurally can't)

1. **The grade no one can quietly edit.** Honen's flashcards are unscheduled content artifacts with no honest-grading claim. Make "the grade comes from code checking your answer against the source — not a model deciding to be nice, and not a number anyone can edit" the dominant landing message, and prove it live in-browser. The one demonstration Honen cannot replicate.
2. **The forgetting-curve / retention axis.** Honen has zero spaced-repetition language. A local retention dashboard is a feature category they structurally can't enter. Expose it.
3. **Own-your-data, portable courses.** Honen's credible failure mode is data loss on tier change. recallit's `~/.recallit` + exportable honest courses are the inverse promise: "your data, your disk (or your volume), no account to lose it to."
