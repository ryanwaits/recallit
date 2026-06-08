// Thin wrapper: the keyless server now lives in src/ so it ships with the
// published package. Run `bun run serve:local` or `bun run src/serve-local.ts`.
import { startKeylessServer } from "../src/serve-local.ts";

const server = startKeylessServer();
console.log(`recallit (local, no keys): http://localhost:${server.port}`);
console.log(
  "Type your answers to grade real cards. Spoken answers need ELEVENLABS_API_KEY (use `bun run serve`).",
);
