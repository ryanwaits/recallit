# recallit — Design system ("Bubble", Hallmark hum-07)

A warm, fresh, playful study tool: cream paper, cool near-black ink, a bright mint-green accent on rounded pills, and a green highlighter as the delight. Adapted from the Hallmark "Bubble" theme (`usehallmark.com/examples/hum-07`) and mapped onto recallit's token system, so the green highlighter becomes our cited-line motif. Source of truth for values: `marketing/tokens.css`; components: `marketing/styles.css`.

## Color (OKLCH)
Strategy: **warm cream canvas + cool near-black ink + one bright mint-green accent.** Green carries the action and the delight; everything else is cream and ink. Never `#000`/`#fff`.

- Paper: `oklch(97% 0.012 95)` page → `95.2%` band → `93.6% 0.016 92` card → `91.6%` well (warm cream, hue 95)
- Rules: `oklch(88% 0.012 95)` hairline, `82% 0.013 95` prominent
- Ink: `oklch(20% 0.012 250)` head/body → `30%` sub → `40%` secondary → `48% 0.012 250` muted. Note the **cool hue 250** tint on ink, against the warm-95 paper, the quiet warm/cool tension that makes it feel fresh, not flat.
- Accent (mint green): `oklch(80% 0.160 150)` bright fill, `52% 0.130 150` deep (text/links/hover), `93% 0.055 150` soft wash, `22% 0.012 250` dark ink-on-fill, `55% 0.150 150` focus
- Cited line / highlighter (green): `--color-cite-wash 86% 0.130 150`, `--color-cite-edge 72% 0.160 150` underline, `--color-cite-ink 26% 0.030 200`

## Typography
- **Display + body: Plus Jakarta Sans** (one family, like Bubble), a friendly geometric humanist sans. Heads weight **700–800**, tight tracking `-0.03em`, line-height ~1.0. The in-head emphasis word (`em`) gets the **green highlighter swipe** beneath it (Bubble's signature), not italic, not color.
- **Mono: JetBrains Mono** for cited source lines, the receipt, CLI snippets, kicker labels.
- Hierarchy from scale + weight + the bold-geometric-vs-mono contrast. Never gradient text. Body measure ≤ 60ch.

## Shape & depth (bubbly)
- Radii are generous: cards `22px`, inputs `16px`, chips + pills `999px`. Everything is rounded and soft.
- Buttons: **primary = bright-green pill** (mint fill, dark ink text, Bubble's signature CTA); **ghost = cream pill** (ink, hairline border). Hover deepens the green. 44px min target, focus ring.
- Borders: cream `1px` hairlines; sections separated by full-width rules (no colored side stripes).
- Shadows: soft and low; borders + the rounded fills carry the structure. No glassmorphism.

## Signature motif: "the cited line" (the green highlighter)
Bubble's delight is a green highlighter under headline words; recallit's is the same gesture, made load-bearing, it IS the wedge. A card shows your answer, then the verbatim source line in mono with the matched span in `<mark>`: a **green highlighter wash** (`--color-cite-wash`) + 2px underline, `box-decoration-break: clone`. On scroll-into-view the wash **swipes in left→right** (~420ms `--ease-out`, `background-size 0%→100%`); a small **green ✓** receipt reads "graded by code, matched your answer." `prefers-reduced-motion` shows it filled. The hero emphasis word uses the same green swipe. Reusable wherever a claim needs backing (hero `.cite`, the `qchip`, card mockups).

## Components (`marketing/styles.css`)
- `.btn--primary` green pill / dark text; `.btn--ghost` cream pill / ink + hairline.
- `.cite` the signature card (hero visual). `.qchip` the source-quote proof. `.term` recorded-run terminal (ink panel, mono).
- `.loop` numbered three-verb steps; `.cards`/`.card` trust pillars (label → head → sentence, NOT identical-icon grid); `.mini` subject chips; `.trust` quiet mono credibility row.
- Kicker pattern: mono uppercase label (`--tracking-label 0.10em`, pill) → Plus Jakarta head → body sub.

## Motion
`--ease-out: cubic-bezier(0.16,1,0.3,1)`; one-shot reveal-on-scroll (`.reveal`→`.in`); the green cited-line swipe. Never animate layout properties; always honor `prefers-reduced-motion`.

## Bans honored
No gradient text, no side-stripe borders (full rules + semantic top-rule on cited blocks), no default glassmorphism, no hero-metric stat row (the hero proof is the live cited card), no identical card grids, never `#000`/`#fff`.

## Responsive / a11y
Hero is 2-col (1.1fr/0.9fr) collapsing to 1-col; verified no overflow at 390px and 1280px. Tabular figures where numbers change; 44px tap targets; visible focus rings; contrast ≥4.5:1 body / ≥3:1 large.

## The stylesheets
- **Landing + demo** are built on the Hallmark "Bubble" template (hum-07): both link `hum-tokens.css` + `hum.css` (+ `hum.js`) and use Hallmark's classes (`.btn--mint`/`.btn--outline`, `.eyebrow`, `.nav` floating morph, `.section`/`.section__title`, `.chip`, the `em`/`.hl` green highlight).
  - The **landing** (`index.html`) uses the timeline (`.stage`/`.stage__node`), `.bignum` counters, `.voice` cards, `.plan` pricing, `.footer__statement`, plus our `.proof` cited-line card + `.rec-mark` (both in `hum.css`).
  - The **demo** (`demo/index.html` + `demo/demo.css`) reuses the nav/eyebrow/section/buttons and adds Bubble-styled interactive components in `demo.css`: `.tcard` (tutor card), `.tabs`/`.tab` (answer-pill toggles), `.grade`/`.grade__rating` (the rating badge: mint = good/easy, pear = hard, coral = again), `.checks`/`.check` (per-checkpoint rows, mint ✓ / muted ✗, source span wrapped in `.hl`), the `.flip` study card, and `.sched` schedule chips. The demo JS (`data.js`, `tutor.js`, inline) is unchanged; only classes + `demo.css` were restyled.
- **Pack pages** (`packs/*.html`, generated) still use our token-driven `tokens.css` + `styles.css` (also Bubble-themed). Their markup uses our `.mini`/`.qchip`/`.term`/`.sample` classes, so they re-skin from `tokens.css` rather than `hum.css`.

## How to swap themes
- The landing + demo follow whatever Hallmark theme is in `hum-tokens.css` / `hum.css` (replace those files + the font `<link>`s in `index.html` and `demo/index.html`). `demo.css` references only generic hum tokens (`--color-mint`, `--tint-pear`, etc.), so it follows along.
- The pack pages are token-driven: replace the values + font links in `marketing/tokens.css`, the head() link in `marketing/scripts/build-pack-pages.ts`, and `og-card.html`, then regenerate.
