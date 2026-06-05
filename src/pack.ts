// Topic packs: the portable, versioned unit of "a subject" for recallit. A pack
// is plain data — manifest.json + cards.json + scenarios/ + assets/ — authored in
// any dir/repo and installed into RECALLIT_DATA_DIR (see install.ts). This module
// owns the SPEC: the manifest/card schemas and a read-only loader. No writes here.
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

export const PACK_SCHEMA_VERSION = 1;

const ModalitySchema = z.enum(["text", "voice", "both"]);

/** manifest.json — TopicConfig fields wrapped in a versioned, compat-checked envelope. */
export const PackManifestSchema = z.object({
  /** Bumped when the on-disk pack format changes incompatibly. */
  schemaVersion: z.literal(PACK_SCHEMA_VERSION),
  /** semver range of @recallit/core this pack needs, e.g. ">=0.1.0". */
  engine: z.string().min(1),
  id: z.string().min(1),
  name: z.string().min(1),
  modality: ModalitySchema,
  recallStyle: z.string().optional(),
  goalMetric: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).default({}),
});
export type PackManifest = z.infer<typeof PackManifestSchema>;

/** cards.json entry — a NewCardInput plus an optional pointer into assets/. */
export const PackCardSchema = z.object({
  type: z.string().optional(),
  front: z.string().min(1),
  back: z.string().min(1),
  context: z.string().optional(),
  tags: z.array(z.string()).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().optional(),
  /** Filename in the pack's assets/ dir holding this card's native audio. */
  audio: z.string().optional(),
});
export type PackCard = z.infer<typeof PackCardSchema>;

export function parsePackManifest(json: unknown): PackManifest {
  const r = PackManifestSchema.safeParse(json);
  if (!r.success) {
    const detail = r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new Error(`invalid pack manifest: ${detail.join("; ")}`);
  }
  return r.data;
}

export interface LoadedPack {
  dir: string;
  manifest: PackManifest;
  cards: PackCard[];
  /** Scenario ids (basename without .md). */
  scenarios: string[];
  /** Asset filenames present in assets/. */
  assets: string[];
}

/** Read + validate a pack from a local directory. Pure read — does not install. */
export async function loadPack(dir: string): Promise<LoadedPack> {
  const manifestFile = Bun.file(join(dir, "manifest.json"));
  if (!(await manifestFile.exists())) throw new Error(`no manifest.json in pack: ${dir}`);
  const manifest = parsePackManifest(await manifestFile.json());

  const cardsFile = Bun.file(join(dir, "cards.json"));
  const rawCards: unknown = (await cardsFile.exists()) ? await cardsFile.json() : [];
  const cards = z.array(PackCardSchema).parse(rawCards);

  const scenarios = (await safeReaddir(join(dir, "scenarios")))
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""))
    .sort();
  const assets = (await safeReaddir(join(dir, "assets"))).sort();

  return { dir, manifest, cards, scenarios, assets };
}

async function safeReaddir(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}
