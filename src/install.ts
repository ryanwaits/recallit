// Install a topic pack (see pack.ts) into RECALLIT_DATA_DIR. Validates the
// manifest, gates on engine compatibility, then materializes the pack into
// data/topics/<id>/ THROUGH the engine primitives (createCard) so the derived
// sqlite index is built — packs never ship the index.
import { copyFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import pkg from "../package.json" with { type: "json" };
import { loadPack } from "./pack.ts";
import { cardAttemptFile, scenariosDir, topicDir } from "./paths.ts";
import { resolvePackSource } from "./resolve.ts";
import { createCard, updateCard } from "./store.ts";
import { createTopic, readTopicConfig, setActiveTopic } from "./topic.ts";
import type { TopicConfig } from "./types.ts";

const CORE_VERSION = (pkg as { version: string }).version;

export interface InstallOptions {
  /** Set the installed topic active (default true). */
  activate?: boolean;
  /** Overwrite an existing topic of the same id (default false → error on collision). */
  force?: boolean;
  /** Copy bundled assets/*.mp3 (default true). */
  audio?: boolean;
  /** Override the engine version checked against the pack's `engine` range (tests). */
  coreVersion?: string;
}

export interface InstallResult {
  topicId: string;
  cards: number;
  audio: number;
  scenarios: number;
}

/**
 * Install a pack from any source: a local dir/tarball, a git repo (incl.
 * `github:owner/repo[#ref]`), or `npm:<spec>`. Remote sources are fetched to a
 * temp dir and cleaned up after install.
 */
export async function installPack(
  source: string,
  opts: InstallOptions = {},
): Promise<InstallResult> {
  const resolved = await resolvePackSource(source);
  try {
    return await installFromDir(resolved.dir, opts);
  } finally {
    await resolved.cleanup();
  }
}

async function installFromDir(source: string, opts: InstallOptions): Promise<InstallResult> {
  const pack = await loadPack(source);
  const id = pack.manifest.id;

  assertEngineSatisfied(pack.manifest.engine, opts.coreVersion ?? CORE_VERSION);

  const existing = await readTopicConfig(id);
  if (existing) {
    if (!opts.force) {
      throw new Error(`topic "${id}" already exists — re-run with force to overwrite`);
    }
    // Cards get fresh ids on install, so a re-install must replace, not merge.
    await rm(topicDir(id), { recursive: true, force: true });
  }

  const config: TopicConfig = {
    id,
    name: pack.manifest.name,
    modality: pack.manifest.modality,
    recallStyle: pack.manifest.recallStyle,
    goalMetric: pack.manifest.goalMetric,
    meta: pack.manifest.meta,
  };
  await createTopic(config);

  const wantAudio = opts.audio ?? true;
  let audio = 0;
  for (const pc of pack.cards) {
    const { audio: audioFile, ...input } = pc;
    const card = await createCard(id, input);
    if (wantAudio && audioFile) {
      try {
        await copyFile(
          join(source, "assets", audioFile),
          cardAttemptFile(id, card.id, "native.mp3"),
        );
        await updateCard(id, card.id, { media: "native.mp3" });
        audio++;
      } catch {
        // best-effort: a missing/broken asset shouldn't abort the whole install
      }
    }
  }

  await mkdir(scenariosDir(id), { recursive: true });
  let scenarios = 0;
  for (const sid of pack.scenarios) {
    await copyFile(join(source, "scenarios", `${sid}.md`), join(scenariosDir(id), `${sid}.md`));
    scenarios++;
  }

  if (opts.activate ?? true) await setActiveTopic(id);
  return { topicId: id, cards: pack.cards.length, audio, scenarios };
}

/** Throw unless `version` satisfies the pack's `engine` range. */
export function assertEngineSatisfied(range: string, version: string): void {
  if (!satisfiesEngine(version, range)) {
    throw new Error(`pack requires engine "${range}" but core is ${version}`);
  }
}

/**
 * Minimal semver range check covering what manifests actually use: "" / "*" (any),
 * exact "x.y.z", and a >=,>,<=,<,=,^,~ prefix. Caret/tilde are treated as ">= and
 * same-major (^) / same-minor (~)"; unrecognized ranges fail safe (return false).
 */
function satisfiesEngine(version: string, range: string): boolean {
  const r = range.trim();
  if (r === "" || r === "*") return true;
  const parse = (s: string): number[] => s.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const cmp = (a: number[], b: number[]): number => {
    for (let i = 0; i < 3; i++) {
      const d = (a[i] ?? 0) - (b[i] ?? 0);
      if (d !== 0) return d > 0 ? 1 : -1;
    }
    return 0;
  };
  const m = r.match(/^(>=|<=|>|<|=|\^|~)?\s*(\d+\.\d+\.\d+)$/);
  if (!m) return false;
  const op = m[1] ?? "=";
  const v = parse(version);
  const target = parse(m[2] ?? "0.0.0");
  const c = cmp(v, target);
  switch (op) {
    case ">=":
      return c >= 0;
    case ">":
      return c > 0;
    case "<=":
      return c <= 0;
    case "<":
      return c < 0;
    case "^":
      return c >= 0 && v[0] === target[0];
    case "~":
      return c >= 0 && v[0] === target[0] && v[1] === target[1];
    default:
      return c === 0;
  }
}
