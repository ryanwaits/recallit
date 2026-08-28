// Voice provider interface sanity (mock impls).
import { describe, expect, test } from "bun:test";
import { mockStt, mockTts } from "../src/voice/mock.ts";

describe("voice mocks", () => {
  test("stt returns the configured transcript", async () => {
    const stt = mockStt("Paris");
    expect(await stt.transcribe(new Uint8Array([1, 2, 3]))).toBe("Paris");
  });

  test("stt can derive transcript from audio", async () => {
    const stt = mockStt((a) => `len:${a.length}`);
    expect(await stt.transcribe(new Uint8Array([1, 2, 3, 4]))).toBe("len:4");
  });

  test("tts returns audio bytes", async () => {
    const bytes = await mockTts().speak("hola");
    expect(new TextDecoder().decode(bytes)).toBe("MOCK_AUDIO:hola");
  });
});
