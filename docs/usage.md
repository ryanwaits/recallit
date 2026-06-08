# usage

A copy-pasteable cookbook for recallit — the topic-agnostic, honest-by-construction spaced-repetition recall engine. Every flow below uses real command, file, and env names from the codebase. Where a capability costs money or is platform-limited, it is marked.

recallit is **one deploy = one user** (not a SaaS): your data lives on disk under `RECALLIT_DATA_DIR` (default `~/.recallit`). "Sync across devices" = put that directory in your own git/Dropbox.

---

## 0. Get started

From zero — `start` seeds a starter pack (Conversational Mexican Spanish), boots the app, and opens your browser:

```bash
bunx @waits/recallit start
```

Keyless by default (real cards, real grading, **no API spend**). Paste an `ANTHROPIC_API_KEY` at the prompt — or set it in your environment — to enable the live AI tutor; voiced practice also needs `ELEVENLABS_API_KEY`. Data persists to `~/.recallit`. Headless/CI runs skip the browser and just print the URL.

For everything else, drive the CLI directly. recallit is **Bun-only** (the engine imports `bun:sqlite`). The CLI bin is `recallit`.

```bash
# One-off via the published package (no install)
bunx @waits/recallit <command>

# Or in this repo
bun run cli <command>          # = bun run src/cli.ts
```

Throughout this doc, `recallit <command>` is shorthand for either form above.

> CLI flag gotcha: `parseArgs` reads `--flag <value>` pairs. A `--flag` followed by another `--flag` (or end of args) is treated as a boolean. Put flag values immediately after their flag.

---

## 1. Generate a pack from a source

`recallit pack <source>` runs an **agent author loop** (Claude Agent SDK): it classifies the source, reads it, saves the raw text to a corpus (`.author/source.txt`), drafts cards, and runs the **honesty gate** before anything touches your deck. The gate verifies that every card's `meta.sourceQuote` (or each rubric checkpoint's `sourceQuote`) is a **literal substring of the corpus** — unverified cards are stamped `needs-review` and **never auto-installed**.

```bash
# A local PDF, a directory, or any local file
recallit pack ./papers/attention-is-all-you-need.pdf

# A URL / article
recallit pack https://example.com/some-article

# A code repo (git clone --depth=1 or npm pack into a temp dir)
recallit pack github:colinhacks/zod
recallit pack git+https://github.com/owner/repo.git
recallit pack npm:is-odd@1.0.0

# A plain concept (no source file) — web-grounded, always held for review
recallit pack "the Krebs cycle"
```

### Modes (A / B / C) and review

By default the CLI resolves **mode A** (auto-install ready cards). Flags steer it:

| Flag | Effect |
|------|--------|
| `--auto` | Install ready cards without prompting (mode A). |
| `--review` | Always pause and confirm before installing (mode B/C). |
| `--dry-run` | Write the pack to `packs/<id>/` but do **not** install. Prints the manual install command. |
| `--scope <text>` | Narrow what the author covers (e.g. `--scope "chapters 1-3"`). |
| `--style <text>` | Steer card style/tone. |
| `--model <m>` | Override the author model (default `claude-sonnet-4-6`). |
| `--max-budget <usd>` | Cap spend on the author loop (default $1). |
| `--force` | On install, force-reinstall (resets FSRS — see below). |

Even with `--auto`, a **web-grounded** pack (concept source, `manifest.meta.grounding === 'web'`) is **forced through review** — it is attribution-only, not authoritative.

Typical output:

```
authoring pack from: github:colinhacks/zod  (mode A: ...)
   · save_source
   · write_pack
12/14 ready, 2 need review · grounding repo · $0.18
  ⚠ What is the exact default error message?  [unverified-quote]
installed "zod": 12 ready cards, 2 held for review (now active)
```

### Editing an existing pack

```bash
recallit pack edit zod "add 8 cards on refinements and superRefine"
recallit pack edit zod "fix card 7" --dry-run
```

- **Additive edits merge cleanly** and **preserve your FSRS review history**.
- Any **changed or removed** card requires a clean re-install, which **RESETS the review schedule** for that pack. The CLI warns and prompts before doing this (use `--auto`/`--yes` to skip the prompt).

### No-LLM gate / inspect (free, deterministic)

If you hand-draft a `packs/<id>/manifest.json` + `cards.json`, you can gate or inspect without spending tokens:

```bash
recallit pack write ./packs/my-pack      # run the honesty gate, stamp needs-review, rewrite cards.json
recallit pack review ./packs/my-pack     # list which cards are held and why
```

> **Honesty gate is substring, not entailment.** It proves a quote is *present* in the corpus; it does not prove the card *reads* its source correctly. Number/proper-noun flags are mitigation, not proof. Duplicate detection is normalized-front-only (catches case/punct variants, not semantic paraphrases).

---

## 2. Install / deploy a pack

```bash
recallit topic add <source> [--no-activate] [--no-audio] [--force]
```

`<source>` can be a local dir, `github:owner/repo[#ref]`, `git+<url>`, `npm:<spec>`, or a `<pack>.tgz`.

```bash
recallit topic add ./packs/spanish-mx-rgv          # local pack dir
recallit topic add github:ryanwaits/recallit/packs/architecture
recallit topic add ./packs/my-pack --no-activate   # install but don't switch to it
```

- `installPack` materializes the pack into `data/topics/<id>/`, builds the SQLite index, copies audio/scenarios, and **skips any card stamped `needs-review`**.
- `--force` does a destructive rebuild (`rm` the topic dir) — this **wipes the FSRS schedule**. Only use it when you mean to start over.

### One-command on-ramp

```bash
recallit quickstart ./packs/spanish-mx-rgv
```

Installs the pack, activates it, then immediately runs today's daily session.

### Bundled packs (repo-only)

This repo ships two packs that are **not** in the npm tarball (`files: ["src"]`):

| Pack | Modality | Source |
|------|----------|--------|
| `packs/spanish-mx-rgv` | voice | RGV Mexican Spanish |
| `packs/architecture` | text (comprehension) | the repo's own `ARCHITECTURE.md` (dogfood) |

```bash
bun run seed:spanish    # = recallit topic add packs/spanish-mx-rgv --force
```

### Hosting the browser surface

```bash
bun run serve            # full server (needs voice + Anthropic keys for voice/agent)
bun run serve:local      # keyless dev server: real grading, stubbed STT/TTS, no LLM
bun run serve:marketing  # static marketing site (port 8080)
```

The full server (`src/server.ts`) serves the SPA at `/`, a pack gallery at `GET /api/packs`, progress at `GET /api/progress?topicId=`, card audio at `GET /media/<topicId>/<cardId>/<file>`, and a WebSocket session at `/ws?topicId=`. The pack-install route `POST /api/packs/install` is **gated by `RECALLIT_NO_INSTALL`** — set it on any shared/public deploy to return 403 (it executes arbitrary git/npm otherwise).

> The full SPA (`public/index.html`) and live server are functional; a hosted "deploy-your-own" product is on the roadmap, not shipped.

---

## 3. Study — text

The fastest manual loops use the engine primitives directly. Cards default to **lexical grading** (exact → Easy, normalized → Good, near ≥0.7 → Hard, else Again).

```bash
recallit due                            # list cards due now
recallit answer <cardId> el gato negro  # evaluate a typed answer + auto-grade
recallit review <cardId> Good           # grade directly with a rating
recallit preview <cardId>               # show next-due dates for each rating
recallit stats                          # total + due counts
```

Card CRUD:

```bash
recallit card add --front "the black cat" --back "el gato negro" --tags animals,color
recallit card list
recallit card search gato
recallit card set <cardId> --back "el gato negro"
recallit card rm <cardId>
recallit rebuild                        # rebuild the derived SQLite index from .md files
```

### Interactive agent review loop

```bash
recallit agent [--model m] [--maxTurns n]
```

The agent presents a card, reads your typed answer, reveals, and grades — all through the **gated turn machine** (`present → respond → reveal → grade`). The rating is **always engine-computed**; the agent cannot override it.

---

## 4. Study — voice

Voice is **pluggable** (STT/TTS providers) and runs through the browser SPA / WebSocket, not the CLI. It costs real API calls.

```bash
ANTHROPIC_API_KEY=...     # agent loop
ELEVENLABS_API_KEY=...    # default STT (Scribe) + TTS
# optional: use OpenAI for STT
RECALLIT_STT=openai OPENAI_API_KEY=...

bun run serve
# open the SPA, pick a voice pack, push-to-talk
```

The SPA supports push-to-talk (`MediaRecorder`) and text, a live phase rail, and grade-receipt chips. A failed transcription **auto-retries once** before grading as Again (intentional — no silent failover).

> **iOS / PWA limits (verify on a real device before relying on them):** iOS has no background mic and no screen-off audio, so a hands-free "pocket" mode is structurally impossible. Screen-on push-to-talk is the ceiling on iOS.

---

## 5. Run the comprehension tutor (daily session)

```bash
recallit daily [--model m] [--maxTurns n]
```

This runs the full **multi-phase daily regimen**, checkpoint-resumable if interrupted (a stable per-day session id resumes the same day's remaining phases):

| Modality | Phases |
|----------|--------|
| text / comprehension | `review → socratic → reflect` |
| voice | `shadowing → review → roleplay → reflect` |

- **review** — spaced-repetition over due cards via the gated turn machine. For a checkable/explain card, the answer is a free-recall explanation and the **examiner** grades coverage (the agent never judges it).
- **socratic** — an **ungraded** deep-probe (`converse`, no card, no FSRS). It reads `context.md` for your weak spots, probes them, and records new ones via `update_context`.
- **roleplay** (voice) — output-focused conversation, ungraded.
- **reflect** — append notes to the depth-memory and log the session.

> Phase order/guidance lives in prompts; the engine **does not enforce phase fidelity** — only the turn-machine gating and the engine-owned rating are load-bearing invariants. Checkpoint tracks completion, not adherence.

### The examiner grade receipt

For **checkable items** (`type: explain`, `meta.grader: 'coverage'`, with a `meta.rubric` of source-grounded checkpoints), grading works like this:

1. The examiner (one-shot Claude) proposes per-checkpoint `{demonstrated, evidence}`.
2. **Code re-verifies** each evidence span is *literally* in your answer (anti-fabrication), drops the unquotable, and **counts** the rating via pure thresholds:
   - all required checkpoints hit → **Good**
   - ≥50% of required hit → **Hard**
   - <50% → **Again**
   - a contradiction (wrong claim) caps at **Hard**
3. Coverage **tops out at Good** — Easy is a lexical-only signal.

The model proposes evidence; **code decides the rating**. If the examiner can't produce a confident judgment, it **HOLDs** (throws) rather than silently mis-grading — the caller must handle that (retry / ask for a typed answer / skip).

The examiner is **ON by default**. To run fully offline/deterministic (CI, the model-free coverage floor):

```bash
RECALLIT_EXAMINER=0 recallit daily
```

> The model-free floor (`checkCoverage`) is near-verbatim only — it normalizes accents/case/punctuation and matches claim/alias tokens. Genuine paraphrases without the exact tokens false-miss until the examiner runs.

### The depth-memory (context.md)

```bash
recallit context                # print the learner depth-memory for the active topic
```

`context.md` is a per-topic, append-only Markdown log of weak spots and breakthroughs that the agent reads to steer the Socratic phase. It is unstructured prose — weak-spot inference is LLM-driven, and it is **topic-scoped** (switching topics doesn't carry context over).

---

## 6. Share / export a pack

```bash
recallit pack share <id>     # print the install string + a browse URL for a repo-local pack
recallit pack export <id>    # write a self-contained study-kit HTML (opt-in)
```

- `pack share` prints a `recallit topic add github:owner/repo/packs/<id>` line (and a GitHub browse URL) if the repo has a GitHub origin, else the local path.
- `pack export` writes `<id>.recallit.html` — a single self-contained file with **ready cards only**, **base64-embedded audio**, and checkable-item "key points". It has **zero external requests** and is presentation-only (no resume/progress tracking — a study snapshot, not a live deck). Audio is self-hosted on the owner's keys/spend.

> `pack export` is opt-in per pack and never auto-published. The RGV Spanish pack contains personal content — don't export/share it casually.

---

## 7. Topics

```bash
recallit topic create my-deck --name "My Deck" --modality text --goal cards_recalled
recallit topic list          # * marks the active topic
recallit topic use my-deck
recallit topic show          # print the topic config JSON
```

`--modality` is `text`, `voice`, or `both`. `--goal` (e.g. `cards_recalled`, `minutes_spoken`) is a **label** for prompts/progress — the engine does not compute it; daily counts come from the review log.

---

## 8. Flags & environment

### Env vars

| Var | Purpose | Default / notes |
|-----|---------|-----------------|
| `RECALLIT_DATA_DIR` | Where topics/cards/index/logs live | `./data` |
| `RECALLIT_EXAMINER` | `0` disables the LLM examiner (use the deterministic coverage floor) | examiner **ON** by default |
| `RECALLIT_NO_INSTALL` | Any truthy value (incl. `'0'`) returns 403 on `POST /api/packs/install` | unset = install allowed |
| `RECALLIT_TZ` | IANA zone (e.g. `America/Chicago`) for streak day boundaries | UTC if unset |
| `RECALLIT_STT` | `openai` switches STT to `gpt-4o-transcribe` | ElevenLabs Scribe default |
| `ANTHROPIC_API_KEY` | Pack author/editor loop, agent, daily, examiner grading | required for those |
| `ELEVENLABS_API_KEY` | Default voice STT + TTS | required for voice |
| `OPENAI_API_KEY` | STT when `RECALLIT_STT=openai` | required for that path |

> `RECALLIT_NO_INSTALL` check is string-truthy: `'0'` still blocks the route.

### Honest costs

| Action | Cost |
|--------|------|
| `recallit pack <source>` (author loop) | ~$0.10–0.40 per pack via `ANTHROPIC_API_KEY`; capped by `--max-budget` (default $1) |
| `recallit daily` / `recallit agent` | Anthropic tokens per turn |
| Examiner grading (default on) | one Claude call per checkable-card turn; no local-only mode (use `RECALLIT_EXAMINER=0` to skip) |
| Voice (STT/TTS) | per-turn ElevenLabs (or OpenAI STT) cost |
| Lexical grading, FSRS, file/index ops, `pack write`/`pack review` | free (deterministic, no LLM) |

---

## 9. What recallit does NOT do (be honest)

- **Not a SaaS** — one deploy = one user, no multi-tenant accounts or managed billing. Cross-device sync is your own git/Dropbox of `RECALLIT_DATA_DIR`.
- **Honesty gate ≠ truth** — it verifies a quote is in the corpus, not that the card reads it correctly.
- **Default grading is lexical** — valid paraphrases grade as Again unless the examiner/coverage path is active.
- **No offline examiner** — examiner grading requires an API call; can't-judge HOLDs rather than guessing.
- **iOS hands-free voice is impossible** — screen-on push-to-talk is the ceiling.
- **The engine is sacred** — the turn machine, FSRS scheduling, and the agent-can't-override-rating invariant are not configurable away.
