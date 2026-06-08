# Fresh-session kickoff: close the product gap (one-click onboarding + hosted/self-host)

> Paste this whole file as the opening prompt in a fresh session (or say "read docs/design/kickoff-onboarding-hosted.md and start"). It is self-contained.

## Mission

Turn recallit's **product-side** (currently plan-only) into working software, in two tracks:
1. **Self-host one-command onboarding** — `bunx @waits/recallit start` → first graded review in one command, no clone/config, keyless review by default.
2. **Hosted recallit** — the `recallit-onebox` shell (one Fly box, subprocess-per-session tenancy, magic-link auth, **annual license + BYO-key**) so a normal user can sign up and study without self-hosting.

Both reuse the **same engine artifact**; hosted is that artifact + a thin `src/hosted/` layer. Do NOT rebuild the engine.

## Read first (source of truth — already written + committed)

- `docs/design/oneclick-onboarding.md` — the self-host one-command onboarding scope (Track 1).
- `docs/design/hosted-and-pricing.md` — hosted architecture (`recallit-onebox`, subprocess-per-session), the **annual license + BYO-key** model, flagships (ARE + language), and the validated **scenario-card** pedagogy.
- `ARCHITECTURE.md`, `docs/internals.md` — how the engine works.

## Locked decisions (do not re-litigate)

- **Monetization = annual license (~$79/yr) + BYO-key.** No monthly SaaS, no feature tiers. **BYO-key only at launch** (managed-key credits are deferred — do NOT build the credit ledger / metering now).
- **Hosted is the default for normal users; self-host stays for power users.** Same artifact, you choose where it runs; always BYO-key (no managed-key subsidy → nothing to cannibalize).
- **Tenancy = subprocess-per-session** (`Bun.spawn` child with `RECALLIT_DATA_DIR=/data/users/<uid>` + the user's key in `env`). This sidesteps the process-global `dataRoot()` footgun (`src/paths.ts`) with ~zero engine change. Do NOT thread a `Ctx` through `paths.ts`/`db.ts` (deferred).
- **Local-first / "no one can change your grade" is NOT a marketing constraint** — deterministic grading is a real feature, not a wedge. Don't agonize over it.
- **Flagships = ARE + language only.** CCAT dropped. `packs/are-pcm` (22 scenario cards) and `packs/spanish-mx-rgv` exist.

## Current state (as of 2026-06-08)

- Published **`@waits/recallit@0.3.0`** (Bun-only; `bin: recallit` → `src/cli.ts`; tarball ships `files: ["src"]` only).
- Engine green: 144 tests, tsc + biome clean.
- `gateCards` now supports **scenario/judgment cards** as a first-class kind (`meta.grader: "coverage"` + `meta.rubric`; the synthetic front isn't grounded, the rubric checkpoints are). Proven end-to-end (gate + examiner) and generated at scale (`packs/are-pcm`).
- ⚠️ The npm token was exposed in chat — confirm it's been rotated before any publish.

## Track 1 — self-host one-command onboarding (do FIRST; small, high-value)

Pulled from `oneclick-onboarding.md`. Goal: `bunx @waits/recallit start` → keyless first review, browser auto-opens.

**Sprint A — make the published package actually runnable**
- [ ] `package.json` `files`: `["src"]` → `["src", "public", "packs/spanish-mx-rgv"]` → validates: `npm pack --dry-run` lists `public/*` + the starter pack incl. audio.
- [ ] `src/paths.ts` `dataRoot()` default `cwd/data` → `join(homedir(), ".recallit")` when `RECALLIT_DATA_DIR` unset (keep override) → validates: run a CLI verb from two dirs, no env set, review persists to the same `~/.recallit`.
- [ ] Promote `scripts/serve-local.ts` → `src/serve-local.ts` exporting `startKeylessServer()` (reuse `startServer`, `evaluateAnswer`, `getDueCards`, `reviewCard`); keep the script as a thin re-export → validates: `bun run serve:local` still boots + grades a typed answer.

**Sprint B — the `start` wizard + publish**
- [ ] `src/start.ts`: promise banner → keyless [Enter default] vs paste-key → seed `spanish-mx-rgv` into `~/.recallit` if no topics → free port → boot keyless SPA → auto-open browser AND print URL. → validates: clean `~/.recallit` seeds, opens, grades; headless still prints URL.
- [ ] `src/cli.ts`: add `start` case to `main()`; list it first in USAGE.
- [ ] README leads with `bunx @waits/recallit start`. Publish a new version. → validates: from an empty dir, `bunx @waits/recallit@latest start` reaches a graded review.

## Track 2 — hosted recallit-onebox Sprint 1 (tenancy spine + auth + license)

Pulled from `hosted-and-pricing.md`. Cross-user no-leak test is the gate. **BYO-key only; no credits/metering.**
- [ ] `src/hosted/session-worker.ts` — `Bun.spawn` entry reading `RECALLIT_DATA_DIR` + the user's key from `env`, runs the existing session → validates: two workers (`/data/users/A`, `/data/users/B`) concurrently read only their own topics.
- [ ] `src/hosted/server.ts` — front-door `Bun.serve`: SPA + WS upgrade, spawns + proxies a worker per authed connection → validates: two browser sessions (different uids) study at once, no cross-read.
- [ ] `src/hosted/auth.ts` (magic-link, HMAC cookie) + `src/hosted/users.ts` (`users(uid,email,license,key_enc,...)` in bun:sqlite) → validates: signup → email link → cookie → `/ws` resolves uid → data dir; survives restart.
- [ ] Regression test forbidding per-request mutation of `process.env.RECALLIT_DATA_DIR` (the footgun guard).
- [ ] `src/hosted/license.ts` + Stripe **annual** checkout → webhook sets `users.license` → full app unlocks → validates: test-mode checkout unlocks the app.
- [ ] Encrypted per-user key storage + injection into the session/author subprocess via `options.env` → validates: a user's key reaches only their own subprocess, never another tenant's.
- [ ] `src/packgen/worker.ts` (egress-jailed author: scratch under user dir, `RECALLIT_NO_INSTALL=1`, source kinds `url|concept|file` only — no git/npm RCE) + Fly egress allowlist (deny `169.254.169.254` + RFC1918) → validates: URL/PDF source works; git/npm rejected; worker can't reach metadata/internal IPs.
- [ ] `Dockerfile` (oven/bun) + `fly.toml` (one `shared-cpu-1x`, volume at `/data`, Fly secrets) + snapshot/restore runbook → validates: `fly deploy`; volume persists across restart (FSRS history intact).

## Guardrails

- Reuse engine primitives verbatim (`/ws`, `/api/progress`, `/media`, FSRS, turn machine, graders). No engine rewrite.
- BYO-key everywhere; do NOT build managed-key credits/metering/billing-by-usage yet.
- No monthly subscriptions, no feature tiers.
- Don't ship copyrighted source corpora; flagship packs cite SHORT verbatim public excerpts only.
- Run `/check` before committing; commit in logical units (no "sprint/phase/plan" in commit messages).

## Recommended starting point

Track 1 Sprint A (3 small, reversible fixes that make the published package actually work end-to-end). Then Track 1 Sprint B (the `start` wizard) so self-host is genuinely one command. Then Track 2 Sprint 1. Confirm scope with the user before the hosted Stripe/auth work.

## Open questions to confirm with the user

1. Track order — onboarding (Track 1) fully first, or interleave with hosted Track 2?
2. Annual price point ($79/yr assumed) + is there a one-time self-host option alongside annual managed hosting?
3. Magic-link email provider (Resend/Postmark/SES?) for hosted auth.
4. Confirm the npm token was rotated before the Track 1 Sprint B publish.
