// Live TTS->STT round trip via ElevenLabs (TTS + Scribe STT). Opt-in:
// RECALLIT_LIVE_TEST=1 + ELEVENLABS_API_KEY. Synthesizes speech, transcribes it back.
import { describe, expect, test } from "bun:test";
import { elevenLabsStt } from "../src/voice/elevenlabs-stt.ts";
import { elevenLabsTts } from "../src/voice/elevenlabs-tts.ts";

const LIVE = !!process.env.RECALLIT_LIVE_TEST && !!process.env.ELEVENLABS_API_KEY;

describe("live voice round trip (ElevenLabs)", () => {
  test.skipIf(!LIVE)(
    "TTS audio transcribes back to the spoken words",
    async () => {
      const audio = await elevenLabsTts().speak("uno dos tres");
      expect(audio.length).toBeGreaterThan(1000);

      const text = (
        await elevenLabsStt().transcribe(audio, { mime: "audio/mpeg", language: "es" })
      ).toLowerCase();
      expect(text).toMatch(/uno|dos|tres/);
    },
    60_000,
  );
});
