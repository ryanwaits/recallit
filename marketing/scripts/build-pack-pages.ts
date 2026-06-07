// Generate a static page per installed pack from its manifest.json + cards.json.
//
// Honest by construction: every number on the page is read straight from the
// pack files via the engine's own loadPack. The "ready / held" badge mirrors
// exactly what install does (cards flagged meta.status === "needs-review" are
// held back), so it never invents a verification score the pack doesn't carry.
// No engine code is touched; this only consumes existing exports.
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
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}" />
    <link rel="icon" href="${cssDepth}favicon.svg" type="image/svg+xml" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&family=Newsreader:ital,opsz@1,18&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="${cssDepth}tokens.css" />
    <link rel="stylesheet" href="${cssDepth}styles.css" />
    <link rel="stylesheet" href="pack.css" />
  </head>
  <body>
    <header class="nav">
      <div class="wrap nav__inner">
        <a class="brand" href="${cssDepth}index.html"><span class="brand__dot" aria-hidden="true"></span>recallit</a>
        <a class="btn btn--ghost" href="${cssDepth}index.html">← Home</a>
      </div>
    </header>`;
}

function packPage(pack: LoadedPack, audioFiles: string[]): string {
  const { manifest, cards, scenarios } = pack;
  const total = cards.length;
  const heldCount = cards.filter(held).length;
  const ready = total - heldCount;
  const voiced = cards.filter((c) => c.audio).length;
  const checkable = cards.filter((c) => c.meta?.grader === "coverage").length;
  const installCmd = `bun run cli topic add packs/${manifest.id}`;

  const stats = [
    `<li><b>${total}</b> cards</li>`,
    voiced ? `<li><b>${voiced}</b> voiced</li>` : "",
    checkable ? `<li><b>${checkable}</b> examiner-graded</li>` : "",
    scenarios.length ? `<li><b>${scenarios.length}</b> scenarios</li>` : "",
    `<li>${esc(typeBreakdown(cards))}</li>`,
    `<li>modality <b>${esc(manifest.modality)}</b></li>`,
  ]
    .filter(Boolean)
    .join("\n          ");

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
          <button class="sample__audio" type="button" data-src="audio/${manifest.id}/${esc(c.audio ?? "")}">
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
  ].slice(0, 8);
  const cardTiles = sampleCards
    .map((c) => {
      const rubric = c.meta?.rubric as { claim: string; required: boolean }[] | undefined;
      // A checkable item shows the key points the answer must cover (the tutor structure).
      const points = rubric?.length
        ? `<ul class="mini__points">${rubric
            .map((cp) => `<li${cp.required ? "" : ' class="opt"'}>${esc(cp.claim)}</li>`)
            .join("")}</ul>`
        : "";
      return `
            <article class="mini">
              <span class="mini__tag label">${esc(rubric?.length ? "checkable" : (c.type ?? "card"))}</span>
              <p class="mini__q">${esc(c.front)}</p>
              <p class="mini__a">${esc(c.back)}</p>
              ${points}
            </article>`;
    })
    .join("");

  const heldNote = heldCount
    ? `${heldCount} card${heldCount === 1 ? "" : "s"} flagged needs-review are held back.`
    : "Nothing held back.";

  return `${head(`${manifest.name} · recallit pack`, manifest.recallStyle ?? `A recallit pack: ${manifest.name}.`, "../")}

    <main class="wrap pack">
      <section class="pack__head">
        <span class="label pack__kicker">recallit pack · ${esc(manifest.id)}</span>
        <h1>${esc(manifest.name)}</h1>
        ${manifest.recallStyle ? `<p class="pack__lede">${esc(manifest.recallStyle)}</p>` : ""}
        <div class="badge" aria-label="Cards ready to install">
          <span class="badge__n">${ready}/${total}</span>
          <span class="badge__t">cards install · ${esc(heldNote)}</span>
        </div>
        <ul class="stats">
          ${stats}
        </ul>
      </section>

      ${
        sampleRows
          ? `<section class="samples" aria-label="Audio samples">
        <h2 class="label">Hear a few</h2>${sampleRows}
      </section>`
          : ""
      }

      <section>
        <h2 class="label">Sample cards</h2>
        <div class="gallery" style="margin-top: var(--space-md);">${cardTiles}
        </div>
      </section>

      <section class="pack__install">
        <h2>Install this pack</h2>
        <div class="code"><pre>${esc(installCmd)}</pre></div>
        <p class="pack__note">Every number above is read directly from this pack's <code>manifest.json</code> and <code>cards.json</code>. recallit installs only cards that pass its checks; anything flagged <code>needs-review</code> is held back, never guessed.</p>
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
  </body>
</html>
`;
}

function indexPage(packs: LoadedPack[]): string {
  const items = packs
    .map((p) => {
      const voiced = p.cards.filter((c) => c.audio).length;
      const sub = `${p.cards.length} cards · ${voiced} voiced · ${esc(p.manifest.modality)}`;
      return `
        <li>
          <a href="${esc(p.manifest.id)}.html">
            <h3>${esc(p.manifest.name)}</h3>
            <p>${sub}</p>
          </a>
        </li>`;
    })
    .join("");

  return `${head("recallit packs", "Browse the recallit packs in this repo.", "../")}

    <main class="wrap pack">
      <section class="pack__head">
        <span class="label pack__kicker">Packs</span>
        <h1>Packs in this repo</h1>
        <p class="pack__lede">Each pack is just cards plus optional audio. Pick one to see its stats and install line, or bring your own with <code>recallit pack &lt;source&gt;</code>.</p>
      </section>
      <ul class="packlist">${items}
      </ul>
    </main>
  </body>
</html>
`;
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
