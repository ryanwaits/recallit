import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { type DragEvent, type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { type Job, type JobData, useJobs } from "./useJobs.ts";

// A2: the 3-step build shell — ① topic + pedagogy style → ② materials → ③ chat.
// The engine tools (attach_source/author_tutor/shape) + the live honesty ledger land
// in A3/A4; here the chat still streams from the A1 /api/build route, seeded with the
// topic + style + attached filenames. Files are captured in state (uploaded to the
// engine in A3), never streamed raw to the model.

type StyleId = "recallit" | "compliance" | "onboarding";
type Modality = "text" | "voice" | "both";

// `soon` styles are shown for direction but not selectable — authoring doesn't yet
// shape itself by pedagogy (S4: thread getStyle().authorPrompt into runPackAuthor),
// so promising a compliance assessment / onboarding scenarios would overclaim.
const STYLES: { id: StyleId; name: string; done: string; desc: string; soon?: boolean }[] = [
  {
    id: "recallit",
    name: "Spaced retention",
    done: "durable recall",
    desc: "Drill & converse over cards; FSRS scheduling.",
  },
  {
    id: "compliance",
    name: "Compliance",
    done: "applies the rules",
    desc: "Recall + apply the rules; code-graded comprehension.",
  },
  {
    id: "onboarding",
    name: "Onboarding",
    done: "handles real situations",
    desc: "Grounded 'what do you do?' scenarios + key facts.",
  },
];

const STEPS = ["Topic", "Materials", "Shape"] as const;

type ToolOutput = {
  ready?: number;
  total?: number;
  held?: { front: string }[];
  kind?: string;
  source?: string;
  error?: string;
};
function summarizeTool(o?: ToolOutput): string {
  if (!o) return "";
  if (o.error) return o.error;
  if (typeof o.ready === "number")
    return `${o.ready}/${o.total} ready · ${o.held?.length ?? 0} held`;
  if (o.source) return `read ${o.source} (${o.kind})`;
  return "done";
}

type Source =
  | { kind: "file"; name: string; file: File }
  | { kind: "url"; name: string; url: string };

type FinalizeOutput = {
  installed?: boolean;
  courseId?: string;
  cards?: number;
  dataDir?: string;
};

// The finalize result: a "Tutor ready" card with the exact copy-able study command
// for this install. Deploy is a placeholder until the Deploy surface ships.
function TutorReady({ out }: { out: FinalizeOutput }) {
  const [copied, setCopied] = useState(false);
  const cmd = `RECALLIT_DATA_DIR=${out.dataDir ?? "~/.recallit"} bun run src/cli.ts daily --topic ${out.courseId}`;
  const copy = () => {
    navigator.clipboard?.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="tutorready">
      <div className="tr-top">
        <span className="tr-badge">✓ Tutor ready</span>
        <span className="tr-meta">
          {out.courseId} · {out.cards} cards
        </span>
      </div>
      <p className="tr-label">Study it</p>
      <div className="tr-cmd">
        <code>{cmd}</code>
        <button type="button" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="tr-actions">
        <span className="tr-chip muted">Deploy · coming</span>
      </div>
    </div>
  );
}

type ProposedAction = { label: string; message: string };

// Agent-proposed one-click choices (the propose_actions tool): clicking sends the
// action's message as the user's reply. Stale rows (conversation moved on) disable.
function ActionRow({
  question,
  actions,
  disabled,
  onAction,
}: {
  question?: string;
  actions: ProposedAction[];
  disabled: boolean;
  onAction: (text: string) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <div className="actionrow">
      {question && <p className="actionrow-q">{question}</p>}
      <div className="actionrow-btns">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            className={`lg-btn ${picked === a.label ? "picked" : ""}`}
            disabled={disabled || picked !== null}
            onClick={() => {
              setPicked(a.label);
              onAction(a.message);
            }}
          >
            {picked === a.label ? "✓ " : ""}
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Short, safe tray label for a job. Never throws: a "source" may be a URL, a
// file path, or a whole topic sentence (description-only builds).
function jobLabel(j: Job): string {
  if (j.packId) return j.packId;
  const s = j.sources[0];
  if (!s) return "tutor";
  // URL or path: take the last meaningful segment. Plain text: truncate.
  const tail =
    s
      .replace(/[?#].*$/, "")
      .replace(/\/+$/, "")
      .split("/")
      .pop() ?? s;
  const label = tail.trim() || "tutor";
  return label.length > 28 ? `${label.slice(0, 27)}…` : label;
}

// ── Job card (in-flight and completed state, data-job part) ─────────────────
const BUILD_PHASES = ["Reading the source", "Drafting cards", "Running the honesty gate"];

function JobCard({ d }: { d?: JobData }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!d || d.status !== "running") return;
    const start = new Date(d.createdAt).getTime();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [d?.status, d?.createdAt]);

  if (!d) return null;
  const fmtElapsed = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`);

  return (
    <div className={`jobcard ${d.status}`}>
      <div className="jc-head">
        <div className={`jc-icon ${d.status}`}>
          {d.status === "running" && (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          )}
          {d.status === "queued" && <span style={{ fontSize: "1.1rem" }}>⏳</span>}
          {d.status === "done" && (
            <span style={{ color: "var(--sage-deep)", fontWeight: 700 }}>✓</span>
          )}
          {d.status === "error" && (
            <span style={{ color: "var(--coral,oklch(65% .2 25))" }}>✗</span>
          )}
        </div>
        <div>
          <div className="jc-name">{d.packId ?? "building tutor"}</div>
          <div className="jc-meta mono">
            {d.status === "queued" && "waiting to start…"}
            {d.status === "running" && `${fmtElapsed(elapsed)} elapsed`}
            {d.status === "done" && d.result && `${d.result.ready}/${d.result.total} ready`}
            {d.status === "error" && (d.errorText ?? "build failed")}
          </div>
        </div>
        <span className={`jc-badge ${d.status}`}>
          {d.status === "running" ? "building" : d.status}
        </span>
      </div>
      {d.status === "running" && (
        <div className="jc-body">
          <div className="jc-progress">
            <div className="jc-fill" />
          </div>
          <ul className="jc-phases">
            {BUILD_PHASES.map((p) => (
              <li key={p} className="jc-phase">
                <span className="jc-phase-ic">·</span>
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

type LedgerStep = { label: string; state: "done" | "active" | "todo" };
type LedgerData = {
  steps?: LedgerStep[];
  done?: boolean;
  packId?: string;
  ready?: number;
  total?: number;
  held?: { front: string; reasons: string[] }[];
  lastAction?: string;
  error?: string;
};

// The live honesty ledger: fills in as the author runs (reading -> drafting ->
// gating), then shows verified vs held with a "Review now" expand for held cards.
function Ledger({ d, onAction }: { d?: LedgerData; onAction?: (text: string) => void }) {
  const [showHeld, setShowHeld] = useState(false);
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  if (!d) return null;
  const heldCount = d.held?.length ?? 0;
  return (
    <div className="ledger">
      <div className="ledger-head">
        <span className="eyebrow">Honesty ledger</span>
        {d.done && typeof d.ready === "number" && (
          <span className="ledger-count">
            {d.ready}/{d.total} verified · {heldCount} held
          </span>
        )}
      </div>
      <ul className="ledger-steps">
        {(d.steps ?? []).map((s) => (
          <li key={s.label} className={`lstep ${s.state}`}>
            <span className="lstep-ic">
              {s.state === "done" ? "✓" : s.state === "active" ? "▸" : "·"}
            </span>
            {s.label}
          </li>
        ))}
      </ul>
      {!d.done && d.lastAction && <p className="ledger-action">{d.lastAction}</p>}
      {d.error && <p className="ledger-err">{d.error}</p>}
      {d.done && heldCount > 0 && (
        <>
          <button type="button" className="reviewbtn" onClick={() => setShowHeld((v) => !v)}>
            {showHeld ? "Hide held cards" : `Review ${heldCount} held`}
          </button>
          {showHeld && (
            <>
              <p className="held-note">
                Left out: couldn't be tied to your source. Nothing required; optionally fix or
                dismiss.
              </p>
              <ul className="heldlist">
                {(d.held ?? [])
                  .filter((h) => !dropped.has(h.front))
                  .map((h) => (
                    <li key={h.front}>
                      <span className="held-front">{h.front}</span>
                      <span className="held-reason">{h.reasons.join(", ")}</span>
                      <div className="held-actions">
                        <button
                          type="button"
                          className="held-btn"
                          onClick={() =>
                            onAction?.(
                              `In pack "${d.packId ?? "the draft"}", reshape the held card "${h.front}" to claim only what the source supports, so it grounds and gets included.`,
                            )
                          }
                        >
                          Fix it
                        </button>
                        <button
                          type="button"
                          className="held-btn ghost"
                          onClick={() => setDropped((s) => new Set(s).add(h.front))}
                        >
                          Dismiss
                        </button>
                      </div>
                    </li>
                  ))}
              </ul>
            </>
          )}
        </>
      )}
      {d.done && d.packId && onAction && (
        <div className="ledger-actions">
          <button
            type="button"
            className="lg-btn primary"
            onClick={() =>
              onAction(
                `Looks good. Finalize and install the ${d.ready} ready cards from pack "${d.packId}".`,
              )
            }
          >
            Install {d.ready} cards →
          </button>
          {heldCount > 0 && (
            <button
              type="button"
              className="lg-btn"
              onClick={() =>
                onAction(
                  `Reshape the held cards in pack "${d.packId}" with looser phrasing so they ground and get included.`,
                )
              }
            >
              Reshape {heldCount} held
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function App() {
  const [step, setStep] = useState(1);
  const [topic, setTopic] = useState("");
  const [style, setStyle] = useState<StyleId>("recallit");
  const [modality, setModality] = useState<Modality>("text");
  const [sources, setSources] = useState<Source[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [input, setInput] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const kicked = useRef(false);

  const { messages, sendMessage, setMessages, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/build" }),
  });
  const busy = status === "submitted" || status === "streaming";
  const { jobs, startJob } = useJobs(setMessages as (fn: (p: object[]) => object[]) => void);

  // Sidebar: installed tutors, refreshed on mount and whenever a job completes.
  const [tutors, setTutors] = useState<{ id: string; cards: number; due: number }[]>([]);
  const refreshTutors = useCallback(() => {
    fetch("/api/tutors")
      .then((r) => r.json())
      .then(setTutors)
      .catch(() => {});
  }, []);
  const doneCount = jobs.filter((j) => j.status === "done").length;
  useEffect(() => {
    refreshTutors();
  }, [refreshTutors, doneCount]);

  // Completion banner: the most recent done job the user hasn't dismissed.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const notifJob = jobs.find((j) => j.status === "done" && j.result && !dismissed.has(j.id));
  const dismissNotif = (id: string) => setDismissed((s) => new Set(s).add(id));
  const scrollToJob = (id: string) => {
    document
      .getElementById(`msg-job-${id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // Persist chat history and restore it on first render (survives page reload).
  const sessionRestored = useRef(false);
  useEffect(() => {
    if (sessionRestored.current) return;
    sessionRestored.current = true;
    try {
      const saved = sessionStorage.getItem("studio-messages");
      if (saved) setMessages(JSON.parse(saved));
    } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      sessionStorage.setItem("studio-messages", JSON.stringify(messages));
    } catch {}
  }, [messages]);

  // Inline action buttons (Install / Reshape / Fix held) send a chat message so the
  // agent acts (finalize_tutor / shape) — the agent-native loop, no typing "yes".
  const sendAction = (text: string) => {
    if (busy) return;
    sendMessage({ text });
  };

  function addFiles(list: FileList | null) {
    if (!list) return;
    setSources((prev) => [
      ...prev,
      ...Array.from(list).map((f) => ({ kind: "file" as const, name: f.name, file: f })),
    ]);
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  }
  function addUrl() {
    const url = urlInput.trim();
    if (!url) return;
    setSources((prev) => [...prev, { kind: "url", name: url, url }]);
    setUrlInput("");
  }

  async function startBuilding() {
    setStep(3);
    if (kicked.current) return;
    kicked.current = true;
    // Upload files to temp server paths; URLs pass through as-is.
    const refs: string[] = [];
    for (const s of sources) {
      if (s.kind === "url") {
        refs.push(s.url);
      } else {
        const fd = new FormData();
        fd.append("file", s.file);
        const r = await fetch("/api/sources", { method: "POST", body: fd });
        refs.push(((await r.json()) as { path: string }).path);
      }
    }
    // Tell the chat what's happening, then kick off the background job.
    // The job card injects inline via setMessages; no stream blocks the composer.
    const cue = sources.length ? `${sources.map((s) => s.name).join(", ")}` : "description only";
    sendMessage({
      text: `Building a ${style} tutor from: ${topic.trim()} (${cue}). I'll let you know when the honesty gate finishes.`,
    });
    await startJob(refs.length ? refs : [topic.trim()], undefined, style);
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
                type="button"
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
            gate: you can't shape a claim the sources don't back.
          </p>

          <textarea
            className="topicbox"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Onboard new hires on our incident-response runbook: detection, escalation, post-mortem."
            rows={3}
          />

          <p className="fieldlabel">Pedagogy</p>
          <div className="stylegrid">
            {STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={s.soon}
                className={`stylecard ${s.id === style ? "sel" : ""} ${s.soon ? "soon" : ""}`}
                onClick={() => !s.soon && setStyle(s.id)}
              >
                <span className="stylename">
                  {s.name}
                  {s.soon && <span className="soonbadge">coming</span>}
                </span>
                <span className="styledesc">{s.desc}</span>
                <span className="styledone">done · {s.done}</span>
              </button>
            ))}
          </div>

          <div className="fieldrow">
            <span className="fieldlabel">Modality</span>
            <span className="seg">
              {(["text", "voice", "both"] as Modality[]).map((m) => (
                <button
                  type="button"
                  key={m}
                  className={m === modality ? "on" : ""}
                  onClick={() => setModality(m)}
                >
                  {m}
                </button>
              ))}
            </span>
          </div>

          <div className="navbtns">
            <button
              type="button"
              className="btn primary"
              disabled={!topic.trim()}
              onClick={() => setStep(2)}
            >
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
            Drop in PDFs, notes, a repo, a link. recallit reads them, and every card it drafts will
            cite a verbatim line from one of them.
          </p>

          {/** biome-ignore lint/a11y/noStaticElementInteractions: drop target wraps a real file input + button */}
          <div className="dropzone" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
            <div className="dropico">＋</div>
            <p>
              Drop files here, or{" "}
              <button type="button" className="linklike" onClick={() => fileInput.current?.click()}>
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

          <div className="urlrow">
            <input
              className="urlinput"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addUrl();
                }
              }}
              placeholder="…or paste a link (https://…)"
              aria-label="Paste a source link"
            />
            <button
              type="button"
              className="btn ghost"
              onClick={addUrl}
              disabled={!urlInput.trim()}
            >
              Add link
            </button>
          </div>

          {sources.length > 0 && (
            <>
              <p className="fieldlabel">Sources</p>
              <div className="srcchips">
                {sources.map((s, i) => (
                  <span className="srcchip" key={`${s.name}-${i}`}>
                    {s.kind === "url" ? "🔗" : "📄"} {s.name}
                    <button
                      type="button"
                      aria-label={`remove ${s.name}`}
                      onClick={() => setSources((prev) => prev.filter((_, j) => j !== i))}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            </>
          )}

          <div className="navbtns">
            <button type="button" className="btn ghost" onClick={() => setStep(1)}>
              ← Back
            </button>
            <button type="button" className="btn primary" onClick={startBuilding}>
              {sources.length ? "Start building →" : "Build from description →"}
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
              {sources.length ? ` · ${sources.length} source${sources.length > 1 ? "s" : ""}` : ""}
            </span>
          </div>
          {jobs.length > 0 && (
            <div className="job-tray" role="status" aria-live="polite">
              <span className="tray-label">building</span>
              {jobs.map((j: Job) => (
                <span
                  key={j.id}
                  className={`tray-pill ${j.status}`}
                  title={
                    j.status === "done" && j.result
                      ? `${j.result.ready}/${j.result.total} ready`
                      : j.status
                  }
                >
                  <span className="tray-pip" />
                  {jobLabel(j)}
                  {j.status === "done" && j.result && ` · ${j.result.ready}/${j.result.total}`}
                </span>
              ))}
            </div>
          )}
          <div className="shape-cols">
            <aside className="sidebar">
              <p className="sidebar-section">Your tutors</p>
              {jobs
                .filter((j) => j.status === "running" || j.status === "queued")
                .map((j) => (
                  <div className="tutor-row" key={j.id}>
                    <span className="trow-dot building" />
                    <span className="trow-name">{jobLabel(j)}</span>
                    <span className="trow-tag building">building</span>
                  </div>
                ))}
              {tutors.map((t) => (
                <div className="tutor-row" key={t.id}>
                  <span className="trow-dot built" />
                  <span className="trow-name">{t.id}</span>
                  <span className="trow-tag ok">{t.due} due</span>
                </div>
              ))}
              {tutors.length === 0 && jobs.length === 0 && (
                <div className="tutor-row" style={{ color: "var(--muted)" }}>
                  no tutors yet
                </div>
              )}
            </aside>
            <div className="main-col">
              {notifJob?.result && (
                // biome-ignore lint/a11y/useKeyWithClickEvents: the See-results button inside is keyboard-reachable
                <div
                  className="notif-banner"
                  role="status"
                  onClick={() => {
                    scrollToJob(notifJob.id);
                    dismissNotif(notifJob.id);
                  }}
                >
                  <span className="notif-dot" />
                  <span className="notif-text">
                    <b>{notifJob.result.packId}</b> finished. {notifJob.result.ready} of{" "}
                    {notifJob.result.total} cards ready
                    {notifJob.result.held.length ? `, ${notifJob.result.held.length} held` : ""}.
                  </span>
                  <span style={{ font: "600 11px var(--mono)", color: "var(--mint-deep)" }}>
                    See results →
                  </span>
                  <button
                    type="button"
                    className="notif-x"
                    aria-label="Dismiss"
                    onClick={(e) => {
                      e.stopPropagation();
                      dismissNotif(notifJob.id);
                    }}
                  >
                    ✕
                  </button>
                </div>
              )}
              <main className="chat">
                {messages.map((m) => (
                  <div key={m.id} id={`msg-${m.id}`} className={`msg ${m.role}`}>
                    <span className="who">{m.role === "user" ? "you" : "assistant"}</span>
                    <div className="bubble">
                      {m.parts.map((part, i) => {
                        if (part.type === "text")
                          return m.role === "assistant" ? (
                            <div className="md" key={`${m.id}-${i}`}>
                              <Markdown remarkPlugins={[remarkGfm]}>{part.text}</Markdown>
                            </div>
                          ) : (
                            <span key={`${m.id}-${i}`}>{part.text}</span>
                          );
                        if (part.type === "data-job") {
                          return (
                            <JobCard key={`${m.id}-${i}`} d={(part as { data?: JobData }).data} />
                          );
                        }
                        if (part.type === "data-ledger") {
                          return (
                            <Ledger
                              key={`${m.id}-${i}`}
                              d={(part as { data?: LedgerData }).data}
                              onAction={sendAction}
                            />
                          );
                        }
                        // The ledger supersedes the author_tutor tool chip (richer view).
                        if (part.type === "tool-author_tutor" || part.type === "tool-shape")
                          return null;
                        if (part.type === "tool-propose_actions") {
                          const tp = part as {
                            state?: string;
                            input?: { question?: string; actions?: ProposedAction[] };
                          };
                          // Render only once the input has fully streamed; stale rows
                          // (an older message) stay visible but disabled.
                          if (tp.state !== "input-available" && tp.state !== "output-available")
                            return null;
                          const acts = tp.input?.actions;
                          if (!acts?.length) return null;
                          const isLast = m.id === messages[messages.length - 1]?.id;
                          return (
                            <ActionRow
                              key={`${m.id}-${i}`}
                              question={tp.input?.question}
                              actions={acts}
                              disabled={busy || !isLast}
                              onAction={sendAction}
                            />
                          );
                        }
                        if (part.type === "tool-finalize_tutor") {
                          const out = (part as { output?: FinalizeOutput }).output;
                          if (!out?.installed) return null;
                          return <TutorReady key={`${m.id}-${i}`} out={out} />;
                        }
                        if (part.type.startsWith("tool-")) {
                          const tp = part as { state?: string; output?: ToolOutput };
                          const done = tp.state === "output-available";
                          return (
                            <div className="toolpart" key={`${m.id}-${i}`}>
                              <span className="tp-ic">{done ? "✓" : "▸"}</span>
                              <span className="tp-name">{part.type.slice(5)}</span>
                              <span className="tp-sum">
                                {done ? summarizeTool(tp.output) : "running…"}
                              </span>
                            </div>
                          );
                        }
                        return null;
                      })}
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
            </div>
          </div>
        </>
      )}
    </div>
  );
}
