# Design: hosted product + multimodal touchpoints

> Status: proposed roadmap (from a competitive teardown of pdf-to-interactive-lesson + a multi-agent product scope, 2026-06-06). Decisions 1–4 are RESOLVED (below). Written as a fresh-session handoff — start at **Phase 0**.
> Guardrail for the whole doc: **we are NOT rebuilding the engine and NOT becoming a SaaS.** Every move is a thin presentation / product / UX-DX layer over what already exists, kept topic-agnostic and agent-native. If a task requires threading state through `paths.ts` / `topic.ts` / `store.ts` or adding Postgres/Redis/auth, it's out of scope for v1.

## Positioning — why we win a different game

pdf-to-interactive-lesson (pdftolesson.com, github.com/Nutlope/pdf-to-interactive-lesson) is a polished **course generator**: drop a PDF → a 3-module interactive course (lessons + quizzes) in minutes. It nails the first 60 seconds. But it's a **one-shot artifact** — PDF-only, text-only, no scheduling, no grading, no provenance, single-provider, and heavy to self-host (Postgres + Redis + Blob).

recallit is a **retention engine**. Our wedge — four things they structurally cannot fake:
1. **Honest by construction** — every card cites a verbatim source quote; the deterministic gate holds back what it can't verify (not the model's good mood).
2. **Deterministic, code-owned grading + FSRS-6 scheduling** the agent can never fudge.
3. **Topic-agnostic packs** — any source in (PDF/URL/repo/concept), a portable installable pack out; the same product scales to any subject with zero code.
4. **Multimodal voice that already works** — voiced cards, push-to-talk, shadowing/roleplay/converse. A text-and-quiz tool literally cannot show this.

**Positioning line:** *"Drop a source. Get an honest pack. Practice it forever — hands-free if you want."*

Steal their instant-aha and shareability; beat them on **retention, honesty, and voice**.

## Decisions (resolved)

1. **Release path → publish to npm.** Drop `private: true`, sort the `bin → ./src/cli.ts` entry under Bun, publish so `bunx recallit ...` works for an outside visitor. This unblocks the whole one-command-install marketing story. *(Until published, marketing keeps the working `bun install` + `bun run cli` lines.)*
2. **Public demo → rate-limited on the maintainer's keys.** A hosted sandbox running on our `ANTHROPIC`/`ELEVENLABS` keys behind a **hard rate-limit + abuse guard** is acceptable. (Self-host-with-your-own-keys remains the real model.)
3. **Export privacy → opt-in per pack, never auto-published.** `pack export` produces a self-contained static HTML; it must be explicit per pack and never upload anywhere recallit-owned. (The RGV pack contains personal/conversational content.)
4. **Simple v1 → "one deploy = one user" + deploy-your-own.** Defer true multi-tenancy/accounts/cloud-sync indefinitely for v1 (it's a core-seam change + the heavier v2 SaaS). Cross-device "sync" v1 = the user's own git/Dropbox of `RECALLIT_DATA_DIR` (engine rebuilds SQLite from files).

Remaining open question: the **VAD "feel bar"** for Free Mode v2 (acceptance test for barge-in / false-endpoint tolerance on a real phone in a noisy kitchen) — set before investing in the listen-loop.

## What to adopt from the competitor (honestly)

- **Source-first hero** — but as a **recorded filmstrip** of `recallit pack <source>` (showing the honesty-gate verdict + the verbatim source-quote chip), NOT a fake live input box. Live generation is a real keyed LLM loop (`src/packgen/author.ts`); faking it would betray the honesty brand.
- **"Try without your own file" — and ours SPEAKS.** A static demo loading the bundled RGV pack (`cards.json` + existing `/media` native.mp3) into a flip-and-listen page. Zero keys, zero server. **Highest-leverage adopt — they can't play audio.**
- **Surface the honesty gate as a named "Verify" stage** ("38/41 ready, 3 held — quote-not-in-corpus"). `gateCards` already returns machine reason codes. The one thing competitors can't fake.
- **Shareable artifact as the growth loop** → `recallit pack export <id>` = one self-contained static HTML (cards + base64 audio + a `topic add github:...` install footer). Files-as-truth; no recallit-owned registry/moderation.
- **Retention-first 3-step** — "Drop a source → Get an honest pack → Practice it forever (it comes back before you forget)." The third step is the hook they have no answer to.
- **Credibility borrow** — a "Built on the Claude Agent SDK / FSRS-6 / Open source" strip + a real GitHub star CTA.
- **Drop their billing/quota model** — contradicts local-first / BYO-key.

## Multimodal touchpoint map

| Touchpoint | Experience | Reuses (no engine change) | Thin new layer |
|---|---|---|---|
| **Laptop / desktop** | Branded SPA: pack gallery, flip-card review, phase rail (shadowing→review→roleplay→reflect), streak/danger-zone panel, push-to-talk or text. | `/ws` turn protocol, `/api/progress`, `/media`, deterministic turn machine + FSRS, marketing brand tokens (`marketing/styles.css`, `tokens.css`). | static branded SPA over existing routes — pure presentation. |
| **Audio-only "Free Mode" 🎧 — FLAGSHIP** | AirPods in, phone in pocket: tap once, then talk. Agent narrates due cards + roleplay; you answer aloud; engine grades + reschedules silently. Spoken meta-intents ("repeat", "slower", "skip", "switch to English", "end"). Pack-driven + agnostic (non-voice packs degrade to spoken Q&A). | The card-less **`converse`** turn (`src/agent.ts`) + the modality-parameterized daily regimen — already the "no card, no grade" primitive. STT/TTS provider interfaces + WS wire format unchanged. | **v1:** "tap to talk, screen on" as a second MODE of the client (ships over existing `/ws` now). **v2:** browser **VAD listen-loop** (continuous mic + barge-in + endpointing) — the one load-bearing new piece, gated on the feel bar. |
| **Mobile / installed PWA** | Home-screen icon, touch review + voice, nothing installed. "Practice" (push-to-talk) or "Free Mode" (hands-free). | same SPA + `/ws` + `/media`; install resolvers for one-tap pack add. | PWA shell (manifest + service worker) — **gated on a real deploy existing**; iOS Safari background-mic constraints verified on device before promising screen-off. |
| **Phone lock-screen / re-engagement** | "12 cards due — 4 min, hands-free?" notification deep-links into Free Mode; Media Session API = lock-screen transport (play/pause/skip) running the session like a podcast. | FSRS due-count already computed on-request (`progress.ts`); the `converse` session is the playback. | **v1:** local cron-style trigger reading `dueNow` → local OS notification (validates the loop, no Web Push/hosting). Web Push = fast-follow after hosting. Honest: a background scheduler is new work. |
| **Video / talking-head** | (avatar lip-synced to TTS) | almost nothing | **EXPLICITLY DROPPED** — high cost/latency/uncanny-valley, low engine leverage. "Three faces that reuse one WS loop" beats five. |

**Free Mode honesty guardrail (load-bearing):** a low-confidence/empty transcript must trigger a spoken *"I heard X — right?"* confirmation in the **client + prompt** (reuse the existing `sttRetried` one-retry pattern) — **NEVER** a new `TurnPhase` or any change to `turn.ts` `respond()`/`reveal()` gating, or an empty STT result silently grades a card "Again."

## The hosted shell — deliberately thin

**Hosted == self-host == one codebase.** Deploy model: "one deploy = one user" — a public rate-limited sandbox (decision 2) + a **"deploy your own" Railway/Fly/Render button** (far lighter than their 4-service stack — Bun-only, files-as-truth, no Postgres/Redis/Blob). The shell is exactly three things, all over `src/server.ts`:

1. A **branded multi-route SPA** replacing the bare 40rem `public/index.html`, reusing the existing `/ws` (say/listen/transcript/caption/done), `/api/progress`, and `/media` **verbatim**. Routes: pack gallery · flip-card review · voice/free-mode · progress+streak · settings.
2. **Two thin HTTP routes** wrapping verified existing exports: `GET /api/packs` (list topics via `topic.ts`) and `POST /api/packs/install` (wrap `installPack` for github:/npm:/tarball one-tap install — **GitHub is the registry, no new store**).
3. A small, safe **<10-line server change**: pass `topicId` over the WS open message instead of the process-global `getActiveTopic()` (`server.ts`), so the gallery can switch decks without a global side effect.

**Explicitly OUT of scope** (SaaS, not presentation; contradicts local-first): managed/server-held API keys beyond the rate-limited demo, metering/billing, multi-tenant auth, object-storage sync, a server-side due-card cron. Forbid any new server logic beyond those two thin wrappers; the live generate-stream-to-browser endpoint is deferred (keys + spend + sandboxing anonymous uploads).

## Marketing / DX moves

- **Cleanup pass FIRST** (an afternoon, zero engine): remove the `marketing/index.html` "update the GitHub URLs before publishing" NOTE (the repo is live at github.com/ryanwaits/recallit now), confirm links, add OG cards + favicon + brand, add the credibility strip.
- **Reframe the hero around the loop + retention:** a 3-beat "generate → study → speak" filmstrip (recorded asciinema of `recallit pack` with the source-quote chip; a due card; a push-to-talk roleplay). Surface the source-quote chip from REAL recorded output, never a fake live box.
- **Static "try in 30 seconds" playground:** study→speak over the bundled RGV pack — tap a card (`cards.json`), hear `native.mp3`, see a precomputed deterministic grade + `previewSchedule` next-interval as static JSON. Real engine OUTPUT, zero keys, zero server. (Drop the "generate" beat from the playground — it needs a live LLM loop.)
- **Thin CLI sugar** mapping 1:1 to marketing claims (wrappers, no engine change): `recallit quickstart` (compose `topic add` + `daily`), `recallit pack share <id>` (print the `resolve.ts` install string + URL), `recallit pack export <id>` (self-contained static HTML, opt-in per decision 3).
- **Docs glow-up:** the 8 guides in `docs/guides/` are the real onboarding asset and invisible from marketing — add a "Learn" nav surfacing them as a numbered path.
- **Honest multimodal strip:** label modalities truthfully — browser push-to-talk = real (via `server.ts`); audio-only Free Mode + PWA = "coming." Keep the kitchen-AirPods narrative as roadmap copy, never a faked demo.
- **Per-pack static page generator** (Bun script: `manifest.json`/`cards.json` → one page per pack + audio preview + honesty badge). Defer the "marketplace/directory" framing until 3+ packs exist.

## Phased roadmap (smallest valuable first)

| Phase | Goal | Deliverable | Effort |
|---|---|---|---|
| **0 — Truth & polish** | Marketing page tells the truth, looks real, leads with retention + honesty. Zero engine work. | Cleanup pass (remove the placeholder NOTE + confirm links), credibility strip, OG/favicon/brand, retention-first 3-step copy, recorded asciinema casts (generate/review/daily), "Learn" nav over the 8 guides. | S |
| **1 — Honest static demo** | A visitor experiences real engine output and HEARS it — zero install/keys/server. | Static study→speak playground over the bundled RGV pack; recorded "generate" filmstrip with the source-quote chip; per-pack static page generator. | S |
| **2 — Release + one-command install** | The install line maps 1:1 to a command a visitor can run (decision 1). | Publish to npm (drop `private`, fix `bin`), then ship `recallit quickstart` / `pack share` / `pack export` sugar; update the install block. **Sequence: release THEN copy.** | M |
| **3 — Product shell** | A polished browser product over the existing engine; hosted == self-host. | Branded SPA replacing `public/index.html` (gallery/review/voice/progress) reusing `/ws` + `/api/progress` + `/media`; the 2 thin routes; the <10-line WS `topicId` change; a "deploy your own" button + rate-limited public sandbox (decision 2). | M |
| **4 — Free Mode (flagship), staged** | Hands-free audio-only practice from your pack (kitchen + AirPods). | **v1:** tap-to-talk mode of the existing client (ships over `/ws` now). **v2:** browser VAD listen-loop + barge-in + endpointing (gated on the feel bar); spoken confirm-before-grade in client + prompt ONLY (`turn.ts` untouched); spoken meta-intent grammar in the daily/roleplay prompts. | M |
| **5 — Mobile reach & re-engagement** | Phone + lock-screen + ambient re-engagement (gated on hosting). | PWA shell (manifest + service worker); Media Session lock-screen transport → `converse` controls; due-card notifications (local trigger first; Web Push after hosting). iOS background-audio verified on device. | L |

## Start here (fresh session)

Phase 0 is an afternoon, zero engine risk, and the highest-trust first move. Concretely:
1. `marketing/index.html` — remove the `<!-- NOTE: update the GitHub URLs ... -->` comment; the `github.com/ryanwaits/recallit` links are now correct.
2. Add the credibility strip ("Built on Claude Agent SDK · FSRS-6 · Open source"), OG/favicon.
3. Reframe the hero copy around generate → study → **practice forever**.
4. Add a "Learn" link to `docs/guides/README.md`.
Then move to Phase 1 (static study→speak demo) and the Phase 2 npm release.

## What this is NOT (keep honest)
Not a SaaS, not multi-tenant, not a managed-key billing product, not a recallit-owned content cloud, not a video tutor, not an engine rewrite. The engine is robust and done; this is the presentation/product/UX-DX shell + multimodal touchpoints around it.
