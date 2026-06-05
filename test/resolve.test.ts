// 3.3: remote pack sources. parseSource is pure; resolvePackSource fetches to a
// temp dir. Exercised offline against a real tarball and a local git repo, then
// installs through the normal path to prove remote → install works end to end.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDueCardIds } from "../src/db.ts";
import { installPack } from "../src/install.ts";
import { loadPack } from "../src/pack.ts";
import { parseSource, resolvePackSource } from "../src/resolve.ts";

const REPO = join(import.meta.dir, "..");
const FIXTURE = join(import.meta.dir, "fixtures", "pack-min");

async function sh(cmd: string[], cwd?: string): Promise<void> {
  const p = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  if ((await p.exited) !== 0)
    throw new Error(`${cmd.join(" ")}: ${await new Response(p.stderr).text()}`);
}

describe("parseSource", () => {
  test("classifies every supported form", () => {
    expect(parseSource("./packs/x")).toMatchObject({ kind: "dir", path: "./packs/x" });
    expect(parseSource("pack.tgz")).toMatchObject({ kind: "tarball", path: "pack.tgz" });
    expect(parseSource("npm:@me/spanish@1.2.0")).toMatchObject({
      kind: "npm",
      spec: "@me/spanish@1.2.0",
    });
    expect(parseSource("github:me/spanish-pack")).toMatchObject({
      kind: "git",
      url: "https://github.com/me/spanish-pack.git",
    });
    expect(parseSource("github:me/monorepo/packs/spanish#v2")).toMatchObject({
      kind: "git",
      url: "https://github.com/me/monorepo.git",
      ref: "v2",
      subdir: "packs/spanish",
    });
    expect(parseSource("git+https://x.com/me/p.git#main")).toMatchObject({
      kind: "git",
      url: "https://x.com/me/p.git",
      ref: "main",
    });
    expect(parseSource("git@github.com:me/p.git")).toMatchObject({ kind: "git" });
  });
});

describe("resolvePackSource", () => {
  let tmp: string;
  let tgz: string;
  let gitRepo: string;

  beforeAll(async () => {
    tmp = await mkdtemp(join(tmpdir(), "recallit-resolve-"));
    // A real tarball of the reference pack (wrapper dir = spanish-mx-rgv/).
    tgz = join(tmp, "spanish.tgz");
    await sh(["tar", "-czf", tgz, "-C", join(REPO, "packs"), "spanish-mx-rgv"]);
    // A local git repo holding the minimal fixture pack at its root.
    gitRepo = join(tmp, "gitpack");
    await sh(["cp", "-R", FIXTURE, gitRepo]);
    await sh(["git", "init", "-q"], gitRepo);
    await sh(["git", "add", "."], gitRepo);
    await sh(
      ["git", "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "pack"],
      gitRepo,
    );
  });
  afterAll(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("resolves a tarball to the pack root (scans the wrapper dir)", async () => {
    const r = await resolvePackSource(tgz);
    try {
      const pack = await loadPack(r.dir);
      expect(pack.manifest.id).toBe("spanish-mx-rgv");
      expect(pack.cards.length).toBe(41);
    } finally {
      await r.cleanup();
    }
  });

  test("resolves a local git repo via git+file:// and cleans up", async () => {
    const r = await resolvePackSource(`git+file://${gitRepo}`);
    let dir: string;
    try {
      dir = r.dir;
      const pack = await loadPack(dir);
      expect(pack.manifest.id).toBe("pack-min");
    } finally {
      await r.cleanup();
    }
    expect(await Bun.file(join(dir, "manifest.json")).exists()).toBe(false); // temp removed
  });
});

describe("installPack from a remote-style source", () => {
  test("installs straight from a tarball", async () => {
    const data = await mkdtemp(join(tmpdir(), "recallit-remote-install-"));
    const work = await mkdtemp(join(tmpdir(), "recallit-remote-tgz-"));
    const tgz = join(work, "spanish.tgz");
    await sh(["tar", "-czf", tgz, "-C", join(REPO, "packs"), "spanish-mx-rgv"]);
    process.env.RECALLIT_DATA_DIR = data;
    try {
      const res = await installPack(tgz);
      expect(res.cards).toBe(41);
      expect(getDueCardIds("spanish-mx-rgv").length).toBe(41);
    } finally {
      await rm(data, { recursive: true, force: true });
      await rm(work, { recursive: true, force: true });
    }
  });
});
