// Serve the static marketing site (landing + /demo/ + /packs/) for local review.
// Plain static files over HTTP — needed because the pages use relative assets.
//
// Run:  bun run serve:marketing      (then open http://localhost:8080)
import { extname, join, normalize } from "node:path";

const ROOT = join(import.meta.dir, "..", "marketing");
const PORT = Number(process.env.PORT ?? 8080);

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = decodeURIComponent(url.pathname);
    let full = join(ROOT, normalize(path));
    if (!full.startsWith(ROOT)) return new Response("forbidden", { status: 403 }); // no traversal
    // Serve a directory's index.html for both "/demo/" and "/demo" (no extension).
    if (path.endsWith("/")) full = join(full, "index.html");
    else if (!extname(full) && (await Bun.file(join(full, "index.html")).exists())) {
      full = join(full, "index.html");
    }
    const file = Bun.file(full);
    if (await file.exists()) return new Response(file); // Bun infers content-type by extension
    return new Response("not found", { status: 404 });
  },
});

console.log(`marketing site: http://localhost:${PORT}`);
console.log(`  landing  → http://localhost:${PORT}/`);
console.log(`  demo     → http://localhost:${PORT}/demo/`);
console.log(`  packs    → http://localhost:${PORT}/packs/`);
