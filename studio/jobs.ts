// Background build jobs store (bun:sqlite). Lives entirely in the studio layer;
// engine files (src/) are untouched. The DB file (studio/jobs.sqlite or
// STUDIO_JOBS_DB env) survives server restarts so the tray can re-hydrate.
//
// Lifecycle: queued → running → done | error
// runJobAsync: detached (fire-and-forget from the POST /api/jobs route).
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { runPackAuthorMulti } from "../src/packgen/author.ts";

const DB_PATH = process.env.STUDIO_JOBS_DB ?? join(import.meta.dir, "jobs.sqlite");
const MAX_BUDGET = Number(process.env.STUDIO_MAX_BUDGET ?? 1);

// ── types ──────────────────────────────────────────────────────────────────
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

// Raw DB row (JSON columns serialized as strings).
interface Row {
  id: string;
  status: string;
  pack_id: string | null;
  sources: string;
  scope: string | null;
  pedagogy_style: string | null;
  result_json: string | null;
  error_text: string | null;
  created_at: string;
  updated_at: string;
}

// ── db ─────────────────────────────────────────────────────────────────────
function open(): Database {
  const db = new Database(DB_PATH, { create: true });
  db.exec(`CREATE TABLE IF NOT EXISTS jobs (
    id           TEXT PRIMARY KEY,
    status       TEXT NOT NULL DEFAULT 'queued',
    pack_id      TEXT,
    sources      TEXT NOT NULL,
    scope        TEXT,
    pedagogy_style TEXT,
    result_json  TEXT,
    error_text   TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
  );`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at DESC);");
  return db;
}

function toJob(row: Row): Job {
  return {
    id: row.id,
    status: row.status as JobStatus,
    packId: row.pack_id ?? undefined,
    sources: JSON.parse(row.sources) as string[],
    scope: row.scope ?? undefined,
    pedagogyStyle: row.pedagogy_style ?? undefined,
    result: row.result_json ? (JSON.parse(row.result_json) as JobResult) : undefined,
    errorText: row.error_text ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── CRUD ───────────────────────────────────────────────────────────────────
export function createJob(sources: string[], scope?: string, pedagogyStyle?: string): Job {
  const db = open();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.query(
    `INSERT INTO jobs (id, status, sources, scope, pedagogy_style, created_at, updated_at)
     VALUES (?1, 'queued', ?2, ?3, ?4, ?5, ?5)`,
  ).run(id, JSON.stringify(sources), scope ?? null, pedagogyStyle ?? null, now);
  db.close();
  return { id, status: "queued", sources, scope, pedagogyStyle, createdAt: now, updatedAt: now };
}

export function getJob(id: string): Job | null {
  const db = open();
  const row = db.query<Row, [string]>("SELECT * FROM jobs WHERE id = ?1").get(id);
  db.close();
  return row ? toJob(row) : null;
}

export function listJobs(): Job[] {
  const db = open();
  const rows = db.query<Row, []>("SELECT * FROM jobs ORDER BY created_at DESC").all();
  db.close();
  return rows.map(toJob);
}

interface JobPatch {
  status?: JobStatus;
  packId?: string;
  result?: JobResult;
  errorText?: string;
}

export function updateJob(id: string, patch: JobPatch): void {
  const db = open();
  const now = new Date().toISOString();
  if (patch.status !== undefined) {
    db.query("UPDATE jobs SET status = ?2, updated_at = ?3 WHERE id = ?1").run(
      id,
      patch.status,
      now,
    );
  }
  if (patch.packId !== undefined) {
    db.query("UPDATE jobs SET pack_id = ?2, updated_at = ?3 WHERE id = ?1").run(
      id,
      patch.packId,
      now,
    );
  }
  if (patch.result !== undefined) {
    db.query("UPDATE jobs SET result_json = ?2, updated_at = ?3 WHERE id = ?1").run(
      id,
      JSON.stringify(patch.result),
      now,
    );
  }
  if (patch.errorText !== undefined) {
    db.query("UPDATE jobs SET error_text = ?2, updated_at = ?3 WHERE id = ?1").run(
      id,
      patch.errorText,
      now,
    );
  }
  db.close();
}

/** Mark any jobs still running at startup as errored (server died mid-run). */
export function sweepStalledJobs(): void {
  const db = open();
  const now = new Date().toISOString();
  db.query(
    `UPDATE jobs SET status = 'error', error_text = 'server restarted during build',
     updated_at = ?1 WHERE status IN ('queued', 'running')`,
  ).run(now);
  db.close();
}

// ── async runner (fire-and-forget) ─────────────────────────────────────────
/** Start a job in the background. NEVER await this at the call site. */
export function runJobAsync(job: Job): void {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  (async () => {
    updateJob(job.id, { status: "running" });
    try {
      const res = await runPackAuthorMulti(job.sources, {
        scope: job.scope,
        pedagogyStyle: job.pedagogyStyle,
        maxBudgetUsd: MAX_BUDGET,
        maxTurns: 30,
        onEvent: (_e) => {
          // onEvent fires during the run; res isn't assigned yet so we can't
          // read it here. packId is set after runPackAuthorMulti returns below.
        },
      });
      const v = res.verdict;
      if (v) {
        updateJob(job.id, {
          status: "done",
          packId: res.packId,
          result: {
            packId: res.packId,
            ready: v.ready,
            total: v.total,
            held: v.needsReview.map((r) => ({ front: r.card.front, reasons: r.reasons })),
            grounding: v.grounding,
            costUsd: res.costUsd,
          },
        });
      } else {
        updateJob(job.id, {
          status: "error",
          packId: res.packId,
          errorText: `no pack written (${res.stopReason}, $${res.costUsd.toFixed(3)})`,
        });
      }
    } catch (err) {
      updateJob(job.id, {
        status: "error",
        errorText: String(err instanceof Error ? err.message : err),
      });
    }
  })();
}
