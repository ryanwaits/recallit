# recallit — Product & Brand

register: brand

> The marketing surfaces (landing, demo, packs) are design-forward: design IS the product there. The in-app SPA (`public/`) is the `product` register: design serves the task.

## What it is
An honest, source-grounded tutor. You describe what you want to learn, recallit builds a pack around it (every card cites a real line from the source), and you practice it your way. The grade is owned by code checking your answer against the source, never a model deciding to be nice.

**The one line:** Tell it what you want to learn, and you get a tutor that practices with you however you like, and is honest about what you actually know.

**Three verbs:** Describe → Practice → Remember.

## Users
- Self-directed learners who want to actually *retain*, not just highlight: students, professionals studying a field, autodidacts working through books, papers, courses, or a language.
- The owner who self-hosts (one deploy, one user). Technical enough to run `bunx`, not necessarily a developer.

## Brand & tone
- **Honest, calm, literary, warm.** A tutor in a reading room, not a flashy app. The emotional hook is the one rare, true thing: *it won't tell you you've got it when you don't.* Most apps flatter; this one is on your side.
- **Plain language. No jargon, ever, in consumer copy** (never: FSRS, examiner, grader, modality, coverage, rubric, registry, regimen, phase). Say the outcome, not the mechanism.
- **No em dashes** (commas, colons, periods, parentheses).
- Confident but never hype. Show receipts, not adjectives.

## Anti-references
- The friendly-but-generic white-minimal AI study tool (pdftolesson.com): we adopt its clean, light, geometric clarity (near-white, bold sans, black pills, soft cards) and make it ours with a single vermilion "mark" accent and the cited-line motif. We reject its rainbow-gradient delight and cartoon mascots.
- Generic SaaS slop: purple gradients on white, Inter/Roboto, the hero-metric stat row, identical icon-card grids.
- Flashcard apps that gamify and flatter (gold stars, streaks-as-dopamine). Our "delight" is a *receipt*, the proof of an honest grade.

## Strategic principles
- **Honest by construction.** Every card cites a checkable line; the grade is code-owned; unverifiable content is held back, not invented. The brand cannot say something the engine doesn't enforce.
- **Never market ahead of the code.** The capability-truth table in `docs/design/simpler-vision.md` is the source of record. "Practice your way" and "the right card is waiting when you show up" are true today. "It reminds you on a schedule" is NOT, keep it a "coming" line.
- **Topic-agnostic.** A book, a topic, a language, a paper, all the same engine; the marketing must show breadth, never imply "language app" or "flashcard app."
- **One deploy, one user. Not a SaaS.** Reframed as trust: your cards are files on your disk, no accounts, no cloud, no one can change your grade, including us.
- **Reuse over rebuild;** the engine (grading, scheduling, the turn machine) is sacred.

## Primary actions
- The keyless browser **demo** is the first touch and the primary CTA everywhere (the honest-grade moment, no key, no account, no spend).
- The real path is `bunx @waits/recallit`: describe a source, then study. The API-key + cost line appears once, at that boundary.
- Voice is a quiet follow-on ("and it can talk, on your keys"), never a hero pillar.
