# Dogfooding the recallit Studio (browser, end to end)

Build a real tutor in the Studio from your own materials, then study it — and watch the
honesty wedge work. ~10 minutes; costs a few cents to ~$1 of your Anthropic key per build.

## 0. Prereqs (one-time)
- **Bun** installed (the engine is Bun-only).
- On the feature branch: `git checkout feat/courses-and-styles`.
- An **`ANTHROPIC_API_KEY`** in the repo-root `.env` (BYO-key — the build chat + authoring + grading all use it):
  ```
  grep -q ANTHROPIC_API_KEY .env && echo "key present" || echo "ADD ANTHROPIC_API_KEY=... to .env"
  ```
- Install Studio deps:
  ```
  cd studio && bun install && cd ..
  ```

## 1. Start the Studio (one terminal)
Build the front-end, then run the Bun server **from the repo root** (so authored packs land in
`./packs` and the engine resolves). Use an **isolated data dir** so finalized tutors don't touch
your real decks, and a spend cap:
```
cd studio && bun run build && cd ..
PORT=3199 STUDIO_MAX_BUDGET=2 RECALLIT_DATA_DIR="$HOME/.recallit-dogfood" \
  bun --env-file=.env studio/server.ts
```
Open **http://localhost:3199**.

> Iterating on the UI instead of just using it? Run the server (above, on `PORT=3001`) in one
> terminal and `cd studio && bun run dev` in another, then open the Vite URL (`:5173`) for hot
> reload — it proxies `/api` to the server.

## 2. Build a tutor (the 3-step flow)
**① Topic** — describe what to teach + pick a pedagogy:
- Type a focused goal (this is the *shaping* — don't ask for the kitchen sink), e.g.
  *"The case against solar/wind, focused on cost and grid reliability."*
- Pick a style: **Spaced retention** (default), **Compliance** (rules: recall + apply), or
  **Onboarding** (situational). The pick now really shapes the cards. → **Continue**.

**② Materials** — give it sources (test all three paths):
- **A file:** drag a PDF/`.md`/`.txt` onto the dropzone (or *choose*).
- **A link:** paste a URL → **Add link** (e.g. `https://energytalkingpoints.com/wind-cheap/`).
- **Multi-source:** add a *second* link/file (e.g. `…/energy-transition/`) — both become chips.
- (Describe-only also works — skip sources and it authors from your topic.) → **Start building**.

**③ Shape** — the chat authors live:
- Watch the **honesty ledger** fill in (Reading → Drafting → Running the honesty gate) with a
  live status line — no dead air.
- It reports e.g. *"16 of 18 ready, 2 held."* Click **Review now** to see held cards + the machine
  reason (e.g. `unverified-number`). Use **Ground it** (prefills the chat to add a source) or **Drop**.
- Refine in chat if you want: *"make the fronts debate-ready,"* *"add 5 more on reliability."*
- When happy, say *"finalize it"* → a **Tutor ready** card appears with a copy-able study command.

## 3. Study the finalized tutor
Copy the command from the Tutor-ready card (or build it yourself):
```
RECALLIT_DATA_DIR="$HOME/.recallit-dogfood" bun run src/cli.ts daily --topic <courseId>
```
`daily` is an interactive session (type your answers). Other ways to poke it:
```
# what's due + the cards
RECALLIT_DATA_DIR="$HOME/.recallit-dogfood" bun run src/cli.ts due --topic <courseId> --limit 5

# grade one answer (honest, code-owned) — try a right and a wrong answer
RECALLIT_DATA_DIR="$HOME/.recallit-dogfood" bun run src/cli.ts answer <cardId> "your answer"

# progress
RECALLIT_DATA_DIR="$HOME/.recallit-dogfood" bun run src/cli.ts stats --topic <courseId>
```
**GUI study (keyless, no key needed — real grading):**
```
RECALLIT_DATA_DIR="$HOME/.recallit-dogfood" bun run serve:local
```
Open the printed URL → pick your tutor in the gallery → flip cards, type answers, see grades.

## 4. What "working" looks like (the checklist)
- ✅ A URL/file you attach gets **fetched + grounded** (the agent reads it itself).
- ✅ The gate **holds** cards it can't ground, with a reason code — and says so plainly.
- ✅ Multi-source: 2 links → **one** tutor whose cards quote **both**.
- ✅ Pedagogy matters: **Compliance** yields more "what's the rule / what do you do" comprehension
  cards; **Spaced retention** is a flashcard-leaning mix.
- ✅ Studying: a right answer grades **Good**, a wrong one **Again** — code-owned, no flattery.

## 5. Cost + cleanup
- Each build's authoring is a real keyed call (~$0.10–$1, capped by `STUDIO_MAX_BUDGET`).
- Draft packs are written to `./packs/<id>` during authoring. Remove the dogfood drafts (keep the
  committed ones — `spanish-mx-rgv`, `are-pcm`, `architecture`):
  ```
  git status --short packs/        # shows untracked drafts
  # rm -rf packs/<your-draft-id>
  ```
- Finalized tutors live in `~/.recallit-dogfood` (isolated). Wipe with `rm -rf ~/.recallit-dogfood`.

## 6. Troubleshooting
- **503 "BYO-key"** on build → `ANTHROPIC_API_KEY` isn't loaded; confirm it's in root `.env` and you
  used `--env-file=.env`.
- **Author errors / packs not written** → you're not running from the repo **root**; `cd` to the
  repo root before `bun … studio/server.ts`.
- **FE changes not showing** → rebuild (`cd studio && bun run build`) or use dev mode (step 1 note).
- **Studio overwrote a draft** → packs are keyed by the first source's slug; reusing the same source
  reuses the same `packs/<id>`.
