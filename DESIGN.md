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

## Two stylesheets, on purpose
- **Landing (`index.html`)** is a faithful 1:1 port of the Hallmark "Bubble" template (hum-07): it links `hum-tokens.css` + `hum.css` + `hum.js` and uses Hallmark's own classes (`.btn--mint`, `.stage`/`.stage__node`, `.eyebrow`, `.chip`, `.bignum`, `.voice`, `.plan`, the floating `.nav`, `.footer__statement`), with recallit content and one recallit addition: the `.proof` cited-line card + `.rec-mark`. The numbered timeline, counters, voice cards, and pricing cards are Bubble's components verbatim.
- **Demo + pack pages** use our token-driven `tokens.css` + `styles.css` (also Bubble-themed: cream + mint-green + Plus Jakarta Sans). Their markup uses our component classes (`.flip`, `.cite`, `.grade`, `.mini`, `.qchip`, `.term`), so they can't share `hum.css` directly; they re-skin from `tokens.css`.

## How to swap themes
- The landing follows whatever Hallmark theme is dropped into `hum-tokens.css` / `hum.css` (replace those files + the font `<link>` in `index.html`).
- The demo + pack pages are token-driven: replace the values + font links in `marketing/tokens.css` (token *names* stay constant), update the `<link>` in `demo/index.html`, the head() link in `marketing/scripts/build-pack-pages.ts`, and `og-card.html`, then regenerate pack pages + OG.
