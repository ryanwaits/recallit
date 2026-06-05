# Authoring & Publishing Topic Packs

A **pack** is the portable, versioned unit of a subject — plain data, no engine code. Author one in any dir/repo, then `topic add` it. The Spanish instance (`packs/spanish-mx-rgv/`) is the reference. Spec + loader: `src/pack.ts`; installer: `src/install.ts`; source resolver: `src/resolve.ts`.

## Layout

```
packs/<id>/
  manifest.json     # versioned envelope + TopicConfig fields
  cards.json        # array of NewCardInput (+ optional `audio`)
  scenarios/*.md    # roleplay templates (voice/both topics)
  assets/*.mp3      # bundled native audio (optional, portable)
```

`data/` is gitignored runtime state; `packs/` is tracked source. Packs **never** ship `index.sqlite` — the installer rebuilds it through `createCard`.

## `manifest.json`

Validated by `PackManifestSchema` (zod). Required: `schemaVersion`, `engine`, `id`, `name`, `modality`.

```json
{
  "schemaVersion": 1,
  "engine": ">=0.1.0",
  "id": "spanish-mx-rgv",
  "name": "Conversational Mexican Spanish (RGV)",
  "modality": "voice",
  "recallStyle": "Speak answers aloud; i+1 sentences; mine new words.",
  "goalMetric": "minutes_spoken",
  "meta": { "dialect": "mx-rgv", "language": "es", "voiceId": "ewn5JTa3lNPY8QVuZJi6" }
}
```

| field | notes |
|---|---|
| `schemaVersion` | literal `1` — bumped on incompatible format changes |
| `engine` | semver range the pack needs; checked at install (`>=`, `>`, `<=`, `<`, `=`, `^`, `~`, `*`) |
| `modality` | `text` \| `voice` \| `both` — drives daily phases |
| `meta` | free-form; the voice host reads `meta.voiceId` + `meta.language` |

## `cards.json`

Array of `NewCardInput` + optional `audio` (a filename in `assets/`). The installer mints card ids, copies `audio` → the card's `native.mp3`, and sets `media`.

```json
[
  { "type": "sentence", "front": "Tengo hambre.", "back": "I'm hungry.",
    "tags": ["food"], "meta": { "dialect": "mx-rgv" }, "audio": "00-tengo-hambre.mp3" },
  { "type": "vocab", "front": "el mandado", "back": "the grocery run / errand",
    "context": "Voy a hacer el mandado." }
]
```

Card field semantics (front/back/context/tags/meta) + the i+1 rule are in [02-authoring-cards-and-scenarios.md](02-authoring-cards-and-scenarios.md). Scenario file format is there too.

## Install

```bash
bun run src/cli.ts topic add packs/spanish-mx-rgv          # local dir
bun run src/cli.ts topic add ./my-pack --no-activate        # install without switching active
bun run src/cli.ts topic add packs/spanish-mx-rgv --force    # overwrite (wipes + replaces)
```

Remote sources (resolved to a temp dir, then installed):

```bash
topic add github:you/spanish-pack#v1        # github (optional #ref)
topic add github:you/monorepo/packs/es      # subdir within a repo
topic add git+https://host/me/pack.git      # any git url
topic add npm:@you/spanish-pack@1.2.0       # npm package
topic add ./spanish.tgz                      # tarball (npm-pack or `tar -czf`)
```

Install is collision-safe: re-installing an existing id **errors unless `--force`**. Engine-range mismatch errors before any write.

## Build a pack from a live instance

To project an existing `data/topics/<id>/` into a pack: read each `cards/<uuid>/item.md` frontmatter → `cards.json` entries; copy each `native.mp3` → `assets/` and set `audio`; copy `topic.json` fields into `manifest.json` (add `schemaVersion` + `engine`); copy `scenarios/*.md` verbatim. (This is how `packs/spanish-mx-rgv/` was generated.)

## Publish

A pack is just files — publish however you distribute data:
- **git:** push `packs/<id>/` (or a repo whose root *is* the pack); consumers `topic add github:you/repo`.
- **npm:** add a `package.json` so `manifest.json` etc. sit at the package root; consumers `topic add npm:<name>`.
- **tarball:** `tar -czf pack.tgz -C packs <id>`; consumers `topic add pack.tgz`.

Set `engine` to the lowest core version your pack works with. Keep `assets/` in the pack for offline, key-free installs (the recommended default), or omit audio and let voice topics synthesize at runtime.

## Validate before shipping

```ts
import { loadPack, parsePackManifest } from "recallit";
const pack = await loadPack("packs/my-pack");   // throws on a bad manifest/cards.json
// pack.manifest, pack.cards, pack.scenarios, pack.assets
```

`loadPack` runs the same validation the installer does, so a green `loadPack` means `topic add` will accept it.
