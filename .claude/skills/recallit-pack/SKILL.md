---
name: recallit-pack
description: Create or refine a recallit spaced-repetition pack from any source — a PDF, a URL/article, a code repo, or a plain concept described in natural language. Use when the user wants to "make a deck/pack", "turn this PDF/article/repo into flashcards", "study X with recallit", runs "/recallit-pack <source>", or wants to tweak an existing pack ("add 10 cards on chapter 3", "fix card 7", "edit the zod pack"). Generates HONEST, source-grounded cards and installs them as a recallit topic.
---

# recallit-pack

Turn any source into an honest recallit pack, then install it. You ARE the pack-author loop: you read the source, draft cards grounded in it, gate them for honesty, preview, then install via the existing CLI. **No engine changes** — you write pack files by hand and install with `topic add`.

The non-negotiable: **cards must be honest.** Every card carries a `meta.sourceQuote` copied *verbatim* from the source. A card whose quote is not a literal substring of the saved source is **needs-review**, never silently installed. You cannot vibe-grade this — run the substring check.

## Mental model

A pack is plain files under `packs/<id>/`:

```
packs/<id>/
  manifest.json        # { schemaVersion:1, engine:">=0.1.0", id, name, modality, meta }
  cards.json           # all cards; the gate stamps meta.status:"needs-review" on flagged ones
  .author/source.txt   # the grounding corpus of record (raw extracted source text)
```

`cards.json` is the single source of truth for a pack. The engine owns the honesty split: `bun run cli pack write` stamps `meta.status:"needs-review"` on cards whose quote isn't in the source, and `topic add` installs **only** the ready cards (it skips needs-review automatically). The pack stays on disk, re-editable.

## Step 0 — resolve the mode (this is the only thing that differs by how you were invoked)

- **B · conversational (default).** Scope briefly, preview ~3 samples, let the user steer, confirm, install. Use this unless told otherwise.
- **C · ambient.** The user described intent in prose ("turn this pdf into a deck of only the actionable stuff"). Parse source + filter + scope **from their words** — do not interrogate. Echo one line: *"Here's what I understood: …"* then proceed as B.
- **A · one-shot.** The user said "just do it" / "no preview" / passed `--auto`. Skip the preview; generate, gate, install ready cards, report. Still never auto-install needs-review or web-grounded cards.

State which mode you're in. When unsure, default to B.

## Step 1 — ingest the source → `.author/source.txt`

Classify the source and extract its text into `packs/<id>/.author/source.txt` (the corpus every card must quote from). Pick `<id>` as a kebab-case slug of the title/source.

| Source | How |
|---|---|
| **PDF / local file** | `Read` the file (Read handles PDFs natively — no library). For a book, read in page ranges. |
| **URL / article** | `WebFetch` the URL for clean text. If it's a JS app / paywall / cookie-wall and you get nothing usable, use the `agent-browser` skill. |
| **Concept / idea (no doc)** | Research-first: `WebSearch` the concept + subtopics, `WebFetch` 3–5 reputable hits, and write the evidence (quote + url per line) into `source.txt`. Set `meta.grounding: "web"` on the manifest. The concept name seeds queries — it is **never** card content. |
| **Code repo** | `git clone --depth 1` to a temp dir; use `package.json` exports / README / `.d.ts` / examples as the surface. (Repo adapter is lightweight in Phase 1 — prefer README + exported API.) |

**Precondition (do not skip):** if the corpus is empty or near-empty (image-only/scanned PDF, paywalled page that returned nothing), **abort with a clear message** ("this PDF looks image-only — I can't extract text"). Never emit cards from an empty corpus.

## Step 2 — scaffold `manifest.json`

```json
{
  "schemaVersion": 1,
  "engine": ">=0.1.0",
  "id": "<slug>",
  "name": "<Human Title>",
  "modality": "text",
  "meta": { "source": { "kind": "pdf|url|repo|concept", "ref": "<path-or-url>" }, "grounding": "source" }
}
```

Use `"grounding": "web"` for concept packs. `modality: "text"` in Phase 1 (no audio).

## Step 3 — draft cards (grounded in the corpus)

Walk the corpus front to back. For each fact/term/claim worth remembering, emit a card object:

```json
{
  "type": "qa",
  "front": "What is the two-minute rule?",
  "back": "Scale a new habit down so it takes under two minutes to start.",
  "context": "optional surrounding sentence",
  "tags": ["habits"],
  "meta": { "sourceQuote": "<VERBATIM span copied from source.txt>", "locator": "p.162" }
}
```

Honesty rules, strictly:
- `meta.sourceQuote` MUST be copied verbatim from `source.txt` (a literal substring). **No quote → no card.**
- `back` must be entailed by the quote, not your outside knowledge. If the quote doesn't support the answer, don't write the card.
- Don't introduce numbers or proper nouns in `back` that aren't in the quote/context.
- `type` is free-form (`qa` / `term` / `cloze` / `concept`); keep `front`/`back` tight.

Bias toward fewer, sharper cards over exhaustive coverage. A reasonable article → ~15–30 cards; a chapter → ~10–20.

## Step 4 — preview & steer (modes B and C)

Draft **~3 sample cards from the first chunk only**, confirm each one's `sourceQuote` is a literal substring of the source, and show them:

```
1. [ready]  Q: What is the two-minute rule?
            A: Scale a new habit down so it takes under two minutes to start.
            ⮡ p.162 · "…it should take less than two minutes to do."
2. [needs-review: unverified-number]  Q: …  A: …
```

Then: *"Steer these (e.g. 'fewer definitions', 'focus chapter 3', 'make them recall the why') or say 'go'."* Regenerate on feedback. This gates scope **before** spending effort on the whole source. Skip this step in mode A.

## Step 5 — write & gate (engine-owned, deterministic — DON'T hand-grade)

Write all drafted cards to `packs/<id>/cards.json` (a JSON array; no `status` field yet), then run the engine gate:

```bash
bun run cli pack write packs/<id>
# → "23/25 ready, 2 need review (grounding: source)" + each flagged front + reason codes
```

`pack write` (engine code, `src/packgen/gate.ts`) re-reads `manifest.json` + `cards.json` + `.author/source.txt`, verifies every `meta.sourceQuote` is a literal substring of the corpus, runs the quality + number/proper-noun checks + dedup, **stamps `meta.status:"needs-review"` (+ `meta.reviewReasons`) on flagged cards**, and rewrites `cards.json`. You cannot talk past it — the gate is code. Reason codes: `quote-not-in-corpus`, `missing-source-quote`, `unverified-number`, `unverified-proper-noun`, `duplicate-front`, `quality:*`.

## Step 6 — report

Tell the user honestly: `N ready, M need review`, the pack path, and the flagged fronts + reasons. `bun run cli pack review packs/<id>` lists the flagged cards any time. Flagged cards stay in `cards.json` (tagged) — preserved for `edit`, never installed.

## Step 7 — install

Modes B/C: confirm first (*"Install these N cards as topic '<id>'?"*). Mode A: install directly. For `grounding:"web"` packs, always show the unverified list + an "attribution-only, not authoritative" note and require an explicit yes.

```bash
bun run cli topic add packs/<id>     # installs READY cards only — skips needs-review automatically
```

Then point them onward:
```bash
bun run cli stats --topic <id>       # totalCards, dueNow
bun run cli daily --topic <id>       # study it
```

## Editing / enhancing a pack (`/recallit-pack edit <id>`)

`cards.json` is the source of truth. To tweak: `Read` `packs/<id>/cards.json` + `.author/source.txt`, apply the natural-language instruction (add N from a section, fix a card, split, merge) by editing `cards.json`, then re-gate and re-install:

```bash
bun run cli pack write packs/<id>          # re-gates the whole set (substring + quality + dedup)
bun run cli topic add packs/<id> --force   # re-install
```

**Surface this caveat before `--force`:** re-installing does a full rebuild and **resets the FSRS review schedule/history for this topic** (v1 limitation; non-destructive enhance is a planned engine change). Ask the user to confirm: *"This resets your review progress for '<id>'. Proceed?"*

`pack write` dedups by `normalize(front)` across the whole set, so adding cards won't introduce an exact-duplicate `front` (it catches exact dupes, not paraphrases).

## Honest about the guarantee

The substring gate verifies the quote is **present** in the source, not that the `back` faithfully **interprets** it. Flag cards whose answer adds numbers/proper-nouns not in the quote. Don't oversell: say "every card cites a verbatim line from the source you can check," not "every card is verified true."
