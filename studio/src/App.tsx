import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { type FormEvent, useState } from "react";

// A1 slice: a streaming chat wired to /api/build. Steps ①②③ (topic → materials →
// shape) and the engine tools land in A2–A5; here we prove the FE ↔ route ↔ useChat
// stream end to end.
export function App() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/build" }),
  });
  const busy = status === "submitted" || status === "streaming";

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    sendMessage({ text });
    setInput("");
  }

  return (
    <div className="app">
      <header className="top">
        <span className="brand">
          <span className="dot" /> recallit <span className="slash">/</span> <i>studio</i>
        </span>
        <span className="eyebrow">build · chat slice</span>
      </header>

      <main className="chat">
        {messages.length === 0 && (
          <div className="empty">
            <p className="eyebrow">Step 01 · build</p>
            <h1>
              What do you want to <em>teach?</em>
            </h1>
            <p className="lede">
              Describe it. Soon you'll attach materials and shape it in chat — every card grounded by
              the honesty gate. This is the A1 slice: a live stream over the engine.
            </p>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            <span className="who">{m.role === "user" ? "you" : "assistant"}</span>
            <div className="bubble">
              {m.parts.map((part, i) =>
                part.type === "text" ? <span key={`${m.id}-${i}`}>{part.text}</span> : null,
              )}
            </div>
          </div>
        ))}

        {status === "submitted" && (
          <div className="msg assistant">
            <span className="who">assistant</span>
            <div className="bubble dots">
              <i />
              <i />
              <i />
            </div>
          </div>
        )}
      </main>

      <form className="composer" onSubmit={submit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe what you want to teach…"
          aria-label="Describe what you want to teach"
        />
        <button type="submit" disabled={busy || !input.trim()}>
          {busy ? "…" : "Send ↑"}
        </button>
      </form>
    </div>
  );
}
