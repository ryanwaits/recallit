# Design: deployable tutor agents (the source-of-record direction)

> Status: **adopted direction** (2026-06-08). Evolves the earlier "courses & styles" framing into the full vision: a course is no longer the unit — a *deployable tutor agent* is. This doc is the source of record for product shape and supersedes the *packaging* framing of [pack-generation.md](./pack-generation.md) and the "never a SaaS / one-deploy-one-user is law" guardrail in [hosted-product.md](./hosted-product.md) + [simpler-vision.md](./simpler-vision.md). Those stay accurate about the ENGINE.
>
> Honesty rule, unchanged: the **capability truth** table below is what we may market. Most of this doc is `gap-to-build`; the foundation it stands on (an honest, agent-native tutor) is `real-today`.

## One line

**Bring your resources — PDFs, books, audio, a repo, or just describe it — and we build you a grounded, honest tutor *agent* on the Claude Agent SDK. The tutor is agent-native; we render it into the modality and surface you need from a generative UI registry — a standalone study app, a spaced-repetition loop, a voice session, an org's onboarding/compliance flow. The agent is the portable brain; the registry supplies the surfaces it wears.**

## The reframe: the unit is a deployable tutor agent

The deliverable is **not "a course"** (data we generate). It's a **tutor agent**: a configured, knowledge-grounded Claude Agent SDK agent that can be wired into many surfaces and many pedagogies. "A course," "an onboarding flow," "an SRS app," "an embedded widget" are all just **deployment targets** for the same agent.

What makes this credible rather than hand-wavy: the tutor is *already* a Claude Agent SDK agent (`src/agent.ts` — `runSession` composing ~15 in-process MCP tools), and its grades are *already* code-owned and source-grounded. The hard, easy-to-get-wrong foundation exists. What's missing is (a) a **portable artifact** that captures a configured tutor + its knowledge, and (b) a **generative UI registry** that renders that agent-native tutor into any modality/surface. Note: embedding into arbitrary *third-party* products is a stretch and explicitly NOT the near-term goal — the surfaces are ours, composed from a registry; only the agent + its knowledge are portable.

## The layered model

```
  resources / a description
        │  ingest + gate (honest grounding)
        ▼
  ① KNOWLEDGE BASE  ── grounded cards, rubrics, scenarios, corpus-of-record, depth-memory
        │
  ② TUTOR AGENT     ── Claude Agent SDK agent; deterministic primitives; CODE-OWNED grades
        │
  ③ STYLE           ── pedagogy template (regimen + graders + done): recallit | compliance | onboarding  [Sprint 1]
        │
  ④ TUTOR MANIFEST  ── the portable artifact: { knowledge ref, style, modality, agent config, bindings }
        │
  ⑤ RUNTIME         ── runTutor(manifest, io): the headless, agent-native engine, decoupled from any UI
        │
  ⑥ GENERATIVE UI REGISTRY ── surfaces/modalities the agent renders into: study app · SRS · voice · onboarding · compliance
        │
  ⑦ SHAREABLE REGISTRY (later) ── a catalog of tutors + the surfaces they expose
```

Layers ①–③ largely exist (③ shipped in Sprint 1). Layers ④–⑦ are the new build, and ⑤ is closer than it looks: the IO seam already exists (`AnswerProvider`, `converseProvider`, `onEvent`, and the `run` override in `startServer` deps already decouple the agent from the transport — the SPA and the keyless `serve-local` are two different drivers of the *same* session today). The generative UI registry (⑥) is the natural next step: a surface is a **declarative template** the agent selects + parameterizes per (style × modality), not a hand-coded screen per case.

## The honesty invariants (sacred across every layer and every target)

These do not bend no matter where a tutor is deployed:

1. **Grades are code-owned, everywhere.** Every target dispatches through the grader registry; a model never picks a rating. An embedded tutor in someone else's product grades exactly like ours.
2. **Self-improvement is scoped to knowledge + pedagogy, NEVER the grade.** A tutor may fetch new sources, propose cards, or revise a rubric to fix a logged weak spot — all routed through the honesty gate — but it can never rewrite how it's graded. This is the moat, stated as a limit on the agent's own power.
3. **All ingested knowledge passes the honesty gate** (verbatim-substring grounding); what can't be grounded is held, never invented.
4. **Own-your-data / export / no lock-in** — a deployed tutor and its knowledge are exportable; hosting is convenience, not capture.

## Capability truth (where we actually are)

| Pillar | Status | Note |
|---|---|---|
| **Tutor is a Claude Agent SDK agent** | **real-today** | `runSession` composes the primitives; features are prompts. The core of the vision. |
| **Honest, code-owned grading + grounding** | **real-today** | grader registry + honesty gate + FSRS; deployment-blind. Safe to lead with. |
| **Pedagogy as data (style)** | **partial** | Sprint 1 shipped the style seam (recallit live); compliance/onboarding `gap-to-build`. |
| **Ingest anything** | **partial** | PDF/URL/repo/concept real; **audio/video → transcript** unbuilt (STT seam exists, unused); markdown/books partial. |
| **Collab to build/review/manage resources** | **partial** | `pack edit` + `/recallit-pack`; a persistent multi-source workspace is unbuilt. |
| **Tutor manifest (portable artifact)** | **gap-to-build** | No artifact captures agent+knowledge+style+bindings yet. |
| **Headless runtime / stable interface** | **gap-to-build** | The IO seam exists; a named `runTutor` + an external contract do not. |
| **Render into multiple surfaces/modalities (generative UI registry)** | **gap-to-build** | One fixed SPA renders the agent today; no surface registry. The biggest hole. |
| **Scoped self-improvement** | **gap-to-build** | Light today (`mine_card`, `context.md`); a guarded improve-the-knowledge loop is unbuilt. |
| **Hosting / tenancy for others** | **gap-to-build** | onebox scoped in hosted-and-pricing.md, not built. |
| **Registry of ends** | **gap-to-build** | conceptual. |

**Net:** the "build a grounded, honest, agent-native tutor" half ≈ 50–60%; the "deploy it as a portable agent into arbitrary surfaces + self-improve + registry" half ≈ 15%. ~⅓ of the full vision, on the foundation that's hardest to get right.

## The deployment spine (the missing piece, designed)

**Tutor manifest** — a superset of today's `CourseConfig`:
```ts
interface TutorManifest {
  id: string;
  name: string;
  knowledge: string;          // ref to the knowledge base (today: the course/topic dir)
  style: string;              // pedagogy template id (Sprint 1)
  modality: Modality;
  agent: {                    // how the agent runs
    model?: string;
    maxTurns?: number;
    guardrails?: string[];    // prose constraints injected into the system prompt
  };
  surfaces?: string[];        // generative-UI-registry surfaces this tutor exposes (Sprint 3)
}
```

**Runtime** — `runTutor(manifest, io): Promise<RunResult>`: the headless, agent-native engine. `io` is the existing IO seam made first-class — `{ present, await, converse, onEvent, tts?, stt? }` — so ANY surface (our SPA, a CLI, a generated surface) drives the same session. This is mostly *naming and extracting* what `agent.ts` + `server.ts` deps already do, not new agent logic.

**Generative UI registry** — a registry of **surfaces**: declarative UI templates the agent selects + parameterizes per (style × modality), rendered by us. "Deploying a modality/surface" = picking/generating one from the registry, not wiring into a foreign app. Seed surfaces:
- **Study app** (our SPA, refactored to render from the registry as one surface).
- **SRS / comprehension loop** (the recallit style's surface).
- **Voice session** (push-to-talk / hands-free over the same runtime).
- **Onboarding modules** (read → check, the onboarding style's surface).
- **Compliance assessment** (the compliance style + a code-graded assessment surface).
- Later (riskier, optional): fuller **model-generated** surfaces — held to the same code-owned-grade invariant.

## Packaging & deployment model (resolved 2026-06-08)

**The portable unit is a tutor BUNDLE — `manifest + knowledge` — run by our engine. We never hand over the Agent SDK code.** The Claude Agent SDK is the *engine's* internals (`agent.ts`: tools, loop, graders); the deliverable is data. This is deliberate: **keeping the engine ours is what keeps grades honest after deployment** — a handed-over SDK bundle could have its code-owned grader stripped. So "engine stays ours, tutor travels as data" is the moat *and* the honesty guarantee. (The bundle still exports freely → no lock-in.)

```
my-tutor/
  manifest.json   # course + style + agent config + modality + surfaces
  knowledge/      # cards, rubrics, scenarios, audio, corpus-of-record
# → run by the recallit engine, rendered into a surface, packaged for a target:
recallit deploy my-tutor --target pwa --surface voice
```

The tutor bundle is **today's pack/export, evolved** — the "keep export as the portable artifact" decision and this converge.

- **An "end" = surface × deployment target × modality.** PWA language app, desktop cert course, org onboarding/compliance are the same bundle deployed to different ends. The eventual registry of ends = a catalog of target packagers.
- **Engine location = both, per target.** PWA/desktop ends may **embed a local engine** (offline, BYO-key); org/hosted ends use a **central engine** we run. The surface is a thin shell over whichever engine.
- **Secondary channel (dev-only):** a tutor *may also* be emitted as an MCP/skill for consumers who run their own Agent SDK harness — a bonus distribution, never the packaging model (it can't serve non-technical PWA/course/onboarding consumers).

## What this is NOT

- **Not a model that grades itself or improves its own grading.** Self-improvement touches knowledge + pedagogy only (invariant #2). A tutor that could edit its grade is the one thing we will never ship.
- **Not "embed into arbitrary third-party products."** That's a stretch and explicitly out of near-term scope (CORS/auth/tenancy surface). The surfaces are OURS, composed from a generative UI registry; only the agent + its knowledge are portable. Pick 2–3 first-class surfaces; the registry generalizes later.
- **Not fully model-improvised UI (yet).** Surfaces are declarative templates the agent selects + parameterizes; free model-generated UI is a later, riskier option held to the same honesty invariants.
- **Not Honen.** We don't chase output-format breadth; the tutor's honesty + retention + agent-native renderability is the product.
- **Not a lock-in cloud.** A deployed tutor + its knowledge are exportable; an org can walk away with its tutor.
- **Not an engine rewrite.** The spine is extraction + adapters over `agent.ts`; if a target needs to mutate `turn.ts` or the grader path, it's mis-scoped.
- **Not marketed ahead of the code.** Manifest, runtime, targets, self-improvement, hosting are all `gap-to-build` — "coming" until they ship.

## The style layer (Sprint 1, still valid — one field of the manifest)

A **style** is the pedagogy template = `{ regimen(modality), allowsRegimenOverride, done, authorPrompt?, contentKinds?, graders? }`, dispatched via `src/styles/registry.ts` exactly like the grader registry; unknown style **fails closed**. `manifest.style` selects it. Seed styles: **recallit** (cards+FSRS, done=retention — shipped), **compliance** (modules+reading+gated assessment, done=code-graded pass — `gap-to-build`), **onboarding** (applied scenarios — `gap-to-build`). **Assessment-score invariant:** a `{kind:"assessment"}` done-criterion reads its score from code-owned graded records (`review_log`), never from the agent's `complete_session` summary.

Resolved refinements (2026-06-08, plan review): `regimen` is a modality-aware function; `--regimen` overrides rejected on non-recallit styles; assessment distractors forced to human review by default; on-disk migration = one-time migrator + read-both; the `/api/packs`/`?topicId=` wire contract kept legacy behind course-renamed types.

## Open questions

1. **First-class surfaces** — which 2–3 ship first from the registry? (Recommend: the existing study-app + a voice surface, because both already have runtime support and prove "one tutor, multiple surfaces"; onboarding/compliance third, paired with their styles.)
2. **How "generative" is the registry** — declarative surface templates the agent selects + parameterizes (safe, predictable, recommended for v1), vs model-generated UI specs (powerful, riskier). Where's the line, and how does a surface stay honest (the grade is always code-owned regardless of UI)?
3. **Self-improvement scope** — which knowledge/pedagogy edits may a tutor make autonomously (propose-only vs auto-apply-through-gate), and where's the human checkpoint? Never the grade.
4. **Manifest vs CourseConfig** — extend `CourseConfig` in place, or a new `TutorManifest` that wraps it? (Affects how invasive the rename is.)
5. **Business model for hosting** — BYO-key default (COGS≈0) vs managed-key metered/flat. Decide before the hosting/tenancy sprint.

[the Honen brief's tension note]: ./honen-crossref.md
