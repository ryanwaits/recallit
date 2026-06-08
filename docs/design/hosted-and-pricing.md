# Design: hosted recallit + licensing (product-first)

> Status: proposed strategy (multi-agent scope + adversarial verify + two user reframes, 2026-06-08). Started as "hosted SaaS toward $10k MRR"; **the user steered it to its current shape: build an incredible retention product first, monetize it lightly with a license (not a monthly SaaS), and don't let revenue distort what we build or which packs we ship.**
>
> **Two decisions locked this session:**
> 1. **Product = horizontal & topic-agnostic, proven by 3 equal flagship journeys** — ARE (high-stakes professional exam), Spanish/RGV (language + voice), and "point at a book/PDF/raw materials → make your own" (the universal promise). No single narrow vertical; the flagships are *showcases*, chosen for product reasons, not margin.
> 2. **Monetization = a license, not a subscription.** A one-time (or annual) license to run recallit + **bring your own key** for model usage → near-zero COGS for recallit, no metering anxiety, no enterprise treadmill. Optional pay-as-you-go credits are the on-ramp for users who won't bring a key. Money is a bonus, not the driver.
>
> Supersedes the SaaS framing in [hosted-product.md](hosted-product.md). The architecture below is unchanged and sound; the pricing is rebuilt around licensing.
>
> **FINALIZED (user, 2026-06-08):** license = **annual (~$79/yr)** · **BYO-key only at launch** (managed-key credits deferred) · flagships = **ARE + language only** (CCAT dropped — no packs) · **Sprint 0 in progress.**

## Positioning — one product, three flagships

recallit is **"learn anything, actually remember it."** One horizontal engine: drop a source → an agent authors a source-grounded pack → you practice it forever, graded on whether you *understand*, scheduled so it comes back before you forget. The three flagships each prove a *different axis* of that one engine, and each already maps to an existing or trivial pack:

| Flagship | Proves | Why it fits recallit's edge |
|---|---|---|
| **ARE** (Architect Registration Exam; cf. Black Spectacles) | High-stakes **comprehension** exam | Dense official source material (codes/standards/reference PDFs) is exactly what the author agent eats; the exam tests judgment, not trivia → **meaning-grading beats Anki cloze**; architects pay *premium* for prep (Black Spectacles is low-hundreds/mo), so even light monetization is easy. |
| **Spanish / RGV** | **Language + voice** | The only flagship that shows shadowing / roleplay / push-to-talk — no exam tool can do this. Personal goal, most-built pack, proves the multimodal axis. |
| **Any book / PDF / raw materials** | The **universal BYO promise** | "Point at your own source, get your own tutor." This is the topic-agnostic soul; ARE and Spanish are just two instances of it. |

**Honest fit note on CCAT** (Criteria Cognitive Aptitude Test, raised as a candidate): weaker fit. CCAT is *timed speed/aptitude* (50Q/15min, math/verbal/logic/spatial) — it rewards fast pattern-recognition, not retention of a body of source material, so recallit's killer feature (grading free-recall understanding against a source) isn't what it tests. Supported as "drill question types," but **not a flagship** — a source-heavy professional exam (PE, bar, CFA) is a better third exemplar if we want a second exam alongside ARE. **(User 2026-06-08: CCAT dropped — no packs.)**

## ARE pack — pedagogy (the actual product thesis, validated 2026-06-08)

The ARE is a **judgment exam**, not a recall exam: scenario-based "best answer among plausible options," deliberately seeded with distractors. So the pack is **not** term→definition flashcards (that trains the wrong muscle). Per the user, the pack is built around three skills:
1. **Decode the question** — what is it actually asking; what's the single deciding factor?
2. **Spot the trap** — why is each plausible-looking distractor wrong (right action/wrong phase, code-minimum vs best-practice, caving to schedule/cost pressure)?
3. **Select & apply the principle** — not memorize answers, but recognize which framework a question type calls for and reason from first principles.

This maps 1:1 onto recallit's differentiator: the **examiner + coverage grader + rubric checkpoints + Socratic phase** already grade *free-recall reasoning against a rubric*, not lexical match. Card taxonomy:
- **Question-decode card** — a stem → "what is this testing, and what's the deciding factor?"
- **Trap/distractor card** — stem + options → "which is right, and why is each distractor wrong?"
- **Principle-selection card** — scenario → "which principle applies, and why this one over the tempting alternative?" Socratic phase probes "why not X?" aloud.

**Evidence (both real, this session):**
- *Baseline failure* — `recallit pack` over the NCARB Guidelines alone produced 15/21 "ready" cards that were all **syllabus trivia** ("what three areas must PcM candidates demonstrate?", "under Obj 1.1, what staffing protocols?"). You could memorize all 15 and answer zero real ARE questions. Grounding in the objectives doc alone yields "know the syllabus," never "make the call." ($0.28, draft discarded.)
- *Judgment success* — two hand-authored judgment cards (substitution-under-schedule-pressure; budget/defect-free-guarantee), each graded by the **real examiner**: STRONG answers → **Good** (3/3 + bonus); fluent, confident **TRAP** answers ("approve it to hold the schedule"; "promise on-budget and defect-free to win the work") → **Again** (0/3). The examiner gave zero credit for *plausible prose that fell for the trap* — exactly the muscle the ARE tests and a flashcard tool cannot grade.

**End-to-end single-card proof (2026-06-08) — scenario cards work as a first-class kind with NO gate change.** Built one judgment card (a developer asks you to seal another firm's drawings you didn't oversee → reason from responsible control + standard of care), grounding each rubric checkpoint in **verbatim public NCARB text** (Model Law §103(16) responsible-control definition + §401.2 seal-represents-control; Model Rules of Conduct 5.1 seal-only-under-control + 1.1 standard of care). Result:
- **Honesty gate (`pack write`): `1/1 ready, 0 need review`.** The synthetic scenario *front* is not grounded (the gate never required it to be); the gate grounds the *rubric checkpoint `sourceQuote`s*, all of which were literal substrings of the corpus. **The feared "gate adjustment for scenario cards" was unnecessary — the existing `gateCards` already does exactly the right thing.**
- **Examiner (same card): strong exemplar → Good (3/3 + bonus); trap answer ("generous fee, tight schedule, another firm did it → seal it") → Again (0/3).** Full loop — synthetic scenario + honestly-grounded reasoning + reasoning-graded — proven on the real engine.

**What actually remains (the real next build):**
- A **principle/rule corpus** from public, citable sources, assembled at scale to ground the rubric checkpoints across PcM (and beyond): **NCARB Model Law & Model Regulations, Model Rules of Conduct**, state board rules (.gov), the Guidelines, AIA public summaries, Access Board (public domain). Ethics / standard-of-care / responsible-control / risk-allocation are all publicly groundable; deeper technical content (PPD/PDD) is where public sources thin out.
- A **minor heuristic relaxation** for exemplar `back`s: the gate's proper-noun/number check on the answer is finicky for natural prose (sentence-initial title-case words like "The"/"Signing" can false-flag), so authoring the exemplar takes care today. A targeted relaxation for rubric-graded ("coverage") cards — analogous to the existing `longAnswerOk` skip — would let authors write natural exemplars. Not blocking; worked around by wording in the proof.
- **Generalize beyond ARE (user direction):** scenario-driven cards are a core companion card-kind for the whole platform (comprehension, critical thinking) — same `meta.grader: "coverage"` + `meta.rubric` mechanism, any topic.

**Build status (2026-06-08) — PcM judgment pack generated at scale.** All three remaining-build items done: (1) **principle corpus** assembled at `/tmp/recallit-sources/pcm-corpus.txt` (~5,280 words, 73 verbatim public passages: NCARB Model Law + Model Regulations + Rules of Conduct + Guidelines PcM + public delivery-method/business-structure refs; ASCII-normalized for substring grounding; thin spots — CM-at-Risk, insurance specifics, fee mechanics — flagged, they live in copyrighted prep texts); (2) **gate relaxation** shipped (`gateCards` skips the number/proper-noun heuristic for checkable items — `back` is an exemplar, the rubric is the grounding contract; +2 tests, suite green); (3) **generation**: `pack` over the corpus with judgment-card scope produced **22/22 ready, 0 held** ($1.14) — DECODE 7 / TRAP 9 / PRINCIPLE-SELECTION 6 across S1–S4. Quality high (e.g. a Rule 3.5 card nails the refuse→report→terminate sequence + distinguishes design-phase vs construction-site safety). Grading spot-checked: strong→Good, trap→Again on generated cards. Draft at `packs/pcm-corpus` (uncommitted; id needs rename → `are-pcm`). **Next: rename+keep+install, then scale to remaining PcM depth + PA; commit the gate change + pack.**

## The enabling fact (architecture)

All per-user state is scoped by **one process-global env var** `RECALLIT_DATA_DIR` (`src/paths.ts:6`). That's a gift *and* a footgun: you can't set it per-request in one shared process without concurrent users cross-reading each other's data. **Subprocess-per-session** turns that footgun into a spawn-time `env` set — cross-tenant leakage becomes structurally impossible **and** it double-jails the dangerous author agent (which can run shell/git/npm), all with near-zero engine surgery.

## Architecture — `recallit-onebox` (workflow score 27, highest; unchanged by the licensing pivot)

One **Fly.io** `shared-cpu-1x` Bun app + one persistent **Fly Volume** at `/data`. Front-door server owns auth + WS upgrade; **each review/voice/generation session runs in a `Bun.spawn` child** with `RECALLIT_DATA_DIR=/data/users/<uid>` and the relevant key injected; parent proxies WS frames.

- **Stack:** Bun + `bun:sqlite` (native) · Claude Agent SDK (sonnet-4-6 as-built) · magic-link auth (HMAC cookie, no OAuth vendor) · Fly secrets · Stripe (for license purchase + optional credit packs).
- **New files:** `src/hosted/{server,session-worker,auth,users,license}.ts`, `src/packgen/worker.ts` (egress-jailed), `Dockerfile`, `fly.toml`, `scripts/migrate.ts`. Engine stays near-untouched (keys + `dataRoot` already env-driven; `RECALLIT_NO_INSTALL` already 403s install).
- **What the BYO-key default removes from the critical path:** with each user's own key paying for their tokens, the painful managed-key solvency machinery (credit ledger, per-user monthly spend caps, voice-margin firewall) becomes **optional** — needed only for the credits on-ramp, not for launch. The author **sandbox** and **tenant isolation** still matter regardless (security, not cost).
- **Key handling:** the user's Anthropic/voice key is stored encrypted at rest and injected into their session subprocess via per-call `options.env` (verified: the SDK takes key + cwd per call), never widening blast radius to other tenants.
- **Grafts kept:** egress-locked author worker (block `169.254.169.254` + all RFC1918 — metadata/SSRF defense). **Dropped:** the per-user-Machine / scale-to-zero fleet (6–9 weeks of over-build; grow into it by sharding uids across N oneboxes when concurrency actually bites).
- **Fixed infra is rounding error:** ~$10–15/mo at 100 users, ~$30–50/mo at 1000. With BYO-key, recallit's variable cost ≈ $0 (only the optional managed-credits users incur token cost, which their credits cover).

## Monetization — license + BYO-key (no subscription, no feature tiers)

The whole product is the product. You don't unlock features by plan; you buy a license to **run** recallit (our box or yours), and you bring your own key for model usage.

| Thing | Shape | Notes |
|---|---|---|
| **Free / try** | Keyless demo + bundled packs, study forever | The demo must show **real AI meaning-grading** on a tiny capped budget (see correction below), not the lexical grader — that *is* the aha. |
| **License** | **One-time ~$149 lifetime** *or* **annual ~$79/yr** (pick one model — open question) | Unlocks the full hosted app (or a self-host entitlement). All features, all 3 flagships, BYO-key. No tiers. |
| **Model usage** | **BYO-key (your spend, $0 to recallit)** — default | Consistent with "your keys, your files, your spend." Serves ARE/prosumer/power users who'll happily paste a key. |
| **Managed-key credits** | Optional **pay-as-you-go** (no subscription), at cost + margin, never expire | The on-ramp for normal users without a key. Buy tokens when you use them. This is the *only* metered surface, and it's opt-in. |
| **Catalog** | recallit's own curated flagship packs (ARE / Spanish / starters) | Seeded in-house (supply is automatable). Third-party creator marketplace deferred indefinitely. |

**Why a license fits the user's intent:** revenue doesn't depend on metering usage or on chasing only-lucrative packs, so ARE / Spanish / BYO stay *equal* flagships chosen on merit. No churn-management treadmill, no "unlimited-ish vs hidden wall" brand contradiction, no enterprise sales motion.

**One-time vs annual (the open trade):** one-time ($149) is the cleanest "indie app you buy" feel and matches "forget monthly," but yields *lumpy, non-recurring* income and an open-ended support/hosting obligation for a single payment. Annual ($79/yr) is still license-shaped (not usage-metered SaaS), matches the "recurring license" the user floated, funds ongoing hosting/updates, and is near-pure margin under BYO-key. **Recommendation: annual license** (or a hybrid: one-time lifetime *self-host* license + a small annual for *managed hosting/updates*). Decide in Q1.

## Economics — trivially positive, because that's the point of BYO-key

- **recallit COGS under BYO-key ≈ $0** (user's key pays for generation + grading + voice). Fixed infra ~$10–50/mo total.
- **Reference token costs** (for the optional credits pricing, verified against source): generate a pack ~$0.18 ($0.10–0.40, `$1` cap); text daily session ~$0.25; voice adds $0.55–0.80 as-built. Price managed credits at cost + ~30–50%, never-expiring, no subscription.
- **"Some money" math, not a $10k-MRR mandate:** annual $79 × ~127 active licenses ≈ $10k/yr recurring (~$835/mo); one-time $149 × ~67 sales ≈ $10k one-off. With ARE's premium WTP a higher price or modest volume gets there comfortably — but the point is *this is a bonus*, and the architecture makes any of these break-even-trivial because there's no per-user token burden on recallit.
- COGS levers (prompt-cache grading prefix, Haiku grading, mp3 reuse, char-cap TTS) now matter only to make the **optional credits** cheaper/more competitive and to keep *the user's own* BYO bill low (a product nicety) — not as a solvency gate.

## Hosted + self-host — unified by the license, not two products

Same licensed artifact; you choose **where it runs**. **Hosted** = our box, convenience, you still bring your key (or buy credits). **Self-host** = run the same Docker image yourself, your key, your disk. The license is what you buy either way; hosting is a convenience the license (annual) or a small add-on covers. No cannibalization to engineer because there's no managed-key-subsidy to protect — BYO-key is the default everywhere.

## ⚠️ Corrections still standing (from the adversarial verify)

1. **Free-demo factual error to fix:** the keyless demo (`scripts/serve-local.ts`) uses **lexical** grading (`src/evaluate.ts`), *not* AI grading — so the funnel currently leads with the deliberately-*worse* grader. The buyer's entire reason to choose recallit over Anki is "it grades my *understanding*." **The demo must show real AI meaning-grading** (tiny capped budget). Highest-leverage fix; do it early.
2. **Author sandbox + tenant isolation are non-negotiable before public hosting** — these are *security*, independent of the pricing model. Egress-jail the author worker; restrict hosted source kinds to `url|concept|file` (no git/npm — RCE surface).
3. **Single shared key only matters for the credits on-ramp** — under BYO-key there's no shared-key rate-limit/blast-radius problem, since each user's session uses their own key. Only the managed-credits path needs a key pool; defer until that path has real load.

## Sprint plan (plan only — no code until "go")

**Sprint 0 — Sharpen the flagships + fix the demo (no hosting yet).** Generate/clean real flagship packs from real source material: an **ARE** pack from official reference material, polish the **Spanish/RGV** pack, and a **BYO** example (a book/PDF). Make the public demo show **real AI grading**. This is the product-first work and it dogfoods the author agent. → validates: three credible flagship packs exist; demo grades understanding, not lexical match.

**Sprint 1 — Tenancy spine + auth + license.** Cross-user no-leak test is the gate.
- `src/hosted/session-worker.ts` — `Bun.spawn` entry reading `RECALLIT_DATA_DIR` + the user's key from env → calls existing session → validates: two workers (`/data/users/A`, `/data/users/B`) concurrently read only their own topics.
- `src/hosted/server.ts` — front-door `Bun.serve`: SPA + WS upgrade, spawns + proxies a worker per authed connection → validates: two browser sessions (different uids) study at once, no cross-read.
- `src/hosted/auth.ts` (magic-link, HMAC cookie) + `src/hosted/users.ts` (`users(uid,email,license,key_enc,...)`) → validates: signup → email link → cookie → `/ws` resolves uid → data dir; survives restart.
- Regression test + comment forbidding per-request mutation of `process.env.RECALLIT_DATA_DIR` (the footgun guard).
- `src/hosted/license.ts` + Stripe checkout (one-time **or** annual per Q1) → validates: purchase → webhook sets `users.license` → full app unlocks.

**Sprint 2 — BYO-key flow + author sandbox (safe to open).**
- Encrypted per-user key storage + injection into the session/author subprocess via `options.env` → validates: user pastes key → their sessions use it → key never reaches another tenant's process.
- `src/packgen/worker.ts` — hosted-safe author: scratch under user dir, `RECALLIT_NO_INSTALL=1`, `SourceKind` restricted to `url|concept|file` → validates: URL/PDF source works; git/npm rejected.
- Fly egress allowlist for the packgen namespace (allow `api.anthropic.com` + curated doc hosts; **deny `169.254.169.254` + RFC1918**) + adversarial test → validates: worker can't reach metadata/internal IPs; legit doc fetch works.
- *(Optional, can defer)* `src/hosted/credits.ts` — pay-as-you-go managed-key credits + usage ledger + pre-flight balance gate → validates: credit user generates a pack; balance debits real `costUsd`; drained → friendly top-up prompt.

**Sprint 3 — Deploy + harden.**
- `Dockerfile` (oven/bun) + `fly.toml` (one `shared-cpu-1x`, `[mounts]` volume at `/data`, Fly secrets) → validates: `fly deploy` succeeds; volume persists across restart (FSRS history intact).
- Volume snapshot cron + documented **restore runbook** (single volume = SPOF) → validates: snapshot → restore into fresh volume → data dir intact.
- Point marketing at the 3 flagships + the license; demo → buy → first graded session end to end → validates: full path works.

## Out of scope
Monthly SaaS subscriptions + feature tiers (explicitly dropped) · pack marketplace / creator economy (seed own catalog first) · per-user Machines / scale-to-zero fleet · `Ctx`/`dataRoot` threading refactor (subprocess is the smaller v1 diff) · per-minute voice metering · git/npm source kinds on hosted (RCE surface) · managed-key credits as the *default* (BYO-key is default; credits are an optional on-ramp) · CCAT as a flagship (supported, not showcased).

## Open questions
1. **License model: one-time (~$149 lifetime) or annual (~$79/yr)?** Recommendation: annual (sustainable, funds hosting, matches "recurring license"), or a hybrid (one-time self-host + small annual for managed hosting). This is the main decision left.
2. **Do we ship the managed-key credits on-ramp at launch, or BYO-key only first?** BYO-key-only is simpler and serves ARE/prosumer well; credits widen reach to non-key users but add the metering machinery back (optional). 
3. **Third exemplar alongside ARE + Spanish + BYO?** Keep CCAT as "supported," or swap in a source-heavy exam (PE/bar/CFA) that better shows the comprehension edge?
4. **ARE source material** — what official/reference material seeds the flagship ARE pack, and any licensing/IP constraints on it?
5. Grading on Haiku wholesale vs Haiku-with-Sonnet-fallback — affects the user's own BYO bill + credit pricing vs the valid-paraphrase accuracy that *is* the differentiator.
6. Backup/DR cadence + RPO for the single volume (daily snapshots vs sub-hour)?
