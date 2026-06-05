// ElevenLabs text-to-speech (multilingual). Voice id is overridable per call;
// a topic pack supplies its own voice via topic config (meta.voiceId).
import type { TtsProvider } from "./types.ts";

// "George" — a neutral default; replaced per topic for language packs.
const DEFAULT_VOICE = "JBFqnCBsd6RMkjVDRZzb";

export function elevenLabsTts(
  apiKey: string | undefined = process.env.ELEVENLABS_API_KEY,
  defaultVoice: string = process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_VOICE,
  modelId = "eleven_multilingual_v2",
): TtsProvider {
  return {
    async speak(text, opts) {
      if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set");
      const voiceId = opts?.voiceId ?? defaultVoice;
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: { "xi-api-key": apiKey, "content-type": "application/json" },
        body: JSON.stringify({ text, model_id: modelId }),
      });
      if (!res.ok) throw new Error(`TTS ${res.status}: ${await res.text()}`);
      return new Uint8Array(await res.arrayBuffer());
    },
  };
}
