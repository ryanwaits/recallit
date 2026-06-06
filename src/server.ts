// Bun HTTP + WebSocket server hosting a voice review session. Browser push-to-talk
// audio arrives over WS, is transcribed (STT) and stored as an attempt, then fed
// into the SAME turn machine as text. The agent's prompts are spoken back (TTS).
//
// `run` is injectable: defaults to the live agent loop (runSession); tests inject a
// scripted driver so the WS/audio/turn wiring is verifiable without the LLM.
import { join } from "node:path";
import type { ServerWebSocket } from "bun";
import { type AnswerProvider, createReviewSession, type RunResult, runSession } from "./agent.ts";
import { dailyPhases } from "./context.ts";
import { countCards } from "./db.ts";
import { installPack } from "./install.ts";
import { cardAttemptFile } from "./paths.ts";
import { getProgress } from "./progress.ts";
import { updateCard } from "./store.ts";
import { getActiveTopic, listTopics, readTopicConfig } from "./topic.ts";
import type { RecallCard } from "./types.ts";
import type { SttProvider, TtsProvider } from "./voice/types.ts";

interface VoiceConn {
  topicId: string;
  pendingResolve: ((answer: string | null) => void) | null;
  /** Topic-derived TTS voice + STT language, resolved once on connect (topic.json meta). */
  voiceId?: string;
  language?: string;
  /** True once the current turn has already been re-prompted after an STT failure. */
  sttRetried?: boolean;
}

/**
 * Re-synthesize a card's native prompt audio (its `front`), used when the card's
 * text changes so the stored recording stays in sync. Writes the card's media
 * file (defaulting to native.mp3) and backfills the `media` field if it was unset.
 */
export async function regenerateCardAudio(
  topicId: string,
  card: RecallCard,
  tts: TtsProvider,
  voiceId?: string,
): Promise<void> {
  const filename = card.media ?? "native.mp3";
  const audio = await tts.speak(card.front, { voiceId });
  await Bun.write(cardAttemptFile(topicId, card.id, filename), audio);
  if (!card.media) await updateCard(topicId, card.id, { media: filename });
}

export interface ServerDeps {
  stt: SttProvider;
  tts: TtsProvider;
  /** Drives a session to completion. Defaults to the live agent loop. */
  run?: (session: ReturnType<typeof createReviewSession>) => Promise<RunResult>;
  port?: number;
}

type ClientMessage =
  | { type: "audio"; cardId: string; mime?: string; language?: string; dataBase64: string }
  | { type: "text"; cardId: string; text: string }
  | { type: "stop" };

const send = (ws: ServerWebSocket<VoiceConn>, msg: unknown): void => {
  ws.send(JSON.stringify(msg));
};

function makeAnswerProvider(ws: ServerWebSocket<VoiceConn>, tts: TtsProvider): AnswerProvider {
  return async (cardId, front, context, media) => {
    if (media) {
      // Prefer the card's stored native recording (consistent voice, no API call)
      // over re-synthesizing the prompt each time. Served via the /media route.
      send(ws, {
        type: "say",
        text: front,
        context,
        mediaUrl: mediaUrl(ws.data.topicId, cardId, media),
      });
    } else {
      // No recording: synthesize the prompt in the topic's configured voice
      // (topic.json meta.voiceId) rather than the default.
      try {
        const audio = await tts.speak(front, { voiceId: ws.data.voiceId });
        send(ws, {
          type: "say",
          text: front,
          context,
          audioBase64: Buffer.from(audio).toString("base64"),
        });
      } catch {
        send(ws, { type: "say", text: front, context });
      }
    }
    send(ws, { type: "listen", cardId });
    ws.data.sttRetried = false;
    // Resolve when the client sends this turn's audio/text/stop.
    return new Promise<string | null>((resolve) => {
      ws.data.pendingResolve = resolve;
    });
  };
}

const mediaUrl = (topicId: string, cardId: string, file: string): string =>
  `/media/${encodeURIComponent(topicId)}/${encodeURIComponent(cardId)}/${encodeURIComponent(file)}`;

/** Sentinel cardId for conversational turns (no real card); recordings land under cards/<this>/. */
const CONVERSE_TURN_ID = "conversation";

/** Card-less roleplay turn: speak an arbitrary line, then listen — no card, no grading. */
function makeConverseProvider(
  ws: ServerWebSocket<VoiceConn>,
  tts: TtsProvider,
): (say: string) => Promise<string | null> {
  return async (say) => {
    try {
      const audio = await tts.speak(say, { voiceId: ws.data.voiceId });
      send(ws, { type: "say", text: say, audioBase64: Buffer.from(audio).toString("base64") });
    } catch {
      send(ws, { type: "say", text: say });
    }
    send(ws, { type: "listen", cardId: CONVERSE_TURN_ID });
    ws.data.sttRetried = false;
    return new Promise<string | null>((resolve) => {
      ws.data.pendingResolve = resolve;
    });
  };
}

async function handleMessage(
  ws: ServerWebSocket<VoiceConn>,
  raw: string,
  stt: SttProvider,
): Promise<void> {
  let msg: ClientMessage;
  try {
    msg = JSON.parse(raw) as ClientMessage;
  } catch {
    return;
  }
  const resolve = ws.data.pendingResolve;
  if (!resolve) return;

  if (msg.type === "audio") {
    const bytes = Uint8Array.from(Buffer.from(msg.dataBase64, "base64"));
    const filename = `user-${Date.now()}.webm`;
    await Bun.write(cardAttemptFile(ws.data.topicId, msg.cardId, filename), bytes);
    let transcript = "";
    let failed = false;
    try {
      // Prefer the topic's language (meta.language, e.g. "es") so STT doesn't
      // rely on auto-detect; fall back to whatever the client supplied.
      transcript = await stt.transcribe(bytes, {
        mime: msg.mime,
        language: ws.data.language ?? msg.language,
      });
    } catch (e) {
      failed = true;
      send(ws, { type: "error", text: String(e instanceof Error ? e.message : e) });
    }
    if (failed && !ws.data.sttRetried) {
      // Give one automatic retry instead of grading an empty transcript as Again:
      // keep the turn's pending promise open and re-arm the mic.
      ws.data.sttRetried = true;
      send(ws, { type: "listen", cardId: msg.cardId });
      return;
    }
    send(ws, { type: "transcript", cardId: msg.cardId, text: transcript });
    ws.data.pendingResolve = null;
    resolve(transcript);
  } else if (msg.type === "text") {
    ws.data.pendingResolve = null;
    resolve(msg.text);
  } else if (msg.type === "stop") {
    ws.data.pendingResolve = null;
    resolve(null);
  }
}

export function startServer(deps: ServerDeps) {
  // Browser sessions run the full multi-phase regimen (shadowing -> review ->
  // roleplay -> reflect for voice topics); phases are selected by topic modality.
  const run = deps.run ?? ((s) => runSession(s, { mode: "daily" }));
  const clientHtml = join(import.meta.dir, "..", "public", "index.html");

  return Bun.serve<VoiceConn>({
    port: deps.port ?? 3000,
    async fetch(req, server) {
      const url = new URL(req.url);
      if (url.pathname === "/ws") {
        // Let the SPA choose the deck per connection (?topicId=…) instead of the
        // process-global active topic; open() falls back to active when omitted.
        const topicId = url.searchParams.get("topicId") ?? "";
        if (server.upgrade(req, { data: { topicId, pendingResolve: null } })) return;
        return new Response("upgrade failed", { status: 400 });
      }
      if (url.pathname === "/api/progress") {
        const topicId = url.searchParams.get("topicId") || (await getActiveTopic()) || "default";
        const cfg = await readTopicConfig(topicId);
        return Response.json(await getProgress(topicId, cfg?.goalMetric));
      }
      if (url.pathname === "/api/packs") {
        // List installed topics for the gallery. Reads existing exports only.
        const active = await getActiveTopic();
        const packs = await Promise.all(
          (await listTopics()).map(async (id) => {
            const cfg = await readTopicConfig(id);
            const { total, due } = countCards(id);
            return {
              id,
              name: cfg?.name ?? id,
              modality: cfg?.modality ?? "text",
              goalMetric: cfg?.goalMetric,
              cards: total,
              due,
              active: id === active,
            };
          }),
        );
        return Response.json({ packs });
      }
      if (url.pathname === "/api/packs/install" && req.method === "POST") {
        // One-tap install wrapping installPack. Disable on shared/public deploys
        // with RECALLIT_NO_INSTALL=1 (installing arbitrary sources runs git/npm).
        if (process.env.RECALLIT_NO_INSTALL)
          return new Response("install disabled", { status: 403 });
        const body = (await req.json().catch(() => ({}))) as { source?: string };
        if (!body.source) return Response.json({ error: "missing source" }, { status: 400 });
        try {
          const res = await installPack(body.source, { activate: true });
          return Response.json(res);
        } catch (e) {
          return Response.json(
            { error: e instanceof Error ? e.message : String(e) },
            { status: 400 },
          );
        }
      }
      if (url.pathname.startsWith("/media/")) {
        // Serve a card's stored audio (native.mp3) for shadowing playback.
        const [mTopic, mCard, mFile] = url.pathname
          .slice("/media/".length)
          .split("/")
          .map((p) => decodeURIComponent(p));
        if (
          !mTopic ||
          !mCard ||
          !mFile ||
          [mTopic, mCard, mFile].some((p) => p === ".." || p.includes("/"))
        ) {
          return new Response("bad media path", { status: 400 });
        }
        const file = Bun.file(cardAttemptFile(mTopic, mCard, mFile));
        if (!(await file.exists())) return new Response("not found", { status: 404 });
        const type = mFile.endsWith(".mp3")
          ? "audio/mpeg"
          : mFile.endsWith(".webm")
            ? "audio/webm"
            : "application/octet-stream";
        return new Response(file, { headers: { "content-type": type } });
      }
      if (url.pathname === "/" || url.pathname === "/index.html") {
        return new Response(Bun.file(clientHtml), { headers: { "content-type": "text/html" } });
      }
      return new Response("not found", { status: 404 });
    },
    websocket: {
      async open(ws) {
        // Honor a per-connection topicId (from /ws?topicId=…); fall back to active.
        ws.data.topicId = ws.data.topicId || (await getActiveTopic()) || "default";
        // Resolve the topic's voice + language once per connection so every turn
        // speaks/transcribes in the configured language (topic.json meta).
        const cfg = await readTopicConfig(ws.data.topicId);
        ws.data.voiceId = cfg?.meta?.voiceId as string | undefined;
        ws.data.language = cfg?.meta?.language as string | undefined;
        // Tell the client the regimen up front so it can render a phase rail; live
        // progress is forwarded from the agent's real complete_phase tool calls.
        send(ws, { type: "phases", phases: dailyPhases(cfg?.modality ?? "text") });
        const session = createReviewSession(
          ws.data.topicId,
          makeAnswerProvider(ws, deps.tts),
          (e) => {
            if (e.kind === "assistant_text") send(ws, { type: "caption", text: e.data });
            else if (
              e.kind === "tool_use" &&
              (e.data as { name?: string }).name === "complete_phase"
            )
              send(ws, {
                type: "phase",
                phase: (e.data as { input?: { phase?: string } }).input?.phase,
              });
          },
        );
        // When the agent edits a card's front, refresh its native recording so
        // shadowing audio never drifts from the text.
        session.onCardContentChanged = (card) =>
          regenerateCardAudio(ws.data.topicId, card, deps.tts, ws.data.voiceId);
        // Card-less spoken turns for the roleplay phase.
        session.converseProvider = makeConverseProvider(ws, deps.tts);
        run(session)
          .then((res) =>
            send(ws, { type: "done", summary: session.summary, stopReason: res.stopReason }),
          )
          .catch((err) =>
            send(ws, { type: "error", text: String(err instanceof Error ? err.message : err) }),
          );
      },
      async message(ws, raw) {
        await handleMessage(ws, typeof raw === "string" ? raw : raw.toString(), deps.stt);
      },
      close(ws) {
        // Unblock a hung session if the learner disconnects mid-turn.
        ws.data.pendingResolve?.(null);
        ws.data.pendingResolve = null;
      },
    },
  });
}

if (import.meta.main) {
  // ElevenLabs covers both TTS and STT (Scribe). Set RECALLIT_STT=openai to use
  // OpenAI gpt-4o-transcribe instead (requires OPENAI_API_KEY with credits).
  const { elevenLabsTts } = await import("./voice/elevenlabs-tts.ts");
  const { elevenLabsStt } = await import("./voice/elevenlabs-stt.ts");
  const stt =
    process.env.RECALLIT_STT === "openai"
      ? (await import("./voice/openai-stt.ts")).openAiStt()
      : elevenLabsStt();
  const server = startServer({ stt, tts: elevenLabsTts(), port: Number(process.env.PORT ?? 3000) });
  console.log(`recallit voice server: http://localhost:${server.port}`);
}
