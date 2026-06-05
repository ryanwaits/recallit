// Voice provider interfaces. The engine depends only on these; concrete
// providers (OpenAI, ElevenLabs) or mocks are injected, so the loop is testable
// offline and providers are swappable per the agnostic/parity principles.

export interface SttProvider {
  /** Transcribe recorded audio to text. */
  transcribe(audio: Uint8Array, opts?: { mime?: string; language?: string }): Promise<string>;
}

export interface TtsProvider {
  /** Synthesize speech for text; returns audio bytes (mp3). */
  speak(text: string, opts?: { voiceId?: string }): Promise<Uint8Array>;
}
