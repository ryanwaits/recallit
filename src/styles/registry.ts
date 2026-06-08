// Pluggable-but-deterministic STYLE registry — the seam that lets a course's
// PEDAGOGY generalize (spaced-retention, compliance, onboarding, …) without ever
// adding a bespoke engine code path. A style is DATA: which phases a session runs,
// whether a learner may override the regimen, and what "done" means. Dispatch is
// keyed by course.style, defaulting to "recallit", so a course WITHOUT a style
// behaves exactly as it did before this seam existed (today's retention path).
//
// This mirrors graders/registry.ts: capability is added as prose + config, never
// by letting a model decide anything load-bearing. Unknown style names FAIL CLOSED
// (throw) — the engine never "improvises a course". New styles register here; see
// docs/design/courses-and-styles.md.
import type { Modality } from "../types.ts";

/** Definition of "done" for a course — always code-evaluated, never self-report.
 *  retention: an item is durable at FSRS stability >= `stability` days.
 *  assessment: the code-graded assessment score is >= `pass` (read from review_log).
 *  scenarios: every applied scenario has been completed. */
export type DoneCriterion =
  | { kind: "retention"; stability: number }
  | { kind: "assessment"; pass: number }
  | { kind: "scenarios"; all: true };

export interface StyleDefinition {
  id: string;
  name: string;
  /** Session phases for this style, by modality (recallit = today's dailyPhases). */
  regimen: (modality: Modality) => string[];
  /** Whether the learner-pickable --regimen (drill/converse/full) applies. Only the
   *  recallit style honors it — overriding phases must never let a learner skip a
   *  graded assessment in a compliance/onboarding course. */
  allowsRegimenOverride: boolean;
  /** Definition of complete, code-evaluated. */
  done: DoneCriterion;
  // ── Generation (Sprint 2; optional so the inert recallit style needs none) ──
  /** How gated material becomes content — a prompt template, not code. */
  authorPrompt?: string;
  /** Content kinds this style emits: "card" | "module" | "scenario" | "assessment". */
  contentKinds?: string[];
  /** Which code-owned grader gates which phase. The rating is never model-owned. */
  graders?: { phase: string; grader: string }[];
}

/** The recallit style = today's spaced-retention behavior, verbatim. The phase
 *  arrays here are the canonical source for context.dailyPhases (which delegates
 *  to this), so there is one definition, not two. */
const recallit: StyleDefinition = {
  id: "recallit",
  name: "Spaced retention",
  regimen: (modality) =>
    modality === "text"
      ? ["review", "socratic", "reflect"]
      : ["shadowing", "review", "roleplay", "reflect"],
  allowsRegimenOverride: true,
  done: { kind: "retention", stability: 21 },
};

export const DEFAULT_STYLE = "recallit";

const REGISTRY: Record<string, StyleDefinition> = { recallit };

/** The style a course uses; absent course.style => the recallit default. */
export function styleName(course: { style?: string }): string {
  return course.style ?? DEFAULT_STYLE;
}

/** Resolve a style by name. Throws on an unknown name (fail closed). */
export function getStyle(name: string): StyleDefinition {
  const style = REGISTRY[name];
  if (!style) {
    throw new Error(`unknown style "${name}" (registered: ${Object.keys(REGISTRY).join(", ")})`);
  }
  return style;
}

/** Register a style. Used by later styles (compliance/onboarding) + tests. */
export function registerStyle(name: string, def: StyleDefinition): void {
  REGISTRY[name] = def;
}
