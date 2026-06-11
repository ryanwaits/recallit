// Background job polling hook. Manages the job tray and injects ledger results
// into the useChat message history via setMessages — so the existing <Ledger>
// component renders the result in the right position in the conversation.
import { useCallback, useEffect, useRef, useState } from "react";

export type JobStatus = "queued" | "running" | "done" | "error";

export interface JobResult {
  packId: string;
  ready: number;
  total: number;
  held: { front: string; reasons: string[] }[];
  grounding: string;
  costUsd: number;
}

export interface Job {
  id: string;
  status: JobStatus;
  packId?: string;
  sources: string[];
  scope?: string;
  pedagogyStyle?: string;
  result?: JobResult;
  errorText?: string;
  createdAt: string;
  updatedAt: string;
}

// The in-flight job data-part type. Replaced by data-ledger when the poll returns done.
export interface JobData {
  jobId: string;
  status: JobStatus;
  packId?: string;
  result?: JobResult;
  errorText?: string;
  createdAt: string;
}

// A UIMessage assembled from a job for injection into the chat.
export function buildJobMessage(job: Job): object {
  return {
    id: `job-${job.id}`,
    role: "assistant",
    parts: [{ type: "data-job", id: job.id, data: toJobData(job) }],
  };
}

function toJobData(job: Job): JobData {
  return {
    jobId: job.id,
    status: job.status,
    packId: job.packId,
    result: job.result,
    errorText: job.errorText,
    createdAt: job.createdAt,
  };
}

// Replace the data-job part in a message with the final data-ledger (for <Ledger>),
// plus a TEXT part: data parts are UI-only and never reach the model, so without
// this the assistant doesn't know the build finished or what the packId is.
function injectResult(messages: object[], jobId: string, job: Job): object[] {
  let changed = false;
  const next = messages.map((m: object) => {
    const msg = m as { id: string; parts: { type: string; id?: string }[] };
    // Match any message carrying this job's data part: FE-injected job messages
    // (id `job-<id>`) AND assistant messages where the start_build tool emitted it.
    if (!msg.parts?.some((p) => p.type === "data-job" && p.id === jobId)) return m;
    changed = true;
    const parts = msg.parts.flatMap((p): object[] => {
      if (p.type !== "data-job" || p.id !== jobId) return [p];
      if (job.status === "done" && job.result) {
        const v = job.result;
        return [
          {
            type: "data-ledger",
            id: "ledger",
            data: {
              steps: [
                { label: "Reading the source", state: "done" },
                { label: "Drafting cards", state: "done" },
                { label: "Running the honesty gate", state: "done" },
              ],
              done: true,
              packId: v.packId,
              ready: v.ready,
              total: v.total,
              held: v.held,
              grounding: v.grounding,
              costUsd: v.costUsd,
            },
          },
          {
            type: "text",
            text: `Build finished: pack "${v.packId}", ${v.ready} of ${v.total} cards verified${
              v.held.length ? `, ${v.held.length} held by the gate` : ""
            }.`,
          },
        ];
      }
      if (job.status === "error") {
        return [
          { ...p, data: toJobData(job) },
          { type: "text", text: `Build failed: ${job.errorText ?? "unknown error"}.` },
        ];
      }
      // Still in flight: just refresh the card data.
      return [{ ...p, data: toJobData(job) }];
    });
    return { ...msg, parts };
  });
  // Identity-preserving: callers poll repeatedly; an unchanged array avoids
  // re-renders and localStorage churn.
  return changed ? next : messages;
}

const POLL_INTERVAL = 5_000;

export function useJobs(setMessages: (fn: (prev: object[]) => object[]) => void) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const intervals = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  // Discovery poll: re-hydrate on mount AND keep scanning (every 10s) so jobs
  // started elsewhere — e.g. by the chat agent's start_build tool — get tracked.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only interval; schedulePoll/setMessages are stable
  useEffect(() => {
    const scan = () => {
      fetch("/api/jobs")
        .then((r) => r.json() as Promise<Job[]>)
        .then((serverJobs) => {
          setJobs(serverJobs);
          for (const j of serverJobs) {
            if (j.status === "queued" || j.status === "running") {
              schedulePoll(j.id);
            } else {
              // Finished (possibly while we were away): bring any chat card
              // carrying this job up to date (no-op if none).
              setMessages((prev) => injectResult(prev, j.id, j));
            }
          }
        })
        .catch(() => {});
    };
    scan();
    const t = setInterval(scan, 10_000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const schedulePoll = useCallback(
    (jobId: string) => {
      if (intervals.current.has(jobId)) return;
      const t = setInterval(async () => {
        try {
          const r = await fetch(`/api/jobs/${jobId}`);
          if (!r.ok) return;
          const job = (await r.json()) as Job;
          setJobs((prev) => prev.map((j) => (j.id === jobId ? job : j)));
          // Keep the in-chat card live on every tick (queued -> running -> ...),
          // not just at completion.
          setMessages((prev) => injectResult(prev, jobId, job));
          if (job.status === "done" || job.status === "error") {
            const t = intervals.current.get(jobId);
            if (t) clearInterval(t);
            intervals.current.delete(jobId);
          }
        } catch {}
      }, POLL_INTERVAL);
      intervals.current.set(jobId, t);
    },
    [setMessages],
  );

  // Cleanup on unmount.
  useEffect(() => {
    const map = intervals.current;
    return () => {
      for (const t of map.values()) clearInterval(t);
    };
  }, []);

  const startJob = useCallback(
    async (sources: string[], scope?: string, pedagogyStyle?: string) => {
      const r = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sources, scope, pedagogyStyle }),
      });
      if (!r.ok) throw new Error(`POST /api/jobs failed: ${r.status}`);
      const { jobId } = (await r.json()) as { jobId: string };
      const now = new Date().toISOString();
      const optimistic: Job = {
        id: jobId,
        status: "queued",
        sources,
        scope,
        pedagogyStyle,
        createdAt: now,
        updatedAt: now,
      };
      setJobs((prev) => [optimistic, ...prev]);
      // Inject the job card into the chat at the current tail.
      setMessages((prev) => [...prev, buildJobMessage(optimistic)] as object[]);
      schedulePoll(jobId);
      return jobId;
    },
    [setMessages, schedulePoll],
  );

  return { jobs, startJob };
}
