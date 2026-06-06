# Using a Pack — Install, Review, Daily, Progress

THE day-to-day guide for **running** a pack (any topic, not just Spanish). Install it, inspect it, review it (interactively or headless), run a full daily session, and track your streak. All commands verified against `src/cli.ts`. To **create** a pack from a PDF/URL/repo/concept, see `docs/guides/05-creating-packs.md`. For voice internals, see `docs/guides/03-operating-the-agent.md`.

Run via `bun run cli <cmd>` (the `cli` script = `bun run src/cli.ts`). Examples use a fictional topic `id`; substitute yours.

---

## 1. Install a pack — `topic add`

```bash
bun run cli topic add <source> [--no-activate] [--force] [--no-audio]
```

| Source form | Example | What it does |
|---|---|---|
| Local dir | `topic add packs/zod-v4` | install from an unpacked pack dir |
| Tarball | `topic add ./zod-v4.tgz` | install from a `.tgz` |
| GitHub | `topic add github:owner/repo#main` | clone + install (`#ref` optional) |
| Git URL | `topic add git+https://host/repo.git` | clone + install |
| npm | `topic add npm:@scope/pack@1.2.0` | fetch from npm + install |

| Flag | Effect |
|---|---|
| (default) | install **and** set active |
| `--no-activate` | install without switching active topic |
| `--force` | clean re-install — **RESETS the FSRS review schedule** |
| `--no-audio` | skip bundled `assets/*.mp3` (text-only run) |

Output names the counts that installed:

```
installed "zod-v4": 38 cards, 12 audio, 2 scenarios (now active)
```

`installPack` **silently skips** any card the pack ships with `meta.status:"needs-review"` (`install.ts`) — they stay on disk but are never scheduled, and `topic add` does not print the held count. (The `N ready / M held` wording appears only when *generating* a pack via `recallit pack` / `pack edit`, not on `topic add`.) To see what was held, run `bun run cli pack review packs/<id>`; to promote them, see §8.

Engine-version gate and publishing details: `docs/guides/04-authoring-and-publishing-packs.md`.

---

## 2. Set / switch the active topic

Most commands act on the **active** topic; override per-call with `--topic <id>`.

```bash
bun run cli topic list        # * marks active
bun run cli topic use zod-v4  # switch active
bun run cli topic show        # full topic.json (modality, meta, voiceId, goalMetric)
```

No active topic → commands error: `no active topic — run: recallit topic use <id>`.

---

## 3. Inspect a pack

```bash
bun run cli stats                 # "topic zod-v4: 38 cards, 12 due now"
bun run cli due [--limit n]       # list cards due now (front -> back)
bun run cli card list             # every card + id + type + next-due
bun run cli card search "<query>" # substring search
bun run cli preview <cardId>      # the 4 FSRS projections (Again/Hard/Good/Easy)
```

`card add` / `card set` / `card rm` exist for manual edits, but prefer `pack edit` (additive, FSRS-preserving — see §8) over hand-editing live cards.

---

## 4. Review interactively — `agent`

The conversational review loop. **You type answers**; the agent runs the gated state machine.

```bash
bun run cli agent [--topic id] [--model m] [--maxTurns n]
```

Flow per card (enforced in `turn.ts`, cannot be skipped):

```
present (front only) → you answer → reveal (back + rating) → grade (FSRS persists)
```

- The agent **never** chooses the rating — `evaluateAnswer` (`evaluate.ts`) computes it from your typed answer (see §7).
- Blank answer ends the session.
- Ends with `— session <reason> (<turns> turns, $<cost>)`. The agent loop calls the Anthropic API → **needs `ANTHROPIC_API_KEY`** and costs real money.

For a deterministic, **headless** alternative (no LLM, no key), use `answer`/`review` (§6).

---

## 5. Run a full session — `daily`

```bash
bun run cli daily [--topic id] [--model m]
```

Multi-phase, **modality-driven**, **checkpointed** (resumes the same local day if interrupted):

| Topic modality | Phases |
|---|---|
| `text` | **review → reflect** |
| `voice` / `both` | shadowing → review → roleplay → reflect |

A freshly **generated** pack ships `modality:text`, so its daily is just **review → reflect**: the gated SR loop, then a reflect phase that appends notes to `context.md` and reads `get_progress`. No audio, no roleplay. To make a pack voice-capable (manifest `modality` + assets/scenarios), see `03-operating-the-agent.md` §2 and `02-authoring-cards-and-scenarios.md`.

**Checkpoint/resume:** each completed phase is recorded; re-running `daily` the same day skips finished phases. One active session per topic per day. Roleplay (voice topics) now drives free-conversation turns via a card-less `converse` turn — `serve` wires it end-to-end (`server.ts:239`).

Like `agent`, `daily` uses the agent loop → `ANTHROPIC_API_KEY` + real cost.

---

## 6. Headless / deterministic review — `answer` & `review`

No LLM, no API key, fully scriptable. Same FSRS engine the agent grades through.

```bash
# Evaluate a typed answer, auto-grade, advance schedule:
bun run cli answer <cardId> the answer text here
#   -> answer="..." -> Good (matches after normalization)
#      next due 2026-06-09T...

# Grade directly, bypassing evaluation:
bun run cli review <cardId> <Again|Hard|Good|Easy>
#   -> graded; next due ... (reps N, lapses M)
```

Use `due` to get card ids, loop `answer` over them — a pure-CLI study session with zero spend.

---

## 7. How grading works (and its honest limits)

`answer` and the `reveal` step both run `evaluateAnswer` (`evaluate.ts`). It is **lexical**, not semantic:

| Your answer vs card back | Rating |
|---|---|
| Exact match | **Easy** |
| Equal after normalization | **Good** |
| Similarity ≥ ~0.7 | **Hard** |
| Otherwise | **Again** |

Normalization: lowercase, strip diacritics/accents/ñ, drop punctuation, collapse whitespace (`evaluate.ts:17-30`).

**Honest limits — do not expect more:**
- Grading is **lexical only**. A correct **paraphrase** that doesn't share tokens grades **Again**. Fine for recognition/comprehension (e.g. front=term → back=definition); not a semantic judge.
- Accents/diacritics are normalized away — you can't be marked wrong for a missing accent, but you also can't be tested **on** one.
- `review` skips evaluation entirely — you self-assign the rating.

---

## 8. needs-review cards — exclude & promote

Generated packs split cards into **ready** (installed) and **needs-review** (held back) via the honesty gate. Inspect a pack's flagged cards with **no LLM**:

```bash
bun run cli pack review packs/<id>     # lists needs-review cards + reason codes
bun run cli pack write packs/<id>      # re-run the gate, re-stamp status on disk
```

Reason codes (`gate.ts`): `missing-source-quote`, `quote-not-in-corpus`, `quality:*`, `unverified-number`, `unverified-proper-noun`, `duplicate-front`.

**Honest caveat:** the gate checks quote **PRESENCE** — it verifies `meta.sourceQuote` is a literal substring of the source corpus. It does **not** verify the card's back is **entailed** by that quote. Ready ≠ correct; it means quoted-and-clean.

**To promote** a held card: edit `packs/<id>/cards.json`, change its `meta.status` away from `"needs-review"`, then re-install. A re-install with new-only cards merges additively; one that changes existing cards needs `--force` (resets schedule). The clean path is `pack edit` (§9).

---

## 9. Enhance a pack without losing progress — `pack edit`

```bash
bun run cli pack edit <id> "add 10 cards on error handling" [--dry-run] [--auto]
```

| Edit kind | Behavior |
|---|---|
| **Additive** (only new cards) | merges non-destructively — **your FSRS review history is preserved** |
| **Changes/removes existing cards** | needs a clean rebuild that **RESETS the schedule**; CLI prompts `[y/N]` (`--auto`/`--yes` to skip) |
| `--dry-run` | writes `cards.json`, does **not** re-install |

Runs the agent editor → `ANTHROPIC_API_KEY` + real cost. Dedup is exact-front-only (`normalize(front)`), so near-duplicate phrasings can slip through. Full create/edit guide: `05-creating-packs.md`.

---

## 10. Progress, streaks, danger-zone

`daily`/`agent` surface progress via `get_progress` (`progress.ts`): `{goalMetric, dueNow, reviewedToday, streak, longestStreak, dangerZone}`.

- **Streak** advances across consecutive **local** days. Set the day boundary:
  ```bash
  export RECALLIT_TZ=America/Chicago   # IANA zone; defaults to UTC if unset
  ```
- **`dangerZone:true`** = you have a streak but today isn't done yet (at risk of breaking).
- `goalMetric` (e.g. `minutes_spoken`) is a **label** surfaced in prompts/UI — no code computes it.

---

## 11. Voice (any voice/both pack)

A pack with `modality:voice`/`both` unlocks shadowing + roleplay in `daily`, plus the push-to-talk browser:

```bash
bun run serve          # http://localhost:3000 — runs the daily regimen
```

Needs `ELEVENLABS_API_KEY` (one key: TTS + Scribe STT). Per-card `native.mp3` plays in shadowing; roleplay uses the card-less `converse` turn. Per-topic `meta.voiceId` is wired (no `ELEVENLABS_VOICE_ID` needed). Alt STT: `RECALLIT_STT=openai` + `OPENAI_API_KEY`. Full voice internals, data flow, and provider swaps: **`docs/guides/03-operating-the-agent.md`**.

---

## 12. CLI reference (using a pack)

| Command | Purpose |
|---|---|
| `topic add <source> [--no-activate\|--force\|--no-audio]` | install a pack (dir/tgz/github:/git+/npm:) |
| `topic list` / `topic use <id>` / `topic show [<id>]` | list / switch / inspect active topic |
| `stats [--topic id]` | card count + due count |
| `due [--limit n] [--topic id]` | list cards due now |
| `card list\|search <q>\|add\|set\|rm [--topic id]` | inspect / CRUD cards |
| `preview <cardId> [--topic id]` | FSRS projections for a card |
| `agent [--topic id] [--model m] [--maxTurns n]` | interactive review loop (LLM) |
| `daily [--topic id] [--model m]` | full multi-phase session, checkpointed (LLM) |
| `answer <cardId> <text> [--topic id]` | evaluate + auto-grade (deterministic) |
| `review <cardId> <Again\|Hard\|Good\|Easy> [--topic id]` | grade directly (deterministic) |
| `rebuild [--topic id]` | rebuild the sqlite index |
| `pack review <pack-dir>` / `pack write <pack-dir>` | inspect / re-gate needs-review cards (no LLM) |
| `pack edit <id> "<instruction>" [--dry-run\|--auto]` | enhance a pack (additive = FSRS preserved) (LLM) |
| `bun run serve` | voice browser, runs daily regimen |

**LLM-backed** (`agent`, `daily`, `pack edit`) need `ANTHROPIC_API_KEY` and cost real money. **Deterministic** (`answer`, `review`, `due`, `stats`, `card *`, `pack review/write`) need no key and no spend.

---

## Honest caveats (recap)

- **Grading is lexical** — valid paraphrases grade Again; accents are normalized away.
- **needs-review is held back on install**, never auto-scheduled; the gate checks quote **presence**, not entailment — ready ≠ verified-correct.
- **Non-additive edits / `--force` re-installs RESET the FSRS schedule** — losing review history.
- **`agent`/`daily`/`pack edit` cost real API money** and require `ANTHROPIC_API_KEY`; voice requires `ELEVENLABS_API_KEY`.
- **Streaks are local-day** — set `RECALLIT_TZ` or they use UTC. `goalMetric` is a display label, not a measured quantity.