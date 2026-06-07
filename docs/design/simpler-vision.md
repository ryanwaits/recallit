# The simple vision

> From a multi-agent pass (2026-06-07) that verified two product claims against the actual code, scoped the gaps, and converged on one plain vision. Honesty rule for this doc: the **capability truth** table is the source of record for what we may market. Do not ship a claim the code doesn't back.

## One line

**Tell it what you want to learn, and you get a tutor that practices with you however you like, and is honest about what you actually know.**

Three verbs: **Describe → Practice → Remember.**

The emotional hook (the one true, rare differentiator): **it won't tell you you've got it when you don't.** Most apps flatter you. This one is on your side.

## How a person consumes it

1. **Say it.** "Teach me WW2." or "Turn this PDF into something I'll remember." You describe it in plain words (today: the `/recallit-pack` skill or `recallit pack "<topic>"`). No deck to build, no setup.
2. **Get your tutor.** It reads your file (or researches the web) and builds the cards, citing where each one came from. You confirm and install.
3. **Practice your way.** On your check-in it runs your due cards, and you choose *how*: a quick **drill**, or a back-and-forth **conversation** on the material. The presentation changes; the grade behind it is always the same honest, code-owned score.
4. **It keeps you honest.** It resurfaces what you're about to forget and tells you straight where you stand. If you didn't really know it, it says so, and you see it sooner.

## Capability truth (what we may say)

| Claim | Status | Note |
|---|---|---|
| **Grading stays consistent however you practice** | **real-today** | `gradeResponse` dispatches on the card's grader (`lexical`\|`coverage`), never on modality; the rating is a code-owned `EvalResult` the agent can't override; unknown graders fail closed. Safe to lead with. |
| **Practice your way (drill vs conversation), your choice, per session** | **real-today** (shipped 2026-06-07) | `daily --regimen drill\|converse\|full` overrides the pack's modality default, reusing existing phases + the modality-agnostic `converse` primitive. The grade is untouched. *Not yet* exposed in the browser SPA (the WS path still sends a fixed phase list), and a sticky per-pack preference is a future field, not a config mutation. |
| **Just describe it and it builds** | **partial** | `recallit pack "<concept>"` is a real web-grounded agent author loop; `pack edit` refines conversationally; the skill encodes it. Gaps: it's author **then** a separate `daily` (the one-command `quickstart "<concept>"` doesn't author yet); needs `ANTHROPIC_API_KEY` + ~$1/pack; concept/web packs are grounded + citation-checked but stamped `needs-review`/attribution, not "verified correct." |
| **It automatically brings things back on a cadence** | **gap-to-build (gated)** | Spaced repetition is real, but the session is learner-initiated. True periodic re-engagement needs a local scheduler (cron/launchd, one-deploy-one-user, never a SaaS server). **Do not market as shipping.** |
| **It talks (voice)** | **partial** | `converse` works in text; spoken voice needs a TTS/STT provider wired + keys. "And it can talk, on your keys," not a hero claim. |

## The modality model (why "practice your way" was cheap)

Modality used to control exactly one thing: which phase sequence `dailyPhases(modality)` returns. Everything load-bearing is already modality-blind, the grader registry dispatches on the card and `converse` is one topic-agnostic conversation primitive powering both text-socratic and voice-roleplay. So "let the learner pick how to practice" reduced to "let the learner pick the phase regimen for this run", with **zero** change to the grader, turn machine, or FSRS. That's the shipped regimen.

What stays **gated** (a real build, do not market): the SPA toggle (same override plumbing through the WS path), true periodic **cadence** (a scheduler), and spoken voice (a provider). A sticky per-pack preference must be a new `preferredRegimen` field, never a mutation of the author's `modality` default.

## Remaining enhancements (reuse-first, prioritized)

1. **The true describe-and-build one-liner** (M): make `quickstart "<concept>"` author → install → study in one command (today it calls `installPack` directly and silently fails on a bare concept). Reuse `runPackAuthor` + the existing `installPack` + `runDailySession` chain; guard so a mistyped pack ref can't fall through to ~$1 of web authoring.
2. **Make "just say it" the front door** (S, docs/copy): lead the README + CLI usage with the describe-it framing and surface `/recallit-pack`; demote raw `pack <source>` flags to a reference section.
3. **Reframe the web-pack gate as a confidence signal** (S): before the confirm prompt, read `packs/<id>/.author/source.txt` and print "built from N sources: …"; show the key + ~$1 budget up front.
4. **Expose the regimen in the SPA** (M, gated): thread the same override through the WebSocket phase list + a learner toggle.
5. **True periodic re-engagement** (M, gated): a local cron/launchd wrapper that runs `daily --regimen converse` when cards are due. Label "coming," never ship as live.

## What this is not
- Not a SaaS. One deploy, one user; no server, no accounts, no cloud scheduler today.
- Not a flashcard app with AI on top, the grade is code-owned and the agent can't talk its way to a better rating.
- Not an authority on truth. Web/concept packs are source-grounded + citation-checked (each quote is a literal substring of the corpus) but flagged `needs-review`/attribution, grounded, not "verified correct."
- Not learner-switchable modality in the **browser** yet, and not automatic re-engagement yet (both gated above).
- Not free or instant for built-from-scratch packs (authoring uses Claude, needs a key, costs money).

## Marketing guardrail
Keep vision copy and **live** marketing separate. "Practice your way (drill or conversation)" is now true and shippable (CLI). "It automatically brings things back on a schedule" is **not** yet, and must stay a "coming" note. Never use FSRS, examiner, grader, modality, coverage vector, registry, or phase regimen in consumer copy.
