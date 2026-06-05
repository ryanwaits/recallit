// Resolve a `topic add` source to a local directory holding the pack. Supports a
// local dir/tarball, a git repo (incl. github: shorthand), or an npm package —
// remote forms are fetched into a temp dir that the caller cleans up. The install
// path itself stays local-only (install.ts); this is the only network-aware piece.
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface SourceDescriptor {
  kind: "dir" | "tarball" | "git" | "npm";
  /** Local path (dir or .tgz). */
  path?: string;
  /** git clone URL. */
  url?: string;
  /** Branch/tag to check out. */
  ref?: string;
  /** Subdirectory within the repo/tarball that holds the pack. */
  subdir?: string;
  /** npm package spec (name[@version]). */
  spec?: string;
}

/** Classify a source string. Pure — no IO. */
export function parseSource(source: string): SourceDescriptor {
  const s = source.trim();
  if (s.startsWith("github:")) {
    const [body, ref] = s.slice("github:".length).split("#");
    const parts = (body ?? "").split("/");
    const [owner, repo, ...rest] = parts;
    return {
      kind: "git",
      url: `https://github.com/${owner}/${repo}.git`,
      ref: ref || undefined,
      subdir: rest.length ? rest.join("/") : undefined,
    };
  }
  if (s.startsWith("git+")) {
    const [url, ref] = s.slice("git+".length).split("#");
    return { kind: "git", url, ref: ref || undefined };
  }
  if (
    s.startsWith("git@") ||
    s.startsWith("ssh://") ||
    (s.startsWith("http") && s.endsWith(".git"))
  ) {
    const [url, ref] = s.split("#");
    return { kind: "git", url, ref: ref || undefined };
  }
  if (s.startsWith("npm:")) return { kind: "npm", spec: s.slice("npm:".length) };
  if (s.endsWith(".tgz") || s.endsWith(".tar.gz")) return { kind: "tarball", path: s };
  return { kind: "dir", path: s };
}

export interface ResolvedSource {
  /** Local directory containing the pack's manifest.json. */
  dir: string;
  /** Remove any temp dir created during resolution. No-op for local dirs. */
  cleanup: () => Promise<void>;
}

const noop = async (): Promise<void> => {};

/** Resolve any source to a local pack directory (+ a cleanup for temp fetches). */
export async function resolvePackSource(source: string): Promise<ResolvedSource> {
  const d = parseSource(source);
  if (d.kind === "dir") return { dir: d.path ?? source, cleanup: noop };

  const tmp = await mkdtemp(join(tmpdir(), "recallit-pack-"));
  const cleanup = () => rm(tmp, { recursive: true, force: true });
  try {
    if (d.kind === "tarball") {
      await run(["tar", "-xzf", d.path ?? "", "-C", tmp]);
    } else if (d.kind === "git") {
      const args = ["git", "clone", "--depth", "1"];
      if (d.ref) args.push("--branch", d.ref);
      args.push(d.url ?? "", tmp);
      await run(args);
    } else {
      // npm pack drops a .tgz; extract it (its content lives under package/).
      await run(["npm", "pack", d.spec ?? "", "--pack-destination", tmp], { cwd: tmp });
      const tgz = (await readdir(tmp)).find((f) => f.endsWith(".tgz"));
      if (!tgz) throw new Error(`npm pack produced no tarball for "${d.spec}"`);
      await run(["tar", "-xzf", join(tmp, tgz), "-C", tmp]);
    }
    return { dir: await findPackRoot(tmp, d.subdir), cleanup };
  } catch (e) {
    await cleanup();
    throw e;
  }
}

/** Locate the dir containing manifest.json: honor subdir, else scan one level deep. */
async function findPackRoot(base: string, subdir?: string): Promise<string> {
  const candidates = subdir
    ? [join(base, subdir), join(base, "package", subdir)]
    : [base, join(base, "package")];
  for (const c of candidates) {
    if (await hasManifest(c)) return c;
  }
  // Fall back to a single wrapper dir (e.g. tar of `name/...`).
  for (const entry of await safeReaddir(base)) {
    const child = subdir ? join(base, entry, subdir) : join(base, entry);
    if (await hasManifest(child)) return child;
  }
  throw new Error(`no manifest.json found in resolved source: ${base}`);
}

async function hasManifest(dir: string): Promise<boolean> {
  try {
    return (await stat(join(dir, "manifest.json"))).isFile();
  } catch {
    return false;
  }
}

async function safeReaddir(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

async function run(cmd: string[], opts: { cwd?: string } = {}): Promise<void> {
  const proc = Bun.spawn(cmd, { cwd: opts.cwd, stdout: "pipe", stderr: "pipe" });
  const code = await proc.exited;
  if (code !== 0) {
    const err = (await new Response(proc.stderr).text()).trim();
    throw new Error(`\`${cmd[0]}\` failed (exit ${code}): ${err || "unknown error"}`);
  }
}
