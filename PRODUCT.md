# recallit — Product & Brand

register: brand

> The marketing surfaces (landing, demo, packs) are design-forward: design IS the product there. The in-app SPA (`public/`) is the `product` register: design serves the task.

## What it is
A headless, honest, source-grounded retention engine. Hand it a source, it builds cards that cite a real line, and grades your answer against that line in code, never a model deciding to be nice. recallit ships no UI opinion: present, answer, grade, schedule are the primitives, and whatever sits on top, a chat agent, a voice loop, a dashboard, a CLI, is yours to build. The tutor in `public/` and the demo are recallit's own **reference implementation** of that engine, not the product itself.

**The one line:** We grade the memory. You build the interface.

**Three verbs:** Describe → Practice → Remember. (Still true at the engine level: describe a source, practice however you build it, remember via code-owned scheduling.)

## Users
- Builders who want honest, code-owned grading in their own product: an agent harness, a study app, an internal tool, anything that needs "did the user actually retain this" as a real signal, not a vibe.
- Self-directed learners who use the shipped reference tutor directly: students, professionals studying a field, autodidacts working through books, papers, courses, or a language. They're the engine's own proof, not a separate audience to design differently for.
- The owner who self-hosts (one deploy, one user). Technical enough to run `bunx`, not necessarily a developer.

## Brand & tone
- **Honest, calm, literary, warm.** Not a flashy app, not hype-y dev-tool copy either. The emotional hook is the one rare, true thing: *it won't tell you you've got it when you don't.* Most apps flatter; this one is on your side.
- **Plain language by default; precise engine vocabulary is earned, not banned, on builder-facing surfaces.** The landing page and docs speak to builders evaluating the engine, so naming a real primitive (rubric, grade, schedule) is clarifying, not jargon, as long as it's a thing the engine actually does, defined in plain words nearby. The *reference tutor's own UI* (`public/`, the demo) still speaks to a learner mid-session and stays jargon-free there (never: FSRS, examiner, grader, modality, coverage, registry, regimen, phase). Say the outcome, not the mechanism, when the reader is the person being graded.
- **No em dashes** (commas, colons, periods, parentheses).
- Confident but never hype. Show receipts, not adjectives.

## Anti-references
- Generic AI study tools (e.g. pdftolesson.com): we want warmth and craft, not white-minimal sameness or rainbow/mascot delight. The landing and demo run "The Reading Room" (paper, a serif question, a mono receipt, mint reserved for the grade); see DESIGN.md. The pack pages still run the earlier Hallmark "Bubble" theme (cream + mint-green everywhere + Plus Jakarta Sans), not yet migrated.
- Bubble / mint-pill SaaS: a bright accent color on every button, badge, and card. If mint (or any accent) shows up anywhere it isn't the grade, that's the old system creeping back in.
- Generic SaaS slop: purple gradients on white, Inter/Roboto, the hero-metric stat row, identical icon-card grids.
- Flashcard apps that gamify and flatter (gold stars, streaks-as-dopamine). Our "delight" is a *receipt*, the proof of an honest grade.

## Strategic principles
- **Honest by construction.** Every card cites a checkable line; the grade is code-owned; unverifiable content is held back, not invented. The brand cannot say something the engine doesn't enforce.
- **Headless by design; no enforced UI.** recallit is the engine (source in, honest cards out), not an app. It ships zero visual or interaction opinion, present/answer/grade/schedule are primitives, and the reference tutor is one demonstration of them, not a constraint on what anyone else builds. Marketing must never imply the shipped UI is the only, or the intended, way to use recallit.
- **Never market ahead of the code.** The capability-truth table in `docs/design/simpler-vision.md` is the source of record. "Practice your way" and "the right card is waiting when you show up" are true today. "It reminds you on a schedule" is NOT, keep it a "coming" line.
- **Topic-agnostic.** A book, a topic, a language, a paper, all the same engine; the marketing must show breadth, never imply "language app" or "flashcard app."
- **One deploy, one user. Not a SaaS.** Reframed as trust: your cards are files on your disk, no accounts, no cloud, no one can change your grade, including us.
- **Reuse over rebuild;** the engine (grading, scheduling, the turn machine) is sacred.

## Primary actions
- **"See it graded live"** (the keyless browser demo of the reference tutor) is the first touch and the primary CTA everywhere: it's the fastest way to see the honest-grade moment, no key, no account, no spend, before evaluating the engine itself.
- **"Read the docs"** (GitHub) is the builder's path in: the engine, the primitives, `bunx @waits/recallit`.
- The real integration path is `bunx @waits/recallit`: describe a source, then study, or wire the primitives into your own UI. The API-key + cost line appears once, at that boundary.
- Voice is a quiet follow-on ("and it can talk, on your keys"), never a hero pillar.
