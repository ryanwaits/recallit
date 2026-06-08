# recallit — Design system ("Margin": warm editorial tutor)

A warm reading-room for the web: cream paper, a confident soft-serif voice, and one act of honesty made visible (the highlighted, cited source line). Inspired by friendly-minimal learning tools but unmistakably warm and literary, the anti-flashy-SaaS. Source of truth for values: `marketing/tokens.css`; components: `marketing/styles.css`.

## Color (OKLCH)
Strategy: **warm-neutral canvas + one earned accent.** The whole surface is cream/ink. Color appears in exactly two places: the **terracotta** accent (action + brand) and the **amber highlighter** (only ever behind a cited source line). Grades are NOT colored red/green; honest means calm, not a traffic light. Never `#000`/`#fff`; every neutral carries warm hue 52–75.

- Paper: `oklch(97% 0.014 75)` → `94.8% 0.020 72` → `92.5% 0.024 70` (card) → `90% 0.026 68` (well)
- Rules: `oklch(85% 0.018 72)` hairline, `74% 0.022 70` prominent
- Ink: `oklch(21% 0.016 52)` head/body → `29%` sub → `38%` secondary → `48% 0.022 58` muted (≥4.5:1 on cream)
- Accent (terracotta): `oklch(60% 0.135 45)` fill, `52% 0.150 42` hover, `92% 0.045 50` soft tint, `97% 0.014 75` text-on-fill, `48% 0.160 45` focus
- Cited line (amber): `--color-cite-wash 91% 0.090 95`, `--color-cite-edge 80% 0.110 92` (underline), `--color-cite-ink 34% 0.060 75`
- On dark (code/term): `94% 0.016 75` text, `73% 0.016 72` muted, `74% 0.120 50` accent-on-dark

## Typography
- **Display: Fraunces** (variable serif, `opsz` auto). Heads at weight **900**, tracking `-0.02em`, line-height ~1.0. Italic Fraunces (weight 500, terracotta) for the in-copy aside, the memorable clause. This soft-serif voice is the single strongest signal that this is the literary, honest-tutor brand, not another geometric-sans AI tool.
- **Body/UI: Hanken Grotesk** (humanist grotesk, warm, open). Body 400 at 1.125rem/1.6; labels 500–600.
- **Mono: JetBrains Mono** for cited source lines, the receipt, CLI snippets, kicker labels. Mono = "this is the verbatim, unedited source", reinforcing the wedge.
- Hierarchy is scale + weight contrast (900 display vs 400 body) plus serif/grotesk and roman/italic contrast. Never gradient text. Body measure ≤ 60ch.

## Shape & depth
- Radii: cards `18px`, inputs `12px`, chips `8px`, pills `999px`. Pills for CTAs, kickers, nav chips; cards are rounded-rect.
- Borders: warm `1px` hairlines; sections separated by full-width rules (never a colored left/side stripe).
- Shadows: soft, warm-tinted, low (`0 8px 24px -14px oklch(40% 0.06 50 / 0.18)`); cards lift slightly on hover. No glassmorphism.

## Signature motif: "the cited line"
The delight is quiet, earned, and load-bearing, it IS the wedge. A card shows your answer, then beneath it the verbatim source line in mono, with the matched span wrapped in `<mark>`: an **amber highlighter wash** (`--color-cite-wash`) with a 2px `--color-cite-edge` underline, drawn with `box-decoration-break: clone`. On scroll-into-view the wash **swipes in left→right** (~420ms `--ease-out`, via `background-size 0%→100%`), like a pen stroke; a small terracotta **✓** receipt reads "graded by code, matched your answer." `prefers-reduced-motion` shows it filled, no animation. Reusable anywhere a claim needs backing (hero `.cite`, the `qchip`, card mockups). Optional restrained spot art: single-weight ink line-drawings (book, highlighter, margin bracket), never mascots, never color.

## Components (`marketing/styles.css`)
- `.btn--primary` terracotta pill / cream text; `.btn--ghost` ink outline on cream. 44px min target, focus ring.
- `.cite` the signature card (hero visual). `.qchip` the source-quote proof. `.term` recorded-run terminal (ink panel, mono).
- `.loop` numbered three-verb steps; `.cards`/`.card` trust pillars (label → head → sentence, NOT identical-icon grid); `.mini` subject chips; `.trust` quiet mono credibility row.
- Kicker pattern: mono uppercase label (`--tracking-label 0.14em`) → Fraunces head → Hanken sub.

## Motion
`--ease-out: cubic-bezier(0.16,1,0.3,1)`; one-shot reveal-on-scroll (`.reveal`→`.in`); the cited-line swipe. Never animate layout properties; always honor `prefers-reduced-motion`.

## Bans honored
No gradient text, no side-stripe borders (sections use full rules + the semantic top-rule on cited blocks), no default glassmorphism, no hero-metric stat row (the hero proof is the live cited card), no identical card grids (pillars vary by content, examples are subject chips), never `#000`/`#fff`.

## Responsive / a11y
Hero is 2-col (1.1fr/0.9fr) collapsing to 1-col; verified no overflow at 390px and 1280px. Tabular figures where numbers change; 44px tap targets; visible focus rings; contrast ≥4.5:1 body / ≥3:1 large.
