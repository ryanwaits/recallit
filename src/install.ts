// Install a topic pack (see pack.ts) into RECALLIT_DATA_DIR. Validates the
// manifest, gates on engine compatibility, then materializes the pack into
// data/topics/<id>/ THROUGH the engine primitives (createCard) so the derived
// sqlite index is built — packs never ship the index.
import { copyFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import pkg from "../package.json" with { type: "json" };
import { normalize } from "./evaluate.ts";
import { loadPack } from "./pack.ts";
import { cardAttemptFile, scenariosDir, topicDir } from "./paths.ts";
import { resolvePackSource } from "./resolve.ts";
import { createCard, listCards, updateCard } from "./store.ts";
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
  /**
   * Non-destructive enhance: if the topic exists, ADD only cards whose front is new
   * (keyed by normalize(front)) and leave existing cards — and their FSRS schedule —
   * untouched. Preserves review history. Cannot apply edits to existing cards (use force).
   */
  merge?: boolean;
  /** Override the engine version checked against the pack's `engine` range (tests). */
  coreVersion?: string;
}

export interface InstallResult {
  topicId: string;
  cards: number;
  audio: number;
  scenarios: number;
  /** Cards skipped because they carry meta.status === "needs-review". */
  heldForReview: number;
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
  if (existing && opts.merge) {
    // Non-destructive: add new cards only, preserve existing cards + their FSRS state.
    return await mergeIntoTopic(id, source, pack, opts);
  }
  if (existing) {
    if (!opts.force) {
      throw new Error(`topic "${id}" already exists — re-run with force to overwrite`);
    }
    // Cards get fresh ids on install, so a destructive re-install replaces, not merges.
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

  // Engine invariant: cards flagged needs-review (by the honesty/quality gate) never
  // auto-install. The split is structural — carried in meta.status on disk.
  const installable = pack.cards.filter((c) => c.meta?.status !== "needs-review");
  const heldForReview = pack.cards.length - installable.length;

  const wantAudio = opts.audio ?? true;
  let audio = 0;
  for (const pc of installable) {
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
  return { topicId: id, cards: installable.length, audio, scenarios, heldForReview };
}

/** Add only new cards (by normalized front) into an existing topic; preserve the rest + their FSRS. */
async function mergeIntoTopic(
  id: string,
  source: string,
  pack: Awaited<ReturnType<typeof loadPack>>,
  opts: InstallOptions,
): Promise<InstallResult> {
  const installable = pack.cards.filter((c) => c.meta?.status !== "needs-review");
  const heldForReview = pack.cards.length - installable.length;
  const existingFronts = new Set((await listCards(id)).map((c) => normalize(c.front)));

  const wantAudio = opts.audio ?? true;
  let added = 0;
  let audio = 0;
  for (const pc of installable) {
    if (existingFronts.has(normalize(pc.front))) continue; // keep the existing card + its schedule
    const { audio: audioFile, ...input } = pc;
    const card = await createCard(id, input);
    added++;
    if (wantAudio && audioFile) {
      try {
        await copyFile(
          join(source, "assets", audioFile),
          cardAttemptFile(id, card.id, "native.mp3"),
        );
        await updateCard(id, card.id, { media: "native.mp3" });
        audio++;
      } catch {
        // best-effort
      }
    }
  }

  await mkdir(scenariosDir(id), { recursive: true });
  let scenarios = 0;
  for (const sid of pack.scenarios) {
    const dest = join(scenariosDir(id), `${sid}.md`);
    if (!(await Bun.file(dest).exists())) {
      await copyFile(join(source, "scenarios", `${sid}.md`), dest);
      scenarios++;
    }
  }

  if (opts.activate ?? true) await setActiveTopic(id);
  return { topicId: id, cards: added, audio, scenarios, heldForReview };
}

export interface ReinstallPlan {
  topicExists: boolean;
  /** True when every existing card's front still appears in the edited pack (nothing changed/removed). */
  additive: boolean;
  added: number;
  changedOrRemoved: number;
}

/**
 * Decide how to re-install an edited pack: a purely additive edit can be merged
 * non-destructively (preserve FSRS); an edit that changed/removed existing cards
 * needs a force rebuild (resets FSRS). Compares by normalize(front).
 */
export async function planReinstall(id: string, packDir: string): Promise<ReinstallPlan> {
  if (!(await readTopicConfig(id))) {
    return { topicExists: false, additive: true, added: 0, changedOrRemoved: 0 };
  }
  const pack = await loadPack(packDir);
  const edited = new Set(
    pack.cards.filter((c) => c.meta?.status !== "needs-review").map((c) => normalize(c.front)),
  );
  const current = new Set((await listCards(id)).map((c) => normalize(c.front)));
  let added = 0;
  for (const f of edited) if (!current.has(f)) added++;
  let changedOrRemoved = 0;
  for (const f of current) if (!edited.has(f)) changedOrRemoved++;
  return { topicExists: true, additive: changedOrRemoved === 0, added, changedOrRemoved };
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
