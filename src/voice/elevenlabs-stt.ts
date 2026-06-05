// ElevenLabs Scribe speech-to-text. Drop-in SttProvider so voice answers work with
// the ElevenLabs key (no separate STT vendor needed).
import type { SttProvider } from "./types.ts";

export function elevenLabsStt(
  apiKey: string | undefined = process.env.ELEVENLABS_API_KEY,
  model = "scribe_v1",
): SttProvider {
  return {
    async transcribe(audio, opts) {
      if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set");
      const form = new FormData();
      form.append("file", new Blob([audio], { type: opts?.mime ?? "audio/webm" }), "audio.webm");
      form.append("model_id", model);
      if (opts?.language) form.append("language_code", opts.language);

      const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST",
        headers: { "xi-api-key": apiKey },
        body: form,
      });
      if (!res.ok) throw new Error(`STT ${res.status}: ${await res.text()}`);
      const json = (await res.json()) as { text: string };
      return json.text.trim();
    },
  };
}
