// Self-contained shareable HTML for a pack: cards + base64-embedded audio + an
// install footer. Opt-in only (invoked by `pack export`); reads a local pack dir
// and emits ONE standalone file that needs no server, no network, no recallit.
// Presentation only — it never mutates the pack or the engine.
import { join } from "node:path";
import type { RubricCheckpoint } from "./graders/coverage.ts";
import { loadPack } from "./pack.ts";

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const held = (c: { meta?: { status?: string } }): boolean => c.meta?.status === "needs-review";

async function audioDataUri(file: string): Promise<string | null> {
  const f = Bun.file(file);
  if (!(await f.exists())) return null;
  const b64 = Buffer.from(await f.arrayBuffer()).toString("base64");
  return `data:audio/mpeg;base64,${b64}`;
}

/**
 * Build a standalone HTML document for the pack in `dir`. Only `ready` cards are
 * included (held cards aren't installable); the count of held cards is surfaced
 * honestly. `installCmd` is printed in the footer so a recipient can add the pack.
 */
export async function buildPackExport(dir: string, installCmd: string): Promise<string> {
  const { manifest, cards } = await loadPack(dir);
  const ready = cards.filter((c) => !held(c));
  const heldCount = cards.length - ready.length;

  const tiles: string[] = [];
  for (const c of ready) {
    const uri = c.audio ? await audioDataUri(join(dir, "assets", c.audio)) : null;
    const audioEl = uri ? `<audio controls preload="none" src="${uri}"></audio>` : "";
    // Checkable items carry a rubric — render its key points as the study guide
    // (required points first; bonus marked). Each point traces to a source quote.
    const rubric = c.meta?.rubric as RubricCheckpoint[] | undefined;
    const pointsEl = rubric?.length
      ? `<div class="card__points"><span class="card__plabel">Key points to cover</span><ul>${rubric
          .map((cp) => `<li${cp.required ? "" : ' class="opt"'}>${esc(cp.claim)}</li>`)
          .join("")}</ul></div>`
      : "";
    tiles.push(`
      <article class="card">
        <div class="card__front">${esc(c.front)}</div>
        <div class="card__back">${esc(c.back)}</div>
        ${c.context ? `<div class="card__ctx">${esc(c.context)}</div>` : ""}
        ${pointsEl}
        ${audioEl}
      </article>`);
  }

  const heldNote = heldCount
    ? `<p class="note">${heldCount} card${heldCount === 1 ? "" : "s"} were held for review by the honesty gate and are not included.</p>`
    : "";

  // Inline styles only — the file must render with zero external requests.
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(manifest.name)} · a recallit pack</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f4efe6; color: #2b2620; font: 16px/1.5 ui-sans-serif, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
  .wrap { max-width: 56rem; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
  header { display: grid; gap: .5rem; margin-bottom: 2rem; }
  .kicker { font: 600 .75rem/1 ui-monospace, monospace; letter-spacing: .08em; text-transform: uppercase; color: #8a6a5f; }
  h1 { font-size: clamp(1.8rem, 4vw, 2.6rem); letter-spacing: -.02em; margin: 0; }
  .lede { color: #5a504a; max-width: 60ch; }
  .badge { display: inline-block; align-self: start; padding: .4rem .7rem; border: 1px solid #d98b94; border-radius: 12px; background: #f7e3e5; font-size: .9rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); gap: 1rem; }
  .card { background: #fff; border: 1px solid #e3d8cb; border-radius: 12px; padding: 1rem; display: grid; gap: .5rem; }
  .card__front { font-weight: 600; font-size: 1.1rem; letter-spacing: -.01em; }
  .card__back { color: #5a504a; }
  .card__ctx { color: #8a6a5f; font-size: .85rem; font-style: italic; }
  .card__points { margin-top: .35rem; padding-top: .5rem; border-top: 1px solid #efe6da; }
  .card__plabel { font: 600 .7rem/1 ui-monospace, monospace; letter-spacing: .06em; text-transform: uppercase; color: #b85563; }
  .card__points ul { margin: .35rem 0 0; padding-left: 1.1rem; color: #5a504a; font-size: .92rem; display: grid; gap: .25rem; }
  .card__points li.opt { color: #8a6a5f; }
  .card__points li.opt::after { content: " (bonus)"; font-size: .8em; color: #b08; opacity: .6; }
  audio { width: 100%; margin-top: .25rem; }
  .note { color: #8a6a5f; font-size: .9rem; }
  footer { margin-top: 2.5rem; padding-top: 1.5rem; border-top: 1px solid #e3d8cb; display: grid; gap: .75rem; }
  pre { margin: 0; background: #2b2620; color: #f1e8dd; padding: 1rem; border-radius: 12px; overflow-x: auto; font: .9rem/1.6 ui-monospace, monospace; }
  a { color: #b85563; }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <span class="kicker">recallit pack · ${esc(manifest.id)}</span>
      <h1>${esc(manifest.name)}</h1>
      ${manifest.recallStyle ? `<p class="lede">${esc(manifest.recallStyle)}</p>` : ""}
      <span class="badge">${ready.length} card${ready.length === 1 ? "" : "s"} · ${esc(manifest.modality)}</span>
      ${heldNote}
    </header>
    <main class="grid">${tiles.join("")}
    </main>
    <footer>
      <p>Practice this pack with spaced repetition and voice in <a href="https://github.com/ryanwaits/recallit">recallit</a>:</p>
      <pre>${esc(installCmd)}</pre>
      <p class="note">Self-contained export. Audio is embedded; nothing here calls home.</p>
    </footer>
  </div>
</body>
</html>
`;
}
