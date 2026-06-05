// T13 + T14 + T16: browser-shaped audio arrives over WS, is transcribed + stored,
// and the spoken response flows through the SAME turn machine to a graded card.
// The LLM is replaced by a scripted driver so this validates the wiring offline.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ReviewSession, RunResult } from "../src/agent.ts";
import { getDueCardIds } from "../src/db.ts";
import { cardAttemptFile, cardDir } from "../src/paths.ts";
import { gradeTurn, presentCard, revealAnswer, submitResponse } from "../src/review.ts";
import { regenerateCardAudio, startServer } from "../src/server.ts";
import { createCard, getCard } from "../src/store.ts";
import { createTopic, setActiveTopic } from "../src/topic.ts";
import { mockStt, mockTts } from "../src/voice/mock.ts";
import type { SttProvider, TtsProvider } from "../src/voice/types.ts";

// Spy providers that record the opts the server passes (voiceId / language),
// so we can assert topic.json meta is wired through to TTS/STT.
function spyTts(): { calls: { text: string; voiceId?: string }[]; provider: TtsProvider } {
  const calls: { text: string; voiceId?: string }[] = [];
  return {
    calls,
    provider: {
      async speak(text, opts) {
        calls.push({ text, voiceId: opts?.voiceId });
        return new TextEncoder().encode(`MOCK_AUDIO:${text}`);
      },
    },
  };
}
function spyStt(transcript: string): { calls: { language?: string }[]; provider: SttProvider } {
  const calls: { language?: string }[] = [];
  return {
    calls,
    provider: {
      async transcribe(_audio, opts) {
        calls.push({ language: opts?.language });
        return transcript;
      },
    },
  };
}

let dir: string;
let cardId: string;
const TOPIC = "capitals";

// Scripted, LLM-free driver mirroring the agent's tool sequence.
async function scriptedRun(session: ReviewSession): Promise<RunResult> {
  const due = getDueCardIds(session.topicId);
  for (const id of due) {
    await presentCard(session.topicId, session.tracker, id);
    const card = await getCard(session.topicId, id);
    const answer = await session.answerProvider(id, card?.front ?? "", card?.context, card?.media);
    if (answer === null) break;
    await submitResponse(session.topicId, session.tracker, id, answer);
    await revealAnswer(session.topicId, session.tracker, id);
    await gradeTurn(session.topicId, session.tracker, id);
  }
  session.completed = true;
  return { stopReason: "success", numTurns: 0, costUsd: 0 };
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "recallit-server-"));
  process.env.RECALLIT_DATA_DIR = dir;
  await createTopic({ id: TOPIC, name: "World Capitals", modality: "voice", meta: {} });
  await setActiveTopic(TOPIC);
  cardId = (await createCard(TOPIC, { front: "France", back: "Paris" })).id;
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("voice server", () => {
  test("spoken audio -> transcript -> graded card -> done", async () => {
    const server = startServer({
      stt: mockStt("Paris"),
      tts: mockTts(),
      run: scriptedRun,
      port: 0,
    });
    try {
      const messages: Record<string, unknown>[] = [];
      const ws = new WebSocket(`ws://localhost:${server.port}/ws`);

      const done = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("timed out")), 8000);
        ws.onmessage = (ev) => {
          const m = JSON.parse(String(ev.data));
          messages.push(m);
          if (m.type === "listen") {
            ws.send(
              JSON.stringify({
                type: "audio",
                cardId: m.cardId,
                mime: "audio/webm",
                dataBase64: Buffer.from([1, 2, 3]).toString("base64"),
              }),
            );
          } else if (m.type === "done") {
            clearTimeout(timer);
            resolve();
          }
        };
        ws.onerror = () => reject(new Error("ws error"));
      });

      await done;
      ws.close();

      const kinds = messages.map((m) => m.type);
      expect(kinds).toContain("say"); // prompt spoken
      expect(kinds).toContain("listen"); // mic enabled
      const transcript = messages.find((m) => m.type === "transcript");
      expect(transcript?.text).toBe("Paris");

      // The spoken answer was graded via the turn machine -> card rescheduled out.
      expect(getDueCardIds(TOPIC)).not.toContain(cardId);

      // The attempt audio was stored alongside the card.
      const files = await readdir(cardDir(TOPIC, cardId));
      expect(files.some((f) => f.startsWith("user-") && f.endsWith(".webm"))).toBe(true);

      // The spoken prompt carried TTS audio.
      const say = messages.find((m) => m.type === "say") as { audioBase64?: string };
      expect(typeof say.audioBase64).toBe("string");
    } finally {
      server.stop(true);
    }
  });

  test("GET /api/progress returns progress json for the active topic", async () => {
    const server = startServer({ stt: mockStt("x"), tts: mockTts(), run: scriptedRun, port: 0 });
    try {
      const p = (await (await fetch(`http://localhost:${server.port}/api/progress`)).json()) as {
        topic: string;
        dueNow: number;
        streak: number;
        dangerZone: boolean;
      };
      expect(p.topic).toBe(TOPIC);
      expect(typeof p.dueNow).toBe("number");
      expect(typeof p.streak).toBe("number");
      expect(typeof p.dangerZone).toBe("boolean");
    } finally {
      server.stop(true);
    }
  });

  test("topic meta.voiceId + meta.language are wired to TTS + STT", async () => {
    // A voice topic whose meta carries the Spanish voice + language.
    const VOICE_TOPIC = "spanish-test";
    const VOICE_ID = "ewn5JTa3lNPY8QVuZJi6";
    await createTopic({
      id: VOICE_TOPIC,
      name: "Spanish (test)",
      modality: "voice",
      meta: { voiceId: VOICE_ID, language: "es" },
    });
    await setActiveTopic(VOICE_TOPIC);
    const vCardId = (await createCard(VOICE_TOPIC, { front: "Hola", back: "Hello" })).id;

    const tts = spyTts();
    const stt = spyStt("Hello");
    const server = startServer({ stt: stt.provider, tts: tts.provider, run: scriptedRun, port: 0 });
    try {
      const ws = new WebSocket(`ws://localhost:${server.port}/ws`);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("timed out")), 8000);
        ws.onmessage = (ev) => {
          const m = JSON.parse(String(ev.data));
          if (m.type === "listen") {
            ws.send(
              JSON.stringify({
                type: "audio",
                cardId: m.cardId,
                mime: "audio/webm",
                dataBase64: Buffer.from([1, 2, 3]).toString("base64"),
              }),
            );
          } else if (m.type === "done") {
            clearTimeout(timer);
            resolve();
          }
        };
        ws.onerror = () => reject(new Error("ws error"));
      });
      ws.close();

      // 1.1: TTS spoke the prompt with the topic's configured voice.
      expect(tts.calls.some((c) => c.voiceId === VOICE_ID)).toBe(true);
      // 1.3: STT transcribed with the topic's language, not auto-detect.
      expect(stt.calls.some((c) => c.language === "es")).toBe(true);
      // Sanity: the card still graded through the same turn machine.
      expect(getDueCardIds(VOICE_TOPIC)).not.toContain(vCardId);
    } finally {
      server.stop(true);
      await setActiveTopic(TOPIC);
    }
  });

  test("GET /media serves a card's stored audio", async () => {
    const c = await createCard(TOPIC, { front: "Madrid", back: "Spain", media: "native.mp3" });
    await Bun.write(cardAttemptFile(TOPIC, c.id, "native.mp3"), new Uint8Array([4, 5, 6]));
    const server = startServer({ stt: mockStt("x"), tts: mockTts(), run: scriptedRun, port: 0 });
    try {
      const res = await fetch(`http://localhost:${server.port}/media/${TOPIC}/${c.id}/native.mp3`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("audio/mpeg");
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([4, 5, 6]));

      // Path traversal is rejected.
      const bad = await fetch(`http://localhost:${server.port}/media/${TOPIC}/${c.id}/..%2F..`);
      expect(bad.status).toBe(400);
    } finally {
      server.stop(true);
    }
  });

  test("regenerateCardAudio re-synthesizes native.mp3 from the new front", async () => {
    const c = await createCard(TOPIC, { front: "Lisbon", back: "Portugal", media: "native.mp3" });
    await regenerateCardAudio(TOPIC, { ...c, front: "Lisboa" }, mockTts());
    const bytes = await Bun.file(cardAttemptFile(TOPIC, c.id, "native.mp3")).bytes();
    expect(new TextDecoder().decode(bytes)).toBe("MOCK_AUDIO:Lisboa");
  });

  test("converse: a card-less roleplay turn speaks a line and returns the reply", async () => {
    await setActiveTopic(TOPIC);
    let captured: string | null | undefined;
    // Scripted "roleplay": drive one conversational turn via converseProvider.
    const run = async (session: ReviewSession): Promise<RunResult> => {
      captured = await session.converseProvider?.("¿Cómo estás?");
      session.completed = true;
      return { stopReason: "success", numTurns: 0, costUsd: 0 };
    };
    const server = startServer({ stt: mockStt("bien, gracias"), tts: mockTts(), run, port: 0 });
    try {
      const messages: Record<string, unknown>[] = [];
      const ws = new WebSocket(`ws://localhost:${server.port}/ws`);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("timed out")), 8000);
        ws.onmessage = (ev) => {
          const m = JSON.parse(String(ev.data));
          messages.push(m);
          if (m.type === "listen") {
            ws.send(
              JSON.stringify({
                type: "audio",
                cardId: m.cardId,
                mime: "audio/webm",
                dataBase64: Buffer.from([9]).toString("base64"),
              }),
            );
          } else if (m.type === "done") {
            clearTimeout(timer);
            resolve();
          }
        };
        ws.onerror = () => reject(new Error("ws error"));
      });
      ws.close();

      // No card was presented; the agent's line was spoken and the reply captured.
      const say = messages.find((m) => m.type === "say") as { text?: string };
      expect(say?.text).toBe("¿Cómo estás?");
      const listen = messages.find((m) => m.type === "listen") as { cardId?: string };
      expect(listen?.cardId).toBe("conversation"); // sentinel, not a real card
      expect(captured).toBe("bien, gracias");
    } finally {
      server.stop(true);
    }
  });

  test("STT failure triggers a single re-listen, then grades the retry", async () => {
    // Isolated single-card topic so the scripted run processes exactly one turn.
    const RETRY_TOPIC = "stt-retry";
    await createTopic({ id: RETRY_TOPIC, name: "Retry", modality: "voice", meta: {} });
    await setActiveTopic(RETRY_TOPIC);
    const failCard = (await createCard(RETRY_TOPIC, { front: "Rome", back: "Italy" })).id;
    // STT throws on the first attempt, succeeds on the second.
    let attempts = 0;
    const flaky: SttProvider = {
      async transcribe() {
        attempts += 1;
        if (attempts === 1) throw new Error("stt blip");
        return "Italy";
      },
    };
    const server = startServer({ stt: flaky, tts: mockTts(), run: scriptedRun, port: 0 });
    try {
      const messages: Record<string, unknown>[] = [];
      const ws = new WebSocket(`ws://localhost:${server.port}/ws`);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("timed out")), 8000);
        const sendAudio = (cardId: unknown) =>
          ws.send(
            JSON.stringify({
              type: "audio",
              cardId,
              mime: "audio/webm",
              dataBase64: Buffer.from([1]).toString("base64"),
            }),
          );
        ws.onmessage = (ev) => {
          const m = JSON.parse(String(ev.data));
          messages.push(m);
          if (m.type === "listen" && m.cardId === failCard) sendAudio(m.cardId);
          else if (m.type === "done") {
            clearTimeout(timer);
            resolve();
          }
        };
        ws.onerror = () => reject(new Error("ws error"));
      });
      ws.close();

      // The Rome turn got two "listen" prompts (initial + one retry) and an error.
      const romeListens = messages.filter((m) => m.type === "listen" && m.cardId === failCard);
      expect(romeListens.length).toBe(2);
      expect(messages.some((m) => m.type === "error")).toBe(true);
      // The retry transcript graded the card out of the due set.
      const t = messages.find((m) => m.type === "transcript" && m.cardId === failCard);
      expect(t?.text).toBe("Italy");
      expect(getDueCardIds(RETRY_TOPIC)).not.toContain(failCard);
    } finally {
      server.stop(true);
      await setActiveTopic(TOPIC);
    }
  });
});
