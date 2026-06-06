// Serve the static marketing site (landing + /demo/ + /packs/) for local review.
// Plain static files over HTTP — needed because the pages use relative assets.
//
// Run:  bun run serve:marketing      (then open http://localhost:8080)
import { join, normalize } from "node:path";

const ROOT = join(import.meta.dir, "..", "marketing");
const PORT = Number(process.env.PORT ?? 8080);

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith("/")) path += "index.html";
    const full = join(ROOT, normalize(path));
    if (!full.startsWith(ROOT)) return new Response("forbidden", { status: 403 }); // no traversal
    const file = Bun.file(full);
    if (await file.exists()) return new Response(file); // Bun infers content-type by extension
    return new Response("not found", { status: 404 });
  },
});

console.log(`marketing site: http://localhost:${PORT}`);
console.log(`  landing  → http://localhost:${PORT}/`);
console.log(`  demo     → http://localhost:${PORT}/demo/`);
console.log(`  packs    → http://localhost:${PORT}/packs/`);
