# Design: one-click, seamless self-host onboarding

> Status: proposed scope (multi-agent design pass, 2026-06-08). Goal: collapse "I want this" → "I'm doing my first review" to the fewest steps **without** betraying local-first / your-keys / your-files / no-SaaS. Sits under the [hosted-product](hosted-product.md) guardrail — thin presentation/UX shell over the existing engine, no engine rewrite, no multi-tenancy.

## The core insight (load-bearing)

**Default-defer the BYO-key wall — never hide it.** The hardest friction is `ANTHROPIC_API_KEY`. But the keyless driver in `scripts/serve-local.ts` already grades **real due cards** through the **real engine** (`evaluateAnswer` + `reviewCard` over `getDueCards`, only STT/TTS stubbed) — it is *not* a replay like the recorded marketing demo. So a brand-new user can reach a **genuinely, honestly graded first card with zero key and zero spend.** The key becomes an *opt-in upgrade* (AI tutor + voice), introduced once, only when reached for. This single mechanism is grafted into every path.

This is a **net honesty improvement** over today's funnel (which fails confusingly deep inside the agent loop when the key is missing).

## Recommended onboarding

> One command, one Enter, one typed answer to a real graded card.

**Primary — terminal user:** `bunx @waits/recallit start`
1. Prints the promise: *"your cards are files on your disk; no account, no cloud, nobody (including us) can change your grade."*
2. Detects missing key → offers **[1] keyless honest review (Enter default, $0)** / **[2] paste Anthropic key for tutor + voice (~$1/pack, your spend)**.
3. On Enter: seeds bundled `spanish-mx-rgv` into `~/.recallit` (audio bundled, no key) → picks a free port → boots keyless SPA → auto-opens browser **and** prints URL.
4. SPA Home shows **real** due counts (`/api/packs` + `/api/progress`); click pack → type answer → `evaluateAnswer` grades, `reviewCard` persists to disk.

**= 1 command + 1 Enter + 1 click + 1 typed answer.** Zero key, zero clone, zero config. (Today: ~7+ steps.)

**Secondary — no-terminal user:** one **"Deploy on Railway"** button (README/marketing)
- Friendly form: key field is *optional* ("leave blank to start in keyless mode"); `RECALLIT_DATA_DIR=/data`, `RECALLIT_NO_INSTALL=1`, and a **persistent Volume at `/data`** pre-declared + hidden.
- Idempotent `scripts/boot.ts` entrypoint seeds a pack into empty `/data`, then mode-switches by env (keyless server when no key; keyed voice when present — so an empty-key deploy **cannot** error at first turn).
- HTTPS URL → seeded pack already due → type an answer → honest grade persisted to **your** volume. ~6 taps, zero terminal, zero Bun install. "Download my data" keeps it lock-in-free.

**Key-wall UX (both paths):** validate `sk-ant-` prefix locally (no network); hold in-process for the session; write to `~/.recallit/.env` only on explicit y/n consent ("stays on your disk"). Cost line shown **exactly once**, at the opt-in branch. Voice (`ELEVENLABS_API_KEY`) is a further opt-in line — replacing today's mid-session "ELEVENLABS_API_KEY not set" WS failure.

**Two honest caveats, printed not buried:**
- Keyless grading is **lexical** (`src/evaluate.ts` = levenshtein + token-jaccard w/ accent/case normalization) → valid paraphrases can grade *Again*. Framed: *"free grading checks your words literally; the AI tutor grades by meaning."*
- Auto-seeding Spanish imposes an identity on a topic-agnostic engine → framed as *"a 30-second sample — run `recallit pack <your source>` to build your own."*

## Why this shape (decisions)

- **Primary = `recallit start`** (panel score 32, highest): lowest-prerequisite true one-command feel; respects every hard constraint. Its only weakness is build effort — and that effort is a **small, verified set of gating fixes**, not theory.
- **Secondary = Railway button** (score 28): the *only* option serving the no-terminal half over TLS (voice/PWA can work later), reusing the identical keyless server + SPA.
- **Dropped — Docker one-liner** (reach 4): Docker is itself a heavy prerequisite for non-technical users. Kept only as the *substrate* the Railway button builds on.
- **Folded in — "upgrade, don't restart"** demo→own funnel: becomes the framing of the secondary path, not a separate build.

## Verified gating facts (must fix before any of this works from npm)

- `package.json` `files` is literally `["src"]` → published `@waits/recallit@0.2.0` ships **no `public/`, no `packs/`**. The one-liner is vapor until this changes.
- `src/paths.ts` defaults to `cwd/data` → under `bunx` every run from a different dir gets throwaway history; **silently breaks FSRS persistence** (the core value) until it defaults to `~/.recallit`.
- The keyless driver lives in `scripts/serve-local.ts` (unpublished) → must be promoted into `src/`.

## Sprint plan

**Sprint 1 — Make the published package actually shippable** (demoable: `npm pack --dry-run` shows assets; reviews persist across runs from two cwds)
- [ ] `package.json` `files`: `["src"]` → `["src", "public", "packs/spanish-mx-rgv"]` → validates: `npm pack --dry-run` lists `public/*` + `packs/spanish-mx-rgv/` incl. mp3s.
- [ ] `src/paths.ts:6` default `cwd/data` → `join(homedir(), ".recallit")` when `RECALLIT_DATA_DIR` unset (keep override) → validates: run CLI from two dirs, no env set, review persists to same `~/.recallit`.
- [ ] Promote keyless driver → `src/serve-local.ts` exporting `startKeylessServer()` (reuse `startServer`, `evaluateAnswer`, `getDueCards`, `reviewCard`); make `scripts/serve-local.ts` a thin re-export → validates: `bun run serve:local` still boots + grades a typed answer; import resolves.

**Sprint 2 — Terminal one-command onboarding** (demoable: `bunx @waits/recallit start` → Enter → browser opens to seeded pack → type answer → real graded receipt, keyless)
- [ ] `src/start.ts`: promise banner; detect key; `prompt()` keyless-vs-key (Enter=keyless); on key branch validate `sk-ant-` + optional `.env` persist on y/n; seed pack via `installPack` (resolve via `import.meta.dir`) if no topics; free port; boot keyless/keyed server; auto-open via `Bun.spawn` of open/xdg-open/start **and always print URL** → validates: clean `~/.recallit` seeds, opens, grades; headless still prints URL + serves.
- [ ] `src/cli.ts`: add `start` case to `main()` switch; list `start` first in USAGE → validates: `bun run cli start` runs wizard; USAGE shows it first.
- [ ] `install.sh` (served as `recallit.sh`): install Bun via official script only if missing, then `exec bunx @waits/recallit start`; README leads with `bunx @waits/recallit start` (+ explicit two-step) → validates: documented path reaches first review; README no longer dead-ends at dev flow.
- [ ] **Publish new version** (irreversible — after S1+S2 land) → validates: from empty dir, `bunx @waits/recallit@latest start` seeds, opens, grades.

**Sprint 3 — No-terminal one-click (Railway)** (demoable: click button → deploy → open URL → type answer → redeploy → history survived)
- [ ] `/Dockerfile` (`oven/bun:1`, `RUN bun install --frozen-lockfile`, `ENV RECALLIT_DATA_DIR=/data`, `ENTRYPOINT bun run scripts/boot.ts`) + `/.dockerignore` → validates: `docker build` + `docker run -v recallit-data:/data` boots keyless SPA, no keys.
- [ ] `scripts/boot.ts`: idempotent — seed pack if `/data` empty (`RECALLIT_SEED_PACK` override); mode-switch keyless-vs-keyed by env presence → validates: first run seeds, second skips; no-key WS loop grades typed answers with no first-turn error.
- [ ] `/railway.json`: Dockerfile build, Volume at `/data`, single instance, optional key vars w/ descriptions + defaulted `RECALLIT_DATA_DIR`/`RECALLIT_NO_INSTALL=1`; add **Deploy on Railway** button + 3-line blurb to README/marketing → validates: button creates deploy w/ volume + optional-key form; empty-key deploy reaches graded review; key paste + redeploy enables tutor, history intact.
- [ ] Replace terminal-pointing empty state (`public/index.html:239`) with first-run banner; add `scripts/export-data.ts` + SPA "Download my data" (tgz of `RECALLIT_DATA_DIR`) → validates: fresh deploy never shows CLI empty-state; export returns tgz w/ `topics/` + `review_log.jsonl`.
- [ ] Verify persistence: review → redeploy → confirm `review_log.jsonl` + FSRS due dates survived; document single-instance/no-autoscale warning → validates: post-redeploy card shows scheduled next-due.

## Out of scope (v1)
Interactive client-side grading of the recorded marketing demo · Cloudflare Containers (no persistent POSIX disk for `bun:sqlite`) · Render/Fly buttons (Railway is canonical first; others follow once Dockerfile + `boot.ts` exist) · PWA install/offline polish (SW https guard, PNG icons) · local reminder scheduler · auth/shared-secret gate on the Railway URL (single-user framing sidesteps for v1 — see open questions) · multi-pack seeding + arbitrary in-app install on shared deploys (keep `RECALLIT_NO_INSTALL=1`) · desktop wrapper (Tauri/Electron).

## Open questions
1. **Auto-seed identity:** ship `spanish-mx-rgv` as the default first review (labeled 30-sec sample), or have `start` prompt for a source on first run?
2. **`curl | sh` installer:** lead with it (the exact trust ask a privacy audience may reject), or lead with explicit `bun.sh/install` + `bunx` two-step and treat the pipe as a documented convenience?
3. **Railway URL has no auth** — with BYO keys a leaked URL can spend the deployer's Anthropic/ElevenLabs budget over `/ws`. Is single-user framing + a documented warning enough for v1, or is a shared-secret gate mandatory before the button ships? *(Panel flagged this as the secondary path's gravest risk.)*
4. **Volume export portability:** is there a documented re-import / move-Railway→laptop path so FSRS history isn't lost?
5. **Key persistence consent:** confirm default is in-session-only with explicit opt-in; `.env` gitignored everywhere.
6. **Keyless lexical-grade gap:** is the printed caveat enough, or should the first keyless card be chosen to grade cleanly under lexical matching?
