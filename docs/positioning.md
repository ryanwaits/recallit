# positioning

Marketing and productization reference for **recallit** — what it is, the wedge it wins on, the claims we can defend, what ships today vs what's gated, the roadmap state, and how to keep simplifying the message, onboarding, and install.

This doc is **honest by construction**. It never claims a capability the engine doesn't have. Anything gated, paid, or platform-limited is marked as such. When in doubt, undersell.

---

## 1. What recallit is (one sentence)

> A topic-agnostic, source-grounded spaced-repetition **engine** — drop a source, get an honest pack, practice it forever — where every card cites a verbatim line you can check and the grade is owned by code, not the model.

It is **not** a SaaS. **One deploy = one user.** No multi-tenant, no managed billing, no accounts. "Sync across devices" means *your own* git/Dropbox of `RECALLIT_DATA_DIR`.

Shipped as `@waits/recallit@0.2.0`, Bun + TypeScript, runnable via `bunx`.

---

## 2. The wedge

There are two crowded adjacent categories. recallit deliberately sits between them and wins on a different axis: **honesty + retention**, not generation volume or quiz novelty.

| | pdf-to-lesson / "AI study tools" | AI quiz / chatbot tutors | **recallit** |
|---|---|---|---|
| Core promise | Turn a doc into a lesson/summary fast | Ask it anything, it quizzes you | Turn a source into a deck you *keep* and *retain* |
| What grading is | Usually none, or vibes | Model decides if you're "right" | **Code** decides the rating; model may only propose evidence |
| Source fidelity | Paraphrased, ungrounded | Hallucination-prone | Every card cites a **verbatim** source line, substring-verified |
| Retention model | One-shot | Session-bound, no schedule | **FSRS-6** spaced repetition, scheduled forever |
| Trust story | "Trust the model" | "Trust the model" | "Check the line yourself; the code can't be talked out of the grade" |
| Ownership | Their cloud, their account | Their cloud | **Files on your disk** (`item.md` + `topic.json`), portable packs |

**The wedge in one line:** *Other tools generate. recallit generates **honestly** and then makes you **retain** it.*

### Why this is defensible
- **Files-as-truth.** Cards are Markdown on disk; the SQLite index is fully rebuildable (`rebuildIndex`). You own the data.
- **Code-owned grading.** The turn machine (`turn.ts`) gates reveal/grade behind a recorded response, and the rating always comes from `gradeResponse` → never from agent input. The model cannot override a grade.
- **Honesty gate.** `gateCards` verifies every card's (or rubric checkpoint's) `sourceQuote` is a literal substring of the saved corpus. Unverified cards are **held**, never silently installed.

---

## 3. The honest claims — say this / never say that

This is the most load-bearing section. Marketing copy must pass these rules.

### Lead claims (true, defensible today)

| Say | Why it's true |
|---|---|
| "Every card cites a source line you can check." | `gateCards` substring-verifies `meta.sourceQuote` against the saved corpus before a card can install. |
| "The grade is owned by code, not the model." | `turn.ts` computes the rating via `gradeResponse`; the agent's `onGraded` callback receives it but cannot change it. |
| "Drop a source. Get an honest pack. Practice it forever." | `recallit pack <source>` authors + gates; FSRS-6 schedules reviews indefinitely. |
| "Topic-agnostic — the engine knows no subject." | The engine carries zero domain knowledge; topics are data plug-ins. |
| "Your cards are files you own." | Markdown on disk, portable packs, rebuildable index. |
| "Spaced repetition that actually schedules — FSRS-6." | `scheduler.ts` via `ts-fsrs`. |

### Careful / qualified claims (true only with caveats — always attach the caveat)

| Claim | Required caveat |
|---|---|
| "It grades your understanding." | **Avoid unqualified.** Default grading is **lexical** (exact / normalized / near-miss). The examiner (coverage cards) re-verifies *evidence presence*, not semantic entailment. Say "checks your answer against source-grounded checkpoints," not "understands you." |
| "AI-graded." | Only for **coverage** cards with the examiner on. The model *proposes* evidence; code re-verifies it's literally in your answer and computes the rating. Frame as "model-assisted, code-decided." |
| "Voice tutor / speak to practice." | Requires API keys (`ELEVENLABS_API_KEY` for TTS/STT, or `RECALLIT_STT=openai`). Costs per turn. Browser, screen-on, push-to-talk. |
| "Generate a pack from anything." | Costs real money (~$0.1–0.4/pack, needs `ANTHROPIC_API_KEY`). Concept/no-source packs are **web-grounded, attribution-only** and never auto-install. |

### NEVER say (the code does not support it)

- ❌ **"Hands-free / pocket / screen-off voice practice on iPhone."** iOS PWAs have no background mic and no screen-off audio. Hands-free "Free Mode" is **structurally impossible on iOS**. Ceiling is screen-on push-to-talk. (Verify on a real device before any voice copy ships.)
- ❌ **"It understands what you mean."** Grading checks *presence* (lexical match, or re-verified evidence spans), not *meaning/entailment*. A literally-present span can be semantic nonsense; the inward check stops **fabrication**, not **misjudgment**.
- ❌ **"Guaranteed accurate cards / fact-checked."** The honesty gate proves a quote is *in the source*, not that the source is *correct* or that the card *reads its source correctly*. It's substring verification, not entailment.
- ❌ **"Free / no API keys."** Generation and voice cost money and keys. Only the keyless demo and `serve-local` (real grading, no LLM/voice) are free.
- ❌ **"Sync / cloud / your account."** Not SaaS. One deploy = one user. No accounts, no managed sync.
- ❌ **"Offline AI grading."** The examiner calls Claude one-shot per turn. No local model in 0.2.0. Offline = deterministic lexical/coverage floor only (`RECALLIT_EXAMINER=0`).

---

## 4. Shippable now vs gated

### Shippable now (free, no keys)
- **CLI** (`bunx @waits/recallit ...`): full deck lifecycle, review loop, stats, pack authoring/install.
- **Keyless demo** (`marketing/demo/`): study → speak walkthrough over the bundled RGV Spanish pack with precomputed FSRS intervals. Zero keys.
- **`serve-local`** dev server: real grading loop (`getDueCards` / `evaluateAnswer` / `reviewCard`), phase rail + grade receipts, **no LLM or voice keys**.
- **Pack export** (`recallit pack export <id>`): self-contained study-kit HTML — ready cards + base64 audio + checkable-item key points. Presentation-only, zero external requests, written locally (never auto-published).
- **Bundled packs**: `spanish-mx-rgv` (voice, RGV Spanish), `architecture` (comprehension, dogfooded from the repo's own `ARCHITECTURE.md`). Repo-only — **not in the npm tarball** (`files: ["src"]`).

### Gated / paid (requires keys or env opt-in)
| Capability | Gate | Notes |
|---|---|---|
| Pack generation | `ANTHROPIC_API_KEY` | ~$0.1–0.4/pack; `--max-budget` caps spend (default $1). |
| Examiner grading (coverage cards) | `ANTHROPIC_API_KEY`; on by default, `RECALLIT_EXAMINER=0` opts out | One-shot Claude per turn; **HOLDs** (throws) rather than mis-grading; offline falls back to deterministic floor. |
| Voice (TTS/STT) | `ELEVENLABS_API_KEY`, or `RECALLIT_STT=openai` | Per-turn cost; browser, screen-on, push-to-talk. |
| Public pack install endpoint | `RECALLIT_NO_INSTALL=1` disables `POST /api/packs/install` | Required on any shared/public deploy (installing arbitrary sources runs git/npm). |

### Real constraints to keep honest in copy
- **Non-additive pack edits reset FSRS.** Changed/removed cards force a reinstall that wipes review history/streak. Only additive edits merge cleanly. True merge-by-key is deferred (Phase 4).
- **Concept packs are highest hallucination risk.** Web-grounded, marked `grounding='web'`, forced through the gate even under `--auto`.
- **Voice packs carry personal content.** The RGV pack contains personal conversational material; export is opt-in per pack, never auto-published.

---

## 5. Roadmap state (current)

Design docs live in `docs/design/`. State as of now:

| Track | Doc | State |
|---|---|---|
| Pack generation | `docs/design/pack-generation.md` | **Phase 2–3 shipped** — author loop, honesty gate, install, edit/re-gate, modes A/B/C all live. Phase 4 (semantic dedup, merge-by-card-key) deferred. |
| Grading / tutor | `docs/design/tutor-multimodal.md` | Coverage + examiner **on by default**; validated by in-repo harness + fixtures (replay ~1.0, evidence-fabrication 0, bait false-credit 0). **Owed before "proven at scale":** second human gold, broader fixtures, shadow-logging vs the deterministic floor, graceful HOLD handling in live sessions. No coverage card in production yet. |
| Hosted product | `docs/design/hosted-product.md` | Roadmap only. Branded SPA is static (`marketing/index.html`); `public/index.html` is the live shell served by `server.ts`. "Deploy-your-own" button is future. |
| Mobile / PWA | `docs/design/mobile-surfaces.md` | Planned. Track A: offline study-deck (works). Track B: full tutor with keys. **iOS hands-free is out of scope (structurally impossible).** Web Push / background scheduler needs a real always-on server (VAPID), iOS 16.4+ installed PWA — gated, Phase 3. |

Guides for operating today's reality: `docs/guides/` (`05-creating-packs.md`, `06-using-packs.md`, `07-multimodal-voice.md`, `08-recipes.md`, plus the originals 01–04 and `README.md`).

---

## 6. How to keep simplifying the message, onboarding, and install

The product's strength is honesty + retention. The risk is that the *story* gets as layered as the *system*. Here's where to cut.

### Lead with one claim, not the architecture
- **Lead:** "Drop a source. Get an honest pack. Practice it forever."
- **Second beat:** "Every card cites a line you can check. The grade is owned by code, not a model."
- Everything else (FSRS, turn machine, grader registry, examiner) is **proof for the curious**, not headline copy. Demote it to a "How it stays honest" section, not the hero.

### What to cut from the front door
- **Don't market voice first.** It's the most caveat-heavy surface (keys, cost, iOS limits). Lead with text + the keyless demo; let voice be a "and it can talk, on your keys" follow-on.
- **Don't market the examiner as a feature.** "AI grading" invites the exact claim we forbid ("understands you"). Market the *outcome* — "checks your answer against the source" — and keep the examiner as an implementation detail.
- **Don't expose modes A/B/C, grader names, or `meta.status` in user-facing copy.** Internal mechanics. Users see "ready cards" vs "needs review," not the gate's vocabulary.
- **Drop any "sync / cloud / accounts" language entirely.** It's false and it muddies the one-deploy-one-user story, which is actually a *trust* selling point ("your data, your disk").

### Simpler onboarding (the first 60 seconds)
- **First touch should be keyless.** Point new users at the demo or `serve-local` so they feel the loop (study → answer → real grade → schedule) with **zero keys, zero spend**. The "honest grade" moment is the aha; deliver it before asking for a credit card or an API key.
- **One command to a real deck:** `bunx @waits/recallit pack <source>` then `bunx @waits/recallit daily`. Two commands, source → practice. Keep the quickstart to exactly this path.
- **Surface the source-quote chip early.** The single most differentiating moment is seeing a card cite a verbatim line. Make that visible in the first deck a user touches (the marketing filmstrip already does this — mirror it in onboarding).
- **Be explicit about cost at the key boundary.** When a user first hits a gated path (generate/voice), state the cost and the `--max-budget` cap in one line. Honesty about money is on-brand.

### Simpler install
- **`bunx` is the install story.** No global install needed for the CLI. Keep the canonical command as `bunx @waits/recallit ...`.
- **Ship the bundled packs as the "try it" path** — but be clear they're repo-only (not in the npm tarball). For npm users, the entry is "generate your own pack," not "here are decks."
- **Public deploys: one env var.** `RECALLIT_NO_INSTALL=1` is the entire abuse-guard story for a shared sandbox. Document it as a single required flag, not a security treatise.

### Keep the honesty guardrails as the brand (don't soften them)
- Honest-by-construction is the moat. Every public claim should survive the §3 test.
- The sacred invariants — `turn.ts` gating, FSRS scheduling, the agent never picking a rating — are the proof points. Reference them when challenged; never market around them.
- Be upfront about the limits (iOS hands-free, examiner cost, substring ≠ entailment). Saying what we *don't* do is itself the differentiator against "trust the model" competitors.

---

## 7. One-screen cheat sheet

- **Tagline:** Drop a source. Get an honest pack. Practice it forever.
- **Proof:** Every card cites a verifiable line; code owns the grade.
- **Free path:** keyless demo + `serve-local` + CLI review.
- **Paid path:** generation, examiner, voice — all on your keys, with a budget cap.
- **Never say:** iOS hands-free voice; "understands you"; fact-checked/guaranteed; free generation; sync/cloud/accounts.
- **One constraint to repeat proudly:** one deploy = one user, files on your disk.
