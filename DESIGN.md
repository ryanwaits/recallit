# recallit — Design system ("The Reading Room")

A calm, literary study tool: warm cream paper, cool near-black ink, and one bright mint mark reserved for a single job, the grade. Where "Bubble" (the old system) put a bright accent on every button and card, the Reading Room spends it on nothing until code has actually checked your answer. Source of truth for values: `marketing/tokens.css`; components: `marketing/styles.css`.

> Scope: this system covers `marketing/index.html` and `marketing/demo/*`. The pack pages (`marketing/packs/*`) still run on the earlier "Bubble" stack (`hum-tokens.css` + `hum.css` + `pack.css`) and are unaffected — they were never wired to `tokens.css`, so there was nothing to migrate to break.

## Color
Strategy: **warm cream canvas + cool near-black ink + mint used exactly once, for the grade.**

- Paper: `#fbf9f4` page → `#f4f1e9` band → `#ece8dd` card, warm cream.
- Rule: `#e4e0d5` hairline, `#d2cdbf` prominent.
- Ink: `#1b1b1e` head/body → `#3a3a40` secondary → `#77756e` muted. Never `#000`/`#fff`.
- Mint (the grade, and only the grade): `#59e3ac` edge, `#d9f9ec` pale fill, `#1e7a5c` deep (✓, the "good"/"easy" rating).
- The other two ratings get the same restraint, not a rainbow: `#fbf4dc` pale / `#8a6d1e` deep for "hard", `#fbdcdc` pale / `#a33d39` deep for "again".
- Dark mode swaps paper for `#161614`→`#26261f` and ink for `#ebe6da`, with mint shifted to `#1e9382`/`#7de3bf` for the same contrast job. Full values in `tokens.css`.

## Typography
- **Display + body: Spectral**, a literary screen serif (400 body, 500 for emphasis, italic where a line is quoted). This is the one thing that reads "reading room" instead of "app": headlines and the running copy underneath them share the same warm serif, not a bold geometric sans.
- **Mono: JetBrains Mono** — kickers, the receipt, ratings (`again` `hard` `good` `easy`), CLI/terminal.
- **Sans: Inter**, used sparingly for small UI meta text only (fine print under a CTA, footer links, receipt secondary text) — never for headlines or body copy.
- Body measure ≤ 62ch. Hierarchy comes from serif-vs-mono contrast and scale, never gradient text, never bold-everything.

## Shape & depth
- Radii came down from Bubble's 22px to **10–12px** on cards, 999px stays for pills.
- Buttons are **ink pills**: primary = filled ink / cream text; ghost = outlined ink. Buttons are never mint — that would spend the grade's only color on something that isn't a grade.
- Sections are separated by full-width hairline rules, not colored bands. No side-stripe borders.
- Shadows are soft and reserved for the hero deck and a couple of lifted cards; most surfaces are flat, bordered.

## The hero object: the deck + the receipt
The card is the whole brand and repeats at every scale (hero deck, the subject minis). Three stacked, slightly rotated cards (`.deck` / `.dcard`) put one real example on top: a question in serif, your answer in a plain sans line, then **the receipt** — a small mono "Good" pill, why, and the verbatim cited source line with the matched span in `<mark>`. The mint highlighter wash lives in exactly one place: under that matched span, and on the "good"/"easy" rating pill. Nowhere else in the page does mint appear. `prefers-reduced-motion` and the static build both render the mark filled, no swipe-in animation is required for it to read.

## Components (`marketing/styles.css`)
- `.nav` / `.wrap` — plain top rule, no floating/blur morph.
- `.btn` / `.btn.primary` / `.btn.ghost` — mono-label ink pills.
- `.deck` / `.dcard` / `.receipt` / `.ratings` — the signature card and its grade.
- `.sec` / `.sec-head` — the section grammar: a left mono kicker column + serif heading + lede, full-width top rule. No hero-metric stat rows, no identical icon-card grids.
- `.steps` / `.step` — numbered process (serif numeral, not a badge).
- `.ledger` — the "honest math" rows (a serif number + a sentence, not a stat tile).
- `.subjects` / `.mini` — the card motif at small scale, one per subject (book / language / paper).
- `.run` / `.term` — pricing columns + a monochrome terminal block (ink bg, cream text; no mint syntax highlighting).
- `.close` / `.foot` — plain, left-aligned, no accent-filled CTA band.

## Motion
`--ease-out: cubic-bezier(0.16,1,0.3,1)`. Kept intentionally quiet: no floating nav morph, no bubbling jar, no starter-pop. `prefers-reduced-motion` disables what little there is.

## Bans honored
No gradient text, no side-stripe borders, no glassmorphism, no hero-metric stat row, no identical card grids, never `#000`/`#fff`, and — new for this system — **no mint outside the grade** (not on buttons, not on nav, not as a generic "brand color").

## Responsive / a11y
Hero is 1.05fr/0.95fr collapsing to 1-col at 820px; verified no overflow at 390px and 1280px, light and dark. 44px minimum tap targets on buttons; visible focus rings (`--focus`, mint-deep); contrast ≥4.5:1 body / ≥3:1 large.

## The stylesheets
- **Landing** (`marketing/index.html`) and **demo** (`marketing/demo/index.html` + `demo/demo.css`) link `tokens.css` + `styles.css` directly. No `hum-tokens.css`/`hum.css`/`hum.js`.
- **Pack pages** (`marketing/packs/*.html`, generated by `marketing/scripts/build-pack-pages.ts`) still link `hum-tokens.css` + `hum.css` + `pack.css` and use Hallmark's Bubble grammar (`.btn--mint`, `.eyebrow`, `.nav` floating morph). Bringing them onto the Reading Room system is future work, tracked separately; nothing in this pass depends on it.

## How to swap themes
- Landing + demo: replace the values in `tokens.css` and the font `<link>` in `index.html` + `demo/index.html`; everything in `styles.css` and `demo.css` is token-driven.
- Pack pages: unrelated, see above.
