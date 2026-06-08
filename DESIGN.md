# recallit — Design system ("Margin": clean light tutor)

A clean, light study tool: near-white paper, a bold geometric sans, near-black ink, and one vermilion **mark** that means "this was checked." It borrows the clarity of a modern friendly-minimal learning tool (light canvas, big confident type, pill buttons, soft cards) and makes it ours through a single confident accent and the cited-line motif, never rainbow delight or cartoon mascots. Source of truth for values: `marketing/tokens.css`; components: `marketing/styles.css`.

## Color (OKLCH)
Strategy: **near-white canvas + near-black ink + one rationed vermilion mark.** The surface is white/grey/ink (clean, lots of air). Color appears only as the vermilion accent, used sparingly: kicker labels, the brand dot, links, the cited-line ✓, the in-head emphasis word. Primary buttons are **near-black** (not the accent). The amber highlighter is reserved for the cited source span. Grades are not a red/green traffic light; the accent is the brand mark, not a status color. Never `#000`/`#fff`; neutrals carry a faint warm hue (55–80).

- Paper: `oklch(99% 0.004 80)` page → `97.4%` band → `96.2% 0.006 80` card → `94.6%` well
- Rules: `oklch(90.5% 0.006 80)` hairline (1px), `85% 0.007 80` prominent
- Ink: `oklch(20% 0.010 55)` head/body + primary-pill fill → `31%` sub → `43%` secondary → `52% 0.010 70` muted (≥4.5:1 on white)
- Accent (vermilion, the mark): `oklch(55% 0.190 33)`, `48% 0.200 32` deeper/small-text, `94% 0.040 38` soft wash, `99% 0.004 80` text-on-fill, `50% 0.190 33` focus
- Cited line (amber): `--color-cite-wash 92% 0.085 95`, `--color-cite-edge 80% 0.110 92` underline, `--color-cite-ink 32% 0.050 72`
- On dark (code/term, ink pills): `97% 0.006 80` text, `74% 0.008 80` muted, `74% 0.150 36` accent-on-dark

## Typography
- **Display: Bricolage Grotesque** (variable, `opsz` auto), the bold friendly-geometric voice. Heads at weight **700**, tracking `-0.025em`, line-height ~1.0. The in-copy emphasis (`em`, the memorable clause) is set in the **vermilion accent**, normal style, not italic. This is the friendly-modern feel of the reference, in a distinct face.
- **Body/UI: Hanken Grotesk** (humanist grotesk, warm, open). Body 400 at 1.125rem/1.6; labels 500–600.
- **Mono: JetBrains Mono** for cited source lines, the receipt, CLI snippets, kicker labels. Mono = "this is the verbatim, unedited source," reinforcing the wedge.
- Hierarchy is scale + weight + the bold geometric display vs clean grotesk body. Never gradient text. Body measure ≤ 60ch.

## Shape & depth
- Radii: cards `16px`, inputs `12px`, chips `8px`, pills `999px`. Pills for CTAs, kickers, nav chips; cards are rounded-rect.
- Buttons: **primary = near-black pill** (ink fill / paper text), **ghost = white pill** (ink, hairline border), echoing the reference's clean black-pill system.
- Borders: light `1px` hairlines; sections separated by full-width rules (never a colored side stripe).
- Shadows: shallow and clean (`0 1px 3px / 0.10` + a soft long lift), borders carry the structure, not heavy elevation. No glassmorphism.

## Signature motif: "the cited line"
The delight is quiet, earned, and load-bearing, it IS the wedge (this is what makes it ours, not the reference's rainbow). A card shows your answer, then the verbatim source line in mono with the matched span wrapped in `<mark>`: an **amber highlighter wash** (`--color-cite-wash`) + 2px `--color-cite-edge` underline, `box-decoration-break: clone`. On scroll-into-view the wash **swipes in left→right** (~420ms `--ease-out`, `background-size 0%→100%`); a small **vermilion ✓** receipt reads "graded by code, matched your answer." `prefers-reduced-motion` shows it filled. Reusable wherever a claim needs backing (hero `.cite`, the `qchip`, card mockups).

## Components (`marketing/styles.css`)
- `.btn--primary` near-black pill / paper text; `.btn--ghost` ink outline on white. 44px min target, focus ring.
- `.cite` the signature card (hero visual). `.qchip` the source-quote proof. `.term` recorded-run terminal (ink panel, mono).
- `.loop` numbered three-verb steps; `.cards`/`.card` trust pillars (label → head → sentence, NOT identical-icon grid); `.mini` subject chips; `.trust` quiet mono credibility row.
- Kicker pattern: mono uppercase label (`--tracking-label 0.10em`) → Bricolage head → Hanken sub.

## Motion
`--ease-out: cubic-bezier(0.16,1,0.3,1)`; one-shot reveal-on-scroll (`.reveal`→`.in`); the cited-line swipe. Never animate layout properties; always honor `prefers-reduced-motion`.

## Bans honored
No gradient text, no side-stripe borders (sections use full rules + the semantic top-rule on cited blocks), no default glassmorphism, no hero-metric stat row (the hero proof is the live cited card), no identical card grids, no rainbow edge, no mascots, never `#000`/`#fff`.

## Responsive / a11y
Hero is 2-col (1.1fr/0.9fr) collapsing to 1-col; verified no overflow at 390px and 1280px. Tabular figures where numbers change; 44px tap targets; visible focus rings; contrast ≥4.5:1 body / ≥3:1 large.
