// `recallit start` — the one-command on-ramp. From an empty machine: seed the
// starter pack into ~/.recallit, boot the SPA, open the browser. Keyless by
// default (real cards, real grading, zero spend); paste an Anthropic key to get
// the live AI tutor instead.
import { join } from "node:path";
import { installPack } from "./install.ts";
import { startKeylessServer } from "./serve-local.ts";
import { startServer } from "./server.ts";
import { listTopics } from "./topic.ts";

const STARTER_PACK = join(import.meta.dir, "..", "packs", "spanish-mx-rgv");

/** Open `url` in the default browser (best-effort; never throws). */
function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url];
  try {
    Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" });
  } catch {
    // Headless or no opener — the printed URL is the fallback.
  }
}

export async function start(): Promise<void> {
  console.log("\n  recallit — spaced-repetition recall that actually grades you.\n");

  // Interactive only: headless/piped runs fall straight through to keyless so CI
  // and `bunx … start | cat` still reach a booted server + printed URL.
  const interactive = Boolean(process.stdin.isTTY);
  let key = process.env.ANTHROPIC_API_KEY?.trim() ?? "";
  if (key) {
    console.log("  Using ANTHROPIC_API_KEY from your environment — live AI tutor enabled.");
  } else if (interactive) {
    const ans = prompt(
      "  Paste an ANTHROPIC_API_KEY for the live AI tutor, or press Enter to study keyless >",
    );
    if (ans?.trim()) key = ans.trim();
  }

  // Seed the starter pack on first run so there's something to study immediately.
  if ((await listTopics()).length === 0) {
    console.log("\n  Seeding starter pack: Conversational Mexican Spanish (RGV)…");
    const r = await installPack(STARTER_PACK, { activate: true });
    console.log(`  installed "${r.topicId}": ${r.cards} cards, ${r.audio} audio.`);
  }

  // port 0 → the OS assigns a free port; server.port reports the real one.
  let server: ReturnType<typeof startKeylessServer>;
  if (key) {
    process.env.ANTHROPIC_API_KEY = key;
    const { elevenLabsTts } = await import("./voice/elevenlabs-tts.ts");
    const { elevenLabsStt } = await import("./voice/elevenlabs-stt.ts");
    const stt =
      process.env.RECALLIT_STT === "openai"
        ? (await import("./voice/openai-stt.ts")).openAiStt()
        : elevenLabsStt();
    server = startServer({ stt, tts: elevenLabsTts(), port: 0 });
    console.log("\n  Live AI tutor on. Spoken practice also needs ELEVENLABS_API_KEY.");
  } else {
    server = startKeylessServer({ port: 0 });
    console.log("\n  Keyless mode: real cards, real grading, no API spend.");
  }

  const url = `http://localhost:${server.port}`;
  console.log(`\n  ▸ ${url}\n`);
  if (interactive) openBrowser(url);
}
