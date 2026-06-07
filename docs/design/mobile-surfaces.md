# Design: one-tap, app-like mobile surfaces

> Status: proposed (from a multi-agent exploration, 2026-06-07: map surfaces → 4 lenses → critique → synthesis). Refines [hosted-product.md](./hosted-product.md) Phase 5 (PWA/mobile/re-engagement) with a concrete, honest, reuse-first plan. Guardrail: presentation glue over the existing routes (`/`, `/ws`, `/api/packs`, `/api/packs/install`, `/media`, `?topicId`), the export template, and read-only on-disk data — no engine change. One deploy = one user; not a SaaS.

## Thesis

The honest "app on your phone" is **ONE installed PWA icon = ONE deploy = ONE user's tutor** — not per-pack installs, not native widgets, not a shared hosted app. Packs are **URL deep-links** (`?topicId=`) inside that one icon, which the server already routes per connection. The icon's job is to drop you **into a source-grounded, graded recall session** (the examiner — LLM proposes / code re-verifies the cited span — the real moat), not just flip flashcards.

Two honest tracks:
- **Track A — pack-export icon (real TODAY, zero server/keys):** the self-contained export HTML (cards + base64 audio) Added-to-Home-Screen as an offline **study-and-listen** deck. *No grading* — must be labeled "study deck, not the tutor."
- **Track B — the full voice + examiner tutor PWA:** the branded SPA installed standalone; gated on a real **https deploy + the owner's own API keys**.

## Honest platform reality (the part most "PWA tutor" pitches lie about)

- **iOS Safari has no background mic and no screen-off / locked audio capture**, and pauses PWA audio when backgrounded. The "kitchen-AirPods, phone in pocket, screen off, keep talking" Free Mode is **iOS-impossible for a web app.** Screen-on, foregrounded push-to-talk is the iOS ceiling. Android is better but still not a true always-listening mic.
- **iOS has no install prompt** — install is a manual Share → Add-to-Home-Screen, and **iOS ignores manifest `shortcuts`**, so per-pack icons on iOS are separate manual installs, not app shortcuts.
- **Web Push needs a server** (VAPID); iOS additionally needs 16.4+ *and* a manually-installed PWA. This collides with no-backend; v1 has **no reliable ambient notification**. Free-tier deploys spin down, breaking any scheduler.
- **Media Session** = lock-screen play/pause/skip for TTS *playback* while audio is alive — **not** background answer-capture, **not** a screen-off workaround. Android-first.
- **"Installed" ≠ offline tutor.** The SW caches only the shell; voice + examiner need the server + keys online. The examiner + STT/TTS cost real money per session on the owner's deploy — the icon is free, the conversation is not.

## Surface map

| Surface | What it is | Platform reality |
|---|---|---|
| **Pack-export icon** (Track A, today) | Export HTML A2HS'd as an offline study-and-listen deck (no voice, no grading) | Both platforms; iOS = manual Share→A2HS. Label "study deck, not the tutor." |
| **Primary tutor PWA icon** (Track B, gated) | The branded SPA installed standalone → gallery → push-to-talk + examiner grading over `/ws` | Android: real install banner. iOS: manual A2HS, chrome-less only after apple-touch-icon + manifest. Live session needs server + keys. |
| **Per-pack deep-link icon / Android shortcuts** | `start_url=/?topicId=<pack>` boots into one deck; Android long-press shortcuts off the one icon | Android honors shortcuts; **iOS ignores them** (a "shelf of tutors" on iOS = several manual installs). |
| **"What you're shaky on" depth strip** (shippable now) | Read-only `GET /api/shaky?topicId=` over `review_log` reasons + `context.md` notes + FSRS, showing weak checkpoints **with the verbatim source quote** | Platform-neutral. The honest tutor differentiator a vibe-grader structurally cannot produce. |
| **Lock-screen transport / due-card push** (gated, Android-first) | Media Session for TTS playback; server-side VAPID push + scheduler for re-engagement | Playback transport only, not capture. Push needs a server (+ iOS 16.4 installed PWA). |

## Install flow
**Share:** maintainer runs `recallit pack share <id>` (exists) or posts the deploy URL; render it as a QR (thin new emit on the existing share string).
**Track A (today):** QR/link → exported pack HTML hosted statically → open in mobile browser → study + tap-to-hear → A2HS → labeled offline study icon. No keys, no server.
**Track B (gated):** owner clicks deploy-your-own (Railway/Render) on their **own** keys → public https URL → QR points at `/?topicId=<pack>` → SPA boots straight into that deck's session → install → tap = push-to-talk, examiner grades honestly. There is **no shared app to install** — the URL is the user's own deploy.

## Phased plan

| Phase | Goal | Builds | Gated on |
|---|---|---|---|
| **0 — Deep-link boot + inert PWA shell** *(ship now)* | Any future deploy is installable as a standalone branded icon; `/?topicId=` boots into one deck | ~10-line `location.search` parse in `public/index.html` (auto-open a pack on boot — boot only calls `loadPacks()` today); `manifest.webmanifest`; `sw.js` (cache the shell ONLY — never `/ws`, `/api/*`, `/media`); icon-192/512 + apple-touch-icon (only net-new asset); 3 static GET branches in `server.ts`; guarded SW registration (no-op off https) | Nothing — inert without https. SW needs a real test (a broken cache white-screens). |
| **1 — Track A export-as-app + "shaky on" strip** *(ship now)* | A zero-server offline study icon + the tutor's honesty differentiator on the home surface | apple-touch-icon + theme-color + inline data-URI manifest in the export template (+ "study deck, not the tutor" label); read-only `GET /api/shaky`; SPA home strip rendering weak checkpoints with verbatim quotes | Nothing (read-only over existing files). |
| **2 — Real deploy + installable full tutor** | The Track B icon actually installs + runs the live session | deploy-your-own button (Railway/Render) on the owner's keys; QR-emit on `pack share`; honest iOS-vs-Android marketing copy | A real https deploy; ANTHROPIC + voice keys + spend (BYO); **on-device iOS verification before any copy**. |
| **3 — Dynamic shortcuts + re-engagement** *(Android-first)* | Per-deck Android shortcuts + due-card push that actually fires | dynamic manifest route regenerating `shortcuts[]` from `/api/packs`; server-side VAPID push + subscription store + scheduler; Media Session transport | A real deploy + always-on process (free-tier spin-down breaks it); iOS ignores shortcuts; **`RECALLIT_NO_INSTALL=1` must stay set on any public sandbox** so deep-links can't trigger arbitrary installs. |

## What this is NOT
- Not a SaaS / multi-tenant; no accounts, no managed-key billing, no shared hosted app. A shared link to a deploy is shared *state*, not tenancy.
- Not per-pack scoped PWAs, not native home-screen widgets (no web widget API); packs are deep-links inside one icon.
- Not a fully-offline tutor (export = study-and-listen only; the live examiner + voice need server + keys).
- Not iOS background voice / screen-off hands-free / serverless push — gated or structurally impossible on iOS; Android-first where it exists.
- Not an engine change; not cloud sync (cross-device stays the user's own git/Dropbox of `RECALLIT_DATA_DIR`).
