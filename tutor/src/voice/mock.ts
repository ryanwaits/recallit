// In-memory voice providers for tests and offline dev.
import type { SttProvider, TtsProvider } from "./types.ts";

export function mockStt(transcript: string | ((audio: Uint8Array) => string)): SttProvider {
  return {
    async transcribe(audio) {
      return typeof transcript === "function" ? transcript(audio) : transcript;
    },
  };
}

export function mockTts(): TtsProvider {
  return {
    async speak(text) {
      return new TextEncoder().encode(`MOCK_AUDIO:${text}`);
    },
  };
}
