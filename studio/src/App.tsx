import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { type DragEvent, type FormEvent, useRef, useState } from "react";

// A2: the 3-step build shell — ① topic + pedagogy style → ② materials → ③ chat.
// The engine tools (attach_source/author_tutor/shape) + the live honesty ledger land
// in A3/A4; here the chat still streams from the A1 /api/build route, seeded with the
// topic + style + attached filenames. Files are captured in state (uploaded to the
// engine in A3), never streamed raw to the model.

type StyleId = "recallit" | "compliance" | "onboarding";
type Modality = "text" | "voice" | "both";

const STYLES: { id: StyleId; name: string; done: string; desc: string }[] = [
  { id: "recallit", name: "Spaced retention", done: "durable recall", desc: "Drill & converse over cards; FSRS scheduling." },
  { id: "compliance", name: "Compliance", done: "passes the gate", desc: "Modules + reading + a code-graded assessment." },
  { id: "onboarding", name: "Onboarding", done: "scenarios complete", desc: "Applied scenarios & roleplay to ramp fast." },
];

const STEPS = ["Topic", "Materials", "Shape"] as const;

export function App() {
  const [step, setStep] = useState(1);
  const [topic, setTopic] = useState("");
  const [style, setStyle] = useState<StyleId>("recallit");
  const [modality, setModality] = useState<Modality>("text");
  const [files, setFiles] = useState<File[]>([]);
  const [input, setInput] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const kicked = useRef(false);

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/build" }),
  });
  const busy = status === "submitted" || status === "streaming";

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  }

  function startBuilding() {
    setStep(3);
    if (kicked.current) return;
    kicked.current = true;
    const sources = files.length
      ? ` Attached sources: ${files.map((f) => f.name).join(", ")}.`
      : " (no sources attached — describe-only.)";
    sendMessage({ text: `Build a ${style} tutor. ${topic.trim()}${sources}` });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    sendMessage({ text });
    setInput("");
  }

  const activeStyle = STYLES.find((s) => s.id === style);

  return (
    <div className="app">
      <header className="top">
        <span className="brand">
          <span className="dot" /> recallit <span className="slash">/</span> <i>studio</i>
        </span>
        <nav className="steps" aria-label="Build steps">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const state = n === step ? "on" : n < step ? "done" : "";
            return (
              <button
                key={label}
                className={`stepchip ${state}`}
                disabled={n > step}
                onClick={() => n < step && setStep(n)}
              >
                <span className="stepnum">{n < step ? "✓" : `0${n}`}</span>
                {label}
              </button>
            );
          })}
        </nav>
      </header>

      {/* ① TOPIC */}
      {step === 1 && (
        <main className="wizard">
          <p className="eyebrow">Step 01 · build</p>
          <h1 className="display">
            What do you want to <em>teach?</em>
          </h1>
          <p className="lede">
            Describe it, and pick how it should teach. Every card will be grounded by the honesty
            gate — you can't shape a claim the sources don't back.
          </p>

          <textarea
            className="topicbox"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Onboard new hires on our incident-response runbook — detection, escalation, post-mortem."
            rows={3}
          />

          <p className="fieldlabel">Pedagogy</p>
          <div className="stylegrid">
            {STYLES.map((s) => (
              <button
                key={s.id}
                className={`stylecard ${s.id === style ? "sel" : ""}`}
                onClick={() => setStyle(s.id)}
              >
                <span className="stylename">{s.name}</span>
                <span className="styledesc">{s.desc}</span>
                <span className="styledone">done · {s.done}</span>
              </button>
            ))}
          </div>

          <div className="fieldrow">
            <span className="fieldlabel">Modality</span>
            <span className="seg">
              {(["text", "voice", "both"] as Modality[]).map((m) => (
                <button key={m} className={m === modality ? "on" : ""} onClick={() => setModality(m)}>
                  {m}
                </button>
              ))}
            </span>
          </div>

          <div className="navbtns">
            <button className="btn primary" disabled={!topic.trim()} onClick={() => setStep(2)}>
              Continue →
            </button>
          </div>
        </main>
      )}

      {/* ② MATERIALS */}
      {step === 2 && (
        <main className="wizard">
          <p className="eyebrow">Step 02 · build</p>
          <h1 className="display">
            Add your <em>materials.</em>
          </h1>
          <p className="lede">
            Drop in PDFs, notes, a repo, a link. recallit reads them — and every card it drafts will
            cite a verbatim line from one of them.
          </p>

          {/** biome-ignore lint/a11y/noStaticElementInteractions: drop target wraps a real file input + button */}
          <div className="dropzone" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
            <div className="dropico">＋</div>
            <p>
              Drop files here, or{" "}
              <button className="linklike" onClick={() => fileInput.current?.click()}>
                choose
              </button>
            </p>
            <small className="mono">pdf · md · txt · mp3/mp4 (transcribed) · or a link</small>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(e) => addFiles(e.target.files)}
            />
          </div>

          {files.length > 0 && (
            <>
              <p className="fieldlabel">Sources</p>
              <div className="srcchips">
                {files.map((f, i) => (
                  <span className="srcchip" key={`${f.name}-${i}`}>
                    📄 {f.name}
                    <button
                      aria-label={`remove ${f.name}`}
                      onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            </>
          )}

          <div className="navbtns">
            <button className="btn ghost" onClick={() => setStep(1)}>
              ← Back
            </button>
            <button className="btn primary" onClick={startBuilding}>
              {files.length ? "Start building →" : "Build from description →"}
            </button>
          </div>
        </main>
      )}

      {/* ③ SHAPE (chat) */}
      {step === 3 && (
        <>
          <div className="shaperibbon">
            <span className="eyebrow">Step 03 · shape</span>
            <span className="ribbonmeta mono">
              {activeStyle?.name} · {modality}
              {files.length ? ` · ${files.length} source${files.length > 1 ? "s" : ""}` : ""}
            </span>
          </div>
          <main className="chat">
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
              placeholder="Tell the assistant what to change…"
              aria-label="Tell the assistant what to change"
            />
            <button type="submit" disabled={busy || !input.trim()}>
              {busy ? "…" : "Send ↑"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
