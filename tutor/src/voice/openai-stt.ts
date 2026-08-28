// OpenAI speech-to-text (gpt-4o-transcribe). Errors surface lazily (per call),
// so constructing the provider without a key is fine until transcribe() runs.
import type { SttProvider } from "./types.ts";

// OpenAI infers the audio format from the upload filename, so the extension must
// match the actual bytes (not just the declared mime).
const EXT_BY_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "mp4",
  "audio/m4a": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
};

export function openAiStt(
  apiKey: string | undefined = process.env.OPENAI_API_KEY,
  model = "gpt-4o-transcribe",
): SttProvider {
  return {
    async transcribe(audio, opts) {
      if (!apiKey) throw new Error("OPENAI_API_KEY not set");
      const mime = opts?.mime ?? "audio/webm";
      const ext = EXT_BY_MIME[mime] ?? "webm";
      const form = new FormData();
      form.append("file", new Blob([audio], { type: mime }), `audio.${ext}`);
      form.append("model", model);
      if (opts?.language) form.append("language", opts.language);

      const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
      if (!res.ok) throw new Error(`STT ${res.status}: ${await res.text()}`);
      const json = (await res.json()) as { text: string };
      return json.text.trim();
    },
  };
}
