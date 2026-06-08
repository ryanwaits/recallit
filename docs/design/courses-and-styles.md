# Design: courses & styles (the source-of-record direction)

> Status: **adopted direction** (2026-06-08), from a Honen cross-reference + a direction conversation with the maintainer. This doc is now the source of record for product shape and supersedes the *distribution* framing of packs in [pack-generation.md](./pack-generation.md) and the "never a SaaS / one-deploy-one-user is law" guardrail in [hosted-product.md](./hosted-product.md) and [simpler-vision.md](./simpler-vision.md). Those docs remain accurate about the **engine** (honesty gate, FSRS, graders, converse); only their packaging + deployment stances are overridden here.
>
> Honesty rule, unchanged: the **capability truth** table below is what we may market. Do not ship a claim the code doesn't back. Most of this doc is `gap-to-build`; the engine it stands on is `real-today`.

## One line

**Feed it material, pick a style, and you get a course with a tutor that practices with you and is honest about what you actually know — running on your laptop or hosted for your org, same engine.**

The model collapses to three words: **material → course → study.**

- **material** — the only input. A PDF, a URL, a repo, a recording, or a bare topic. There is no "install a prepackaged deck" anymore.
- **course** — the container (today's `topic`/pack, renamed). Generated *in place* from the material. It is the unit you study, the unit you export.
- **study** — a tutor/agent runs the course in the shape its **style** defines.

A **style** is the generation-time template that decides what gets made, how you practice it, and what "done" means. A course *is* a style applied to material.

## Three decisions (locked 2026-06-08)

1. **Engine-neutral deployment — host OR local.** The engine never knows where it runs; "hosted" is just where the files live (a managed per-user/org volume). Self-host stays for individuals. **Local-first is now a deployment option, not a law.** This overrides the "Not a SaaS" lines in the superseded docs.
2. **Material is the only input; a course is exportable.** Drop install-a-pack-from-`github:`/`npm:`/tarball as an *input* path. Keep `export` — a generated course is a portable artifact an org can hand off. (Output, not input.)
3. **Style is chosen at generation time.** It bakes the course shape; a course is a style applied to material. Not a study-time toggle. (The existing `--regimen` study-time choice survives *inside* a style, but it no longer decides the course's shape.)

## Style as a first-class concept (data, not code)

This mirrors the [grader registry](../../src/graders/registry.ts): a seam that adds capability as **prose + config**, never as a model deciding anything load-bearing. A new pedagogy is a new `StyleDefinition`, not a new code path.

```ts
interface StyleDefinition {
  id: string;            // "recallit" | "compliance" | "onboarding"
  name: string;

  // GENERATE — how gated material becomes content. A prompt template, not code.
  authorPrompt: string;  // shapes cards | modules | scenarios from the corpus of record
  contentKinds: string[]; // "card" | "module" | "scenario" | "assessment"

  // STUDY — the session loop (reuses today's phase regimen machinery).
  regimen(modality): string[]; // modality-aware (today's dailyPhases branches text vs voice); a learner may pick a --regimen within it, validated against these phases

  // GRADE — which code-owned graders, gated to which phases. The rating is
  // NEVER model-owned, in any style. Dispatch stays in the grader registry.
  graders: { phase: string; grader: string }[];

  // DONE — definition of complete, code-evaluated, never self-report.
  done:
    | { kind: "retention"; stability: number }   // FSRS stability threshold
    | { kind: "assessment"; pass: number }        // code-graded quiz score
    | { kind: "scenarios"; all: true };           // applied scenarios completed
}
```

`course.json` (today's `topic.json`) gains one field: `style: string`. The engine dispatches on it exactly as `gradeResponse` dispatches on `card.meta.grader`. Unknown style → **fail closed** (throw), never "the agent improvises a course." **Assessment-score invariant:** a `{kind:"assessment"}` done-criterion reads its score from code-owned graded records (`review_log`), never from the agent's `complete_session` summary.

### The three seed styles

| Style | Generates | Study loop | "Done" = |
|---|---|---|---|
| **recallit** (today's behavior, verbatim) | cards + scenarios | drill / converse, learner's choice | FSRS stability — you've retained it |
| **compliance** | modules + reading + a gated end **assessment** | read → check → assess | pass the **code-graded** quiz + acknowledge |
| **onboarding** | applied scenarios + roleplay | scenario runs | scenarios completed |

The engine stays **topic-agnostic** and now also **shape-agnostic**. Same wedge, one new axis.

## What changes

**Dies**
- `topic add github:/npm:/tarball` as an input path; the external-resolution half of [`resolve.ts`](../../src/resolve.ts) and the install-from-pack flows. The gallery stops being an install-store.
- The "topics-as-packages" *distribution* framing (packs were two things — a distribution unit and a container; we keep the container, drop the distribution unit).
- The `never multi-tenant / one-deploy-one-user is law` guardrail. Replaced by the new guardrail below.

**Renamed / reframed**
- `topic` → **course**; `topic.json` → `course.json` (+ `style` field). `TopicConfig` → `CourseConfig` in [`types.ts`](../../src/types.ts).
- `--regimen drill|converse|full` is absorbed *into* a style's `regimen`; it remains the in-style study-time choice.
- `pack export` survives as **export course** — the portable artifact (decision 2).

**Born**
- A **style registry** (`src/styles/registry.ts`) shaped like the grader registry; the three seed styles as data.
- An **in-browser authoring wizard**: paste material → pick style → generate → study. This is the non-dev path (the maintainer's wife building an **ARE** course) *and* the SaaS path — one surface. The CLI stays for power users.
- An honest **assessment grader** for the compliance style — code-owned, MCQ gated to the assessment phase only (recognition must never feed the FSRS recall grade; see [the Honen brief's tension note]). Completion is never self-report.
- **Hosted deployment**: the data dir relocates to a per-user/org volume; the only genuinely new infra is **auth + volume routing**. The engine is unchanged.

**Untouched — the moat (`real-today`)**
The honesty gate (verbatim-substring), FSRS scheduler, code-owned graders, files-as-truth, and the agent-native primitives all work **identically** hosted or local. The gate gets *more* valuable under the compliance style: "the course physically cannot misquote the policy" is worth real money to an org.

## The new guardrail (rewrite, don't delete)

The thing that was ever sacred was never "local-first." It is:

> **Honest grades + real retention + own-your-data, with export and no lock-in.**

Those four port to hosting cleanly: the org owns its volume, can **export its course** any time, and is never trapped. Local-first becomes the strongest *deployment option* for individuals, not a law that blocks orgs. When reconciling the superseded docs, replace every "Not a SaaS / one-deploy-one-user" line with that promise.

## Capability truth (what we may say)

| Claim | Status | Note |
|---|---|---|
| **Honest, code-owned grading + FSRS** | **real-today** | Unchanged by this direction; the registry + gate are deployment-blind. Safe to lead with, in any style. |
| **Feed material, get a course** | **partial** | `recallit pack "<source>"` authors today; "course" is the rename + the wizard. The bare-concept one-command path still doesn't author end-to-end (see simpler-vision enhancement #1). |
| **Pick a style (recallit / compliance / onboarding)** | **gap-to-build** | The style registry + seed styles do not exist yet. Do not market styles until the registry ships. |
| **In-browser authoring (no CLI)** | **gap-to-build** | The wizard is the non-dev front door; nothing ships it yet. |
| **Hosted for your org** | **gap-to-build** | Engine is deployment-neutral by design, but auth + per-org volumes are unbuilt. "Self-host today; hosted coming," never "hosted now." |
| **Compliance assessment / completion** | **gap-to-build** | Needs the assessment grader + a `done` evaluator. Honesty bar: completion is code-graded, never self-report. |

## What this is NOT

- **Not Honen.** We do not chase output-format breadth (comics/music/games — content theater, zero retention signal). The course's honesty + retention is the product; the style is how it's shaped, not how many activities it has.
- **Not a fake-it LMS.** "Completion" in any style is a code-evaluated `done` criterion (retention threshold / graded assessment / scenarios run), never a self-reported checkbox.
- **Not a lock-in cloud.** Hosting is a convenience; export-your-course + own-your-volume is the promise. If an org can't walk away with its course, we've broken the wedge.
- **Not an engine rewrite.** Style and deployment are seams *over* the existing engine. If a style needs a new grading path or a hosted feature needs to mutate `turn.ts`/the FSRS scheduler, it's mis-scoped.
- **Not marketed ahead of the code.** Styles, the wizard, and hosting are all `gap-to-build`. Keep them "coming" until they ship.

## Migration notes

- Rename is mechanical but wide: `topic` → `course` across `types.ts`, `topic.ts`, `cli.ts`, `server.ts`, paths, docs. Keep `topic`-named on-disk dirs readable for one version (alias), or ship a one-time migrator that renames `~/.recallit/topics/` → `courses/` and rebuilds the SQLite index from files (it's always derivable).
- `resolve.ts`: keep the *local-dir* + *export-artifact-reimport* paths; retire the `github:`/`npm:` *install* resolvers.
- The two superseded docs should be marked superseded at the top and their packaging/deployment sections reconciled to the new guardrail (separate task — do not silently rewrite).

## Open questions

**Resolved (2026-06-08, plan review):**
- *Disk migration* — one-time migrator (`topics/`→`courses/`, rebuild `index.sqlite` from files) + read-both during the transition window.
- *Assessment distractors* — forced human review by default (held, like web-grounded concept packs); the "compliance" claim stays `gap-to-build` until distractors are defensible. Substring grounding proves the correct option is in-corpus; it does NOT prove a distractor is wrong.
- *`--regimen` on non-recallit styles* — rejected (must not skip an assessment); only the recallit style honors drill/converse/full.
- *Wire contract* — `/api/packs` + `?topicId=` kept as a legacy wire contract behind course-renamed types (HTTP/WS rename deferred, low value).
- *`StyleDefinition.regimen`* — a modality-aware function, not a flat array.

**Still open:**
1. **Business model for hosting** — BYO-key default (COGS≈0) vs managed-key metered/flat. In tension with the prior "annual license" call; decide before Sprint 4.
2. **Style extensibility surface** — third-party styles (a style is just data) vs a curated set only, to keep the honesty bar enforceable.

[the Honen brief's tension note]: ./honen-crossref.md
