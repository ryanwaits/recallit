// Generate a static page per installed pack from its manifest.json + cards.json.
//
// Honest by construction: every number on the page is read straight from the
// pack files via the engine's own loadPack. The "ready / held" badge mirrors
// exactly what install does (cards flagged meta.status === "needs-review" are
// held back), so it never invents a verification score the pack doesn't carry.
// Built on the Hallmark "Bubble" theme (hum-tokens.css + hum.css + pack.css).
//
// Run: bun run marketing/scripts/build-pack-pages.ts

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { LoadedPack, PackCard } from "../../src/index.ts";
import { loadPack } from "../../src/index.ts";

const PACKS_DIR = join(import.meta.dir, "../../packs");
const OUT_DIR = join(import.meta.dir, "../packs");
const SAMPLE_AUDIO = 3;

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const held = (c: PackCard): boolean => c.meta?.status === "needs-review";

function typeBreakdown(cards: PackCard[]): string {
  const counts = new Map<string, number>();
  for (const c of cards) counts.set(c.type ?? "card", (counts.get(c.type ?? "card") ?? 0) + 1);
  return [...counts.entries()].map(([t, n]) => `${n} ${t}`).join(" · ");
}

function head(title: string, desc: string, cssDepth: string): string {
  return `<!doctype html>
<html lang="en" data-theme="hum">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}" />
    <meta name="theme-color" content="#faf6ee" />
    <link rel="icon" href="${cssDepth}favicon.svg" type="image/svg+xml" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="${cssDepth}hum-tokens.css" />
    <link rel="stylesheet" href="${cssDepth}hum.css" />
    <link rel="stylesheet" href="pack.css" />
  </head>
  <body>
    <header class="nav" id="nav">
      <div class="nav__inner">
        <a class="nav__brand" href="${cssDepth}index.html"><span class="rec-mark" aria-hidden="true"></span>recallit</a>
        <nav class="nav__links" aria-label="Primary">
          <a href="${cssDepth}index.html#stages">The method</a>
          <a href="index.html">Packs</a>
        </nav>
        <div class="nav__actions">
          <a class="btn btn--mint btn--sm" href="${cssDepth}demo/index.html">Try the demo</a>
        </div>
      </div>
    </header>`;
}

const foot = (cssDepth: string): string => `
    <script src="${cssDepth}hum.js"></script>
  </body>
</html>
`;

function packPage(pack: LoadedPack, audioFiles: string[]): string {
  const { manifest, cards, scenarios } = pack;
  const total = cards.length;
  const heldCount = cards.filter(held).length;
  const ready = total - heldCount;
  const voiced = cards.filter((c) => c.audio).length;
  const checkable = cards.filter((c) => c.meta?.grader === "coverage").length;
  const installCmd = `recallit topic add packs/${manifest.id}`;

  const stats = [
    `<li><b>${total}</b> cards</li>`,
    voiced ? `<li><b>${voiced}</b> voiced</li>` : "",
    checkable ? `<li><b>${checkable}</b> examiner-graded</li>` : "",
    scenarios.length ? `<li><b>${scenarios.length}</b> scenarios</li>` : "",
    `<li>${esc(typeBreakdown(cards))}</li>`,
    `<li>modality <b>${esc(manifest.modality)}</b></li>`,
  ]
    .filter(Boolean)
    .join("\n            ");

  const sampleRows = cards
    .filter((c) => c.audio && audioFiles.includes(c.audio))
    .slice(0, SAMPLE_AUDIO)
    .map(
      (c) => `
        <div class="sample">
          <div class="sample__txt">
            <span class="sample__front">${esc(c.front)}</span>
            <span class="sample__back">${esc(c.back)}</span>
          </div>
          <button class="btn btn--mint btn--sm sample__audio" type="button" data-src="audio/${manifest.id}/${esc(c.audio ?? "")}">
            <span aria-hidden="true">►</span> Hear it
          </button>
        </div>`,
    )
    .join("");

  // Sample the ready cards, checkable items first so a comprehension pack leads
  // with its tutor structure (the key points), not buried flashcards.
  const readyCards = cards.filter((c) => !held(c));
  const sampleCards = [
    ...readyCards.filter((c) => Array.isArray(c.meta?.rubric)),
    ...readyCards.filter((c) => !Array.isArray(c.meta?.rubric)),
  ].slice(0, 6);
  const cardTiles = sampleCards
    .map((c) => {
      const rubric = c.meta?.rubric as { claim: string; required: boolean }[] | undefined;
      const points = rubric?.length
        ? `<ul class="mini__points">${rubric
            .map((cp) => `<li${cp.required ? "" : ' class="opt"'}>${esc(cp.claim)}</li>`)
            .join("")}</ul>`
        : "";
      return `
          <article class="mini">
            <span class="mini__tag">${esc(rubric?.length ? "checkable" : (c.type ?? "card"))}</span>
            <p class="mini__q">${esc(c.front)}</p>
            <p class="mini__a">${esc(c.back)}</p>
            ${points}
          </article>`;
    })
    .join("");

  const heldNote = heldCount
    ? `${heldCount} card${heldCount === 1 ? "" : "s"} held for review`
    : "nothing held back";

  return `${head(`${manifest.name} · recallit pack`, manifest.recallStyle ?? `A recallit pack: ${manifest.name}.`, "../")}

    <main id="main" class="section pack">
      <header class="section__head pack__head">
        <p class="eyebrow"><span class="eyebrow__dot eyebrow__dot--mint"></span> recallit pack · ${esc(manifest.id)}</p>
        <h1 class="section__title">${esc(manifest.name)}</h1>
        ${manifest.recallStyle ? `<p class="section__lede">${esc(manifest.recallStyle)}</p>` : ""}
        <p class="pbadge"><b>${ready}/${total}</b> cards install · ${esc(heldNote)}</p>
        <ul class="stats">
            ${stats}
        </ul>
      </header>

      ${
        sampleRows
          ? `<section class="block" aria-label="Audio samples">
        <p class="eyebrow"><span class="eyebrow__dot eyebrow__dot--cyan"></span> Hear a few</p>
        <div class="samples">${sampleRows}
        </div>
      </section>`
          : ""
      }

      <section class="block">
        <p class="eyebrow"><span class="eyebrow__dot eyebrow__dot--pear"></span> Sample cards</p>
        <div class="gallery">${cardTiles}
        </div>
      </section>

      <section class="block install">
        <p class="eyebrow"><span class="eyebrow__dot eyebrow__dot--mint"></span> Install this pack</p>
        <div class="code"><pre>${esc(installCmd)}</pre></div>
        <p class="install__note">Every number here is read straight from the pack's <code>manifest.json</code> and <code>cards.json</code>. recallit installs only cards that pass its checks; anything flagged <code>needs-review</code> is held back, never guessed.</p>
      </section>
    </main>

    <script>
      const audio = new Audio();
      for (const btn of document.querySelectorAll(".sample__audio")) {
        btn.addEventListener("click", async () => {
          try {
            audio.src = btn.dataset.src;
            audio.currentTime = 0;
            await audio.play();
          } catch {
            btn.textContent = "Audio unavailable";
          }
        });
      }
    </script>
${foot("../")}`;
}

function indexPage(packs: LoadedPack[]): string {
  const accents = ["mint", "cyan", "pear", "coral"];
  const items = packs
    .map((p, i) => {
      const voiced = p.cards.filter((c) => c.audio).length;
      const checkable = p.cards.filter((c) => c.meta?.grader === "coverage").length;
      const ready = p.cards.filter((c) => !held(c)).length;
      const bits = [
        `${p.cards.length} cards`,
        `${ready} ready`,
        voiced ? `${voiced} voiced` : "",
        checkable ? `${checkable} examiner-graded` : "",
      ].filter(Boolean);
      return `
        <a class="packcard" data-accent="${accents[i % accents.length]}" href="${esc(p.manifest.id)}.html">
          <span class="packcard__tag"><span class="packcard__dot"></span>${esc(p.manifest.modality)} pack</span>
          <h3 class="packcard__name">${esc(p.manifest.name)}</h3>
          <p class="packcard__stats">${esc(bits.join(" · "))}</p>
          <span class="packcard__go">Open <span aria-hidden="true">→</span></span>
        </a>`;
    })
    .join("");

  return `${head("recallit packs", "Browse the recallit packs in this repo.", "../")}

    <main id="main" class="section pack">
      <header class="section__head">
        <p class="eyebrow"><span class="eyebrow__dot eyebrow__dot--mint"></span> Packs</p>
        <h1 class="section__title">A pack for anything.</h1>
        <p class="section__lede">Each pack is just cards plus optional audio, every one citing its source. Pick one to see its stats and install line, or build your own with <code>recallit pack &lt;source&gt;</code>.</p>
      </header>
      <div class="packlist">${items}
      </div>
    </main>
${foot("../")}`;
}

// ── Build ──────────────────────────────────────────────────────────
const entries = await readdir(PACKS_DIR, { withFileTypes: true });

const built: LoadedPack[] = [];
for (const dir of entries.filter((e) => e.isDirectory())) {
  const packDir = join(PACKS_DIR, dir.name);
  if (!(await Bun.file(join(packDir, "manifest.json")).exists())) continue;

  const pack = await loadPack(packDir);

  // Copy only the sample audio this page plays into packs/audio/<id>/.
  const audioCards = pack.cards.filter((c) => c.audio).slice(0, SAMPLE_AUDIO);
  const audioFiles: string[] = [];
  for (const c of audioCards) {
    if (!c.audio) continue;
    await Bun.write(
      Bun.file(join(OUT_DIR, "audio", pack.manifest.id, c.audio)),
      Bun.file(join(packDir, "assets", c.audio)),
    );
    audioFiles.push(c.audio);
  }

  await Bun.write(join(OUT_DIR, `${pack.manifest.id}.html`), packPage(pack, audioFiles));
  built.push(pack);
}

await Bun.write(join(OUT_DIR, "index.html"), indexPage(built));
console.log(`built ${built.length} pack page(s) -> marketing/packs/`);
for (const p of built) console.log(`  ${p.manifest.id}: ${p.cards.length} cards`);
