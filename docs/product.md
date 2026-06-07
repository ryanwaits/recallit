# product

> recallit — a topic-agnostic spaced-repetition recall engine, an agent that operates it, and a source-grounded tutor. Bun + TypeScript. Published as `@waits/recallit@0.2.0`. **One deploy = one user. Not a SaaS.**

This document is the product & UX overview: what recallit is, who it's for, the surfaces, the end-to-end journeys, and an honest capability × surface × limit matrix. The governing principle throughout is **honest-by-construction**: never claim a capability the engine can't enforce.

---

## What recallit is

recallit is three things, layered:

1. **A recall engine.** Files-as-truth (`item.md` + `topic.json`), a derived `bun:sqlite` index (rebuildable, never the source of truth), FSRS-6 scheduling (via `ts-fsrs`), and a per-session **turn machine** that gates the answer reveal and grade until you've actually answered. The rating is **always engine-computed** — the agent can propose evidence but can never pick the grade.

2. **An agent that operates it.** A daily multi-phase regimen (text: review → socratic → reflect; voice: shadowing → review → roleplay → reflect), with transparent depth-memory (`context.md`), one-new-thing card mining, and timezone-aware streaks. All pedagogy lives in prompts; all invariants live in tool gates.

3. **A source-grounded tutor.** Drop a source (PDF, URL, repo, or a plain concept), and recallit authors an **honest pack** — every card cites a verbatim quote that must be a literal substring of the saved source corpus, or the card is held for review. It never silently installs an unverified fact.

The wedge, stated plainly:

- **Honest by construction.** Every generated card cites a line you can check. The honesty gate (`gateCards`) verifies the quote is literally in the corpus before the card ships.
- **Deterministic, code-owned grading.** The rating is computed by pure code (`mapCoverageToRating`, `evaluateAnswer`), never by a model. The examiner (Option C) lets a model *propose* per-checkpoint evidence, but code re-verifies every evidence span is literally in your answer (anti-fabrication) and **counts** the rating. The model never emits a rating.
- **Source-grounded tutor over a vibe-grader.** A grounded recall unit — the "checkable item" with a rubric of source-cited checkpoints — is the differentiator a confidence-faking grader structurally cannot produce.

---

## Who it's for

- **A single learner running their own deploy.** The canonical first instance is conversational Mexican Spanish (Rio Grande Valley). recallit is topic-agnostic; the engine knows no subject — topics are data plug-ins.
- **Someone who wants to turn a source into durable retention.** "Drop a source. Get an honest pack. Practice it forever."
- **Builders who want an agent-native, files-as-truth SRS engine** to consume as a package (`@waits/recallit`, Bun-only) or operate via CLI.

It is explicitly **not** a multi-tenant SaaS: no accounts, no managed-key billing, no shared hosted app. Cross-device "sync" = your own git/Dropbox of `RECALLIT_DATA_DIR`.

---

## Surfaces

| Surface | What it is | How you reach it |
|---|---|---|
| **CLI** | Thin harness over the engine primitives. Topic/card CRUD, due/review/answer, pack generation, agent loops. | `bunx @waits/recallit <command>` (bin: `recallit`) |
| **Branded SPA** | Single-file browser app (`public/index.html`): pack gallery, push-to-talk + text, live phase rail, grade-receipt chips. | `bun run src/server.ts` (HTTP + WS); requires voice providers |
| **Voice** | Pluggable STT/TTS (`SttProvider` / `TtsProvider`). Concrete ElevenLabs + OpenAI implementations. | Wired into the server; per-card `native.mp3` audio on disk |
| **Pack export** | Self-contained study-kit HTML: ready cards + base64-embedded audio + checkable-item "key points". Zero external requests. | `recallit pack export <id>` |
| **Mobile / PWA** | **Planned/gated** (Phase 0–3, see `docs/design/mobile-surfaces.md`). Track A = offline study deck (today); Track B = full tutor PWA (gated on a real https deploy + your own keys). | Add-to-Home-Screen of an exported deck (today); installable SPA (gated) |
| **Dev servers** | `serve:local` (keyless SPA over real grading, no LLM/voice), `serve:marketing` (static marketing site). | `bun run scripts/serve-local.ts` / `serve-marketing.ts` |

### CLI command surface

```
recallit topic create <id> --name <n> [--modality text|voice|both] [--goal <metric>]
recallit topic add <source> [--no-activate] [--force] [--no-audio]
            # source = dir | github:owner/repo[#ref] | git+<url> | npm:<spec> | <pack>.tgz
recallit topic list | use <id> | show [<id>]

recallit card add --front <f> --back <b> [--type t] [--context c] [--tags a,b] [--topic id]
recallit card list | search <query> | rm <cardId> | set <cardId> --front ... [--topic id]

recallit due [--limit n] [--topic id]
recallit review <cardId> <Again|Hard|Good|Easy> [--topic id]   # explicit manual grade
recallit answer <cardId> <answer...> [--topic id]              # evaluate + auto-grade (engine-owned)
recallit preview <cardId> [--topic id]                         # show FSRS intervals per rating
recallit rebuild [--topic id]                                  # rebuild the sqlite index from files
recallit stats | context [--topic id]

recallit agent [--topic id] [--model m] [--maxTurns n]         # interactive agent review loop
recallit daily [--topic id] [--model m]                        # full multi-phase daily session
recallit quickstart <source> [--model m]                       # install a pack, then start today

recallit pack <source> [--review|--dry-run|--auto] [--scope t] [--style t]   # generate a pack
recallit pack edit <id> "<instruction>" [--dry-run]            # tweak a pack (additive edits keep history)
recallit pack share <id>                                       # print install string + URL
recallit pack export <id>                                      # write self-contained HTML (opt-in)
recallit pack write <pack-dir>                                 # gate a drafted pack (no LLM)
recallit pack review <pack-dir>                                # list needs-review cards + reasons (no LLM)
```

> CLI gotcha: `--flags` must precede their values. `card add --front X --back Y` works; reordering positionals between a flag and its value breaks parsing.

### HTTP + WebSocket surface (server.ts)

| Route | Purpose |
|---|---|
| `GET /` or `/index.html` | Serves the branded SPA |
| `GET /api/packs` | `{packs: [{id, name, modality, goalMetric, cards, due, active}]}` |
| `GET /api/progress?topicId=` | `{dueNow, reviewedToday, streak, dangerZone}` |
| `POST /api/packs/install` | Installs a pack — **gated by `RECALLIT_NO_INSTALL`** (any truthy value → 403) |
| `GET /media/{topicId}/{cardId}/{filename}` | Serves card audio (`native.mp3`, recordings) |
| `WS /ws?topicId=` | Bi-directional session protocol (per-connection deck) |

WS messages (server→client): `say` (prompt + optional audio/mediaUrl), `listen`, `transcript`, `phases`, `phase`, `graded` (grade receipt), `caption`, `done`, `error`. Client→server: `audio`, `text`, `stop`.

---

## End-to-end journeys

### 1. Drop a source → honest pack

```
recallit pack <source>            # PDF | URL | repo (github:/git+/npm:) | "a plain concept"
```

The author loop (an agent, `runPackAuthor`):
1. Classifies and fetches the source, saves the raw text to a corpus (`.author/source.txt`).
2. Drafts cards — flashcards **and** checkable items (each checkpoint carries a verbatim `sourceQuote`).
3. Calls the honesty gate (`gateCards` / `writePack`): every `sourceQuote` must be a literal substring of the corpus. Cards with an unverified quote (or a flagged number / proper-noun) are stamped `meta.status: 'needs-review'` and **structurally split on disk** — `installPack` skips them by default.

You can review before install:

```
recallit pack <source> --review        # gate + hold for review
recallit pack review packs/<id>        # no-LLM: list held cards + reasons
recallit topic add packs/<id>          # install ready cards into a topic
```

Honest caveats:
- The gate checks quote **presence, not entailment** — a quote can be literally in the corpus yet the card misread it. Number/proper-noun flags are *mitigation, not proof*.
- **Concept (no-source) packs are web-grounded** (`manifest.meta.grounding='web'`): they research reputable sources, mark attribution-only, and **force the gate even under `--auto`**.
- Pack generation costs real money (~$0.1–0.4/pack; needs `ANTHROPIC_API_KEY`). `--max-budget` caps spend.

### 2. Study (recall, the gated turn)

Per card the engine runs a four-step machine, gated so you can't see the answer before answering:

```
present  →  respond  →  reveal  →  grade
```

- `recallit answer <cardId> <your answer>` evaluates and auto-grades. **The rating is engine-computed** — lexical grading (`evaluateAnswer`): exact → Easy, normalized (accent/case-insensitive) → Good, near (≥0.7 similarity) → Hard, else → Again.
- For **checkable items** (a rubric of source-grounded checkpoints), the coverage grader applies: all required checkpoints hit → Good; ≥50% → Hard; else → Again; a wrong claim caps at Hard. Coverage **tops at Good** — Easy is lexical-only.

### 3. Speak (voice tutor)

Run the server with voice providers, open the SPA, pick a pack, push-to-talk. STT transcribes, the turn machine grades, TTS speaks the tutor's response. Live phase rail + grade-receipt chips reflect engine state, not model claims.

Voice costs real money per turn (`ELEVENLABS_API_KEY`, optional `RECALLIT_STT=openai`). There is no local/offline voice in 0.2.0.

### 4. The examiner (source-grounded comprehension)

For coverage cards, the examiner (`graders/examiner.ts`, **ON by default**; `RECALLIT_EXAMINER=0` opts out) runs one-shot Claude to propose per-checkpoint `{demonstrated, evidence}`. Then `recountExaminer` **re-verifies each evidence span is literally in your answer** (drops the unquotable) and counts the rating via `mapCoverageToRating`. The model proposes; **code decides**. If it can't judge confidently, it **HOLDs** (throws) rather than silently grading — the caller (agent/CLI) must handle that path. No offline examiner: it calls Claude per turn.

### 5. Daily regimen + retention

```
recallit daily          # text: review → socratic → reflect; voice: shadowing → review → roleplay → reflect
recallit quickstart <source>   # install a pack, then start today's session
```

- **socratic** = an *ungraded* deep-probe that reads `context.md` weak spots and records new ones (transparent depth-memory). No grade, no FSRS.
- Sessions are **checkpoint-resumable**: a killed daily session resumes the same day from the last completed phase.
- Streaks are **timezone-aware** (`RECALLIT_TZ`); the streak advances once per local calendar day.

> Phase guidance is prose (instructions to the agent), not tool-enforced. The checkpoint tracks *completion*, not *fidelity*. The hard invariants (answer-before-reveal, engine-owned rating) are the tool gates.

---

## Capability × surface × limit matrix

| Capability | Surface(s) | Status | Honest limits |
|---|---|---|---|
| **Recall / spaced repetition (FSRS-6)** | CLI, SPA | Real, shipped | Files-as-truth; sqlite index is derived/rebuildable. No file locks — concurrent writes to one card can corrupt. |
| **Turn-gated grading (answer before reveal)** | CLI, SPA, agent | Real, shipped, load-bearing | Turn state is in-memory, session-scoped; no cross-request persistence unless checkpointed. |
| **Engine-owned rating (agent can't override)** | All | Real, invariant | By design the rating tool ignores any model-supplied rating. |
| **Lexical grading** | CLI `answer`, SPA | Real, default | Exact/normalized/near/again. Valid paraphrases without matching tokens grade Again. |
| **Coverage grading (checkable items)** | CLI, SPA | Real | Caps at Good (never Easy). Deterministic floor is near-verbatim only. No coverage card in production at scale yet. |
| **Examiner (LLM proposes / code verifies)** | CLI, SPA, agent | On by default | Costs API calls; HOLDs (throws) when unconfident — no silent fallback. Re-verifies *presence* not *entailment*; stops fabrication, not misjudgment. Validation is small-fixture, not proven at scale. `RECALLIT_EXAMINER=0` disables. |
| **Honesty gate (verbatim source quote)** | Pack gen (CLI, skill) | Real, shipped, fail-closed | Substring check ≠ entailment. Number/proper-noun flags are mitigation. Rubric *quality* is not deterministically checked. |
| **Pack generation from any source** | CLI `pack`, `recallit-pack` skill | Real, shipped | Needs `ANTHROPIC_API_KEY` + real spend (~$0.1–0.4/pack). Concept packs are web-grounded, attribution-only, always gated. |
| **Pack edit** | CLI `pack edit` | Real | Additive edits merge & preserve FSRS history; any removal/change forces a destructive reinstall that **resets the schedule/streak**. |
| **Pack export (self-contained HTML)** | CLI `pack export` | Real, opt-in | **Presentation-only**: ready cards + base64 audio, no grading, no resume/progress. "A study snapshot, not a live deck." |
| **Voice (STT/TTS, push-to-talk)** | SPA + server | Real, gated on keys | Costs per turn (`ELEVENLABS_API_KEY`; `RECALLIT_STT=openai` optional). No local/offline voice. STT failure auto-retries once, then grades the empty transcript as Again. |
| **Daily multi-phase regimen + depth-memory** | CLI `daily`, agent | Real | Phase fidelity is prose-guided, not enforced. `context.md` is unstructured prose; weak spots are LLM-inferred, not structured. |
| **Pack gallery + per-connection topic routing** | SPA, `GET /api/packs`, `?topicId=` | Real | First keyless client gets the process-global active topic if none specified. |
| **Pack install over HTTP** | `POST /api/packs/install` | Real, must be gated on public deploys | Set `RECALLIT_NO_INSTALL=1` on any public/shared deploy (prevents arbitrary git/npm execution). |
| **Mobile / PWA — Track A (offline study deck)** | Exported HTML A2HS'd | Real today | **No grading, no voice** — must be labeled "study deck, not the tutor." iOS install = manual Share → Add-to-Home-Screen. |
| **Mobile / PWA — Track B (full tutor)** | Installable SPA | **Gated / proposed** (Phase 2–3) | Needs a real https deploy + the owner's own keys + spend. The branded SPA is not yet deployed as a hosted product. |
| **Hands-free / background voice ("Free Mode")** | iOS web | **Structurally impossible on iOS** | iOS Safari has no background mic, no screen-off/locked audio capture, and pauses PWA audio when backgrounded. Screen-on, foregrounded push-to-talk is the iOS ceiling. Android is better but still not a true always-listening mic. |
| **Re-engagement / push notifications** | PWA | **Gated** (Phase 3, Android-first) | Web Push needs a server (VAPID); iOS needs 16.4+ *and* a manually-installed PWA. Free-tier deploys spin down and break any scheduler. |
| **Per-pack home-screen icons / shortcuts** | PWA | **Gated; iOS-limited** | iOS ignores manifest `shortcuts` (per-pack icons on iOS are separate manual installs). Android honors shortcuts. |
| **Cross-device sync** | n/a | Not a feature | "Sync" = your own git/Dropbox of `RECALLIT_DATA_DIR`. No cloud sync, no accounts. |
| **Multi-user / SaaS** | n/a | Explicitly out of scope | One deploy = one user. No tenancy, no managed billing. A shared link to a deploy shares *state*, not tenancy. |

---

## Keys, cost & deployment reality

- **Free, no keys:** CLI recall over hand-authored or already-installed cards (lexical grading); the keyless dev SPA (`serve:local`) over real grading; the static marketing site; an exported study deck.
- **Costs real money (your keys, your spend):** pack generation (`ANTHROPIC_API_KEY`), the examiner per turn, and voice STT/TTS (`ELEVENLABS_API_KEY` / OpenAI). The icon is free; the conversation is not.
- **Bundled packs are repo-only:** `spanish-mx-rgv` (voice, RGV Spanish) and `architecture` (comprehension, dogfooded from the repo's own `ARCHITECTURE.md`) ship in the repo but **not** in the npm tarball (`files: ["src"]`). A consumer installing `@waits/recallit` gets the CLI/engine, not those packs.
- **Runtime:** Bun-only — the engine imports `bun:sqlite`.

---

## Design references

- `docs/design/hosted-product.md` — roadmap toward a hosted / multi-touchpoint direction.
- `docs/design/pack-generation.md` — pack format, author loop, honesty gate, modes A/B/C, caveats.
- `docs/design/tutor-multimodal.md` — the grader registry, coverage thresholds, examiner contract.
- `docs/design/mobile-surfaces.md` — the honest PWA plan (Tracks A/B, iOS limits, phased plan).
- `docs/guides/` — use-case walkthroughs (instantiate, author, operate the agent, create/use packs, multimodal voice, recipes).
