# recallit docs

**recallit** is an agent-native, topic-agnostic spaced-repetition recall engine — now with a source-grounded comprehension *tutor*. Drop a source, get an honest pack (every card cites a line you can check), practice it forever. Code owns the grade; the model never picks a rating.

Start here, then go as deep as you need:

| Doc | What it's for |
|---|---|
| [usage.md](./usage.md) | **Get started** — copy-paste cookbook: install via `bunx`, generate/install packs, study (text + voice), the daily comprehension tutor, share/export, the full flag + env reference with honest costs. |
| [product.md](./product.md) | **What it is** — product & UX overview: every surface (CLI / SPA / voice / export / PWA), the end-to-end journeys, and a capability × surface × limit matrix. |
| [internals.md](./internals.md) | **How it really works** (canonical) — the checkable-item model, the grader registry, `mapCoverageToRating`, the examiner produce→re-verify→recount→HOLD contract, and the FSRS + turn-machine seams it rides unchanged. |
| [dx.md](./dx.md) | **Build on it** — maintainer guide: setup, scripts, the engine map, how to add a grader / voice provider / route, the sacred invariants not to touch, and the test/check/release loop. |
| [positioning.md](./positioning.md) | **Why / the pitch** — the honesty-plus-retention wedge, the say / never-say claim rules, shippable-now vs gated, and how to keep simplifying the message. |
| [troubleshooting.md](./troubleshooting.md) | **When it breaks** — the common failure modes (examiner HOLD, no-corpus, unknown-grader, force-reinstall resets FSRS) in one table. |

## Design rationale (the *why* behind big decisions)
- [design/pack-generation.md](./design/pack-generation.md) — pack format, the author loop, the honesty gate, modes A/B/C.
- [design/tutor-multimodal.md](./design/tutor-multimodal.md) — the checkable-item generalization, the examiner contract, and the validation methodology behind the numbers.
- [design/hosted-product.md](./design/hosted-product.md) — roadmap toward a hosted / multi-touchpoint direction.
- [design/mobile-surfaces.md](./design/mobile-surfaces.md) — the honest PWA plan (offline study deck today; full tutor gated on a deploy + keys; the structural iOS limits).

## Task walkthroughs
The numbered [guides/](./guides/README.md) (01–08) are copy-pasteable, use-case-first walkthroughs: stand up the voice Spanish instance, author cards/scenarios, operate the agent, create/use/voice/recipe packs.

> Honesty note: where the deeper docs cite validation numbers (e.g. examiner replay/fabrication), they're from a **small, single-author fixture** and **not yet proven at scale / in production**. Treat them as "the approach holds on what we measured," not "battle-tested." See internals.md §validation.
