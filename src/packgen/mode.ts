// The ONE place surfaces differ. resolveMode maps a surface default + a signal
// (CLI flags or a skill utterance) to an interaction mode. Everything after this
// flows through the same loop -> write_pack verdict -> install seam, so A/B/C are
// modes of one engine, not three implementations. Pure + exhaustively unit-tested.

export type Mode = "A" | "B" | "C";

export interface ModeSignal {
  /** CLI flags. */
  flags?: { auto?: boolean; review?: boolean };
  /** Skill / natural-language entry. */
  utterance?: string;
}

export interface ModeResolution {
  mode: Mode;
  rationale: string;
}

const SKIP_PREVIEW = /\b(just do it|no preview|don'?t ask|auto[- ]?install|skip preview)\b/i;
// A "bare source" = a single whitespace-free token that looks like a path / URL / spec.
// Checked only after we've confirmed there's no whitespace, so a prefix or a known
// file extension is enough to recognize the whole token.
const SOURCE_PREFIX = /^(\.{0,2}\/|~\/|[A-Za-z]:\\|https?:\/\/|github:|git[+@]|npm:)/i;
const SOURCE_EXT = /\.(pdf|md|markdown|txt|html?|json)$/i;
const isBareSource = (u: string): boolean => SOURCE_PREFIX.test(u) || SOURCE_EXT.test(u);

/**
 * - explicit flags win (`--auto` -> A, `--review` -> B);
 * - an utterance asking to skip preview -> A;
 * - a bare source token -> the surface default (no prose to infer from);
 * - any other prose -> C (ambient: infer intent from the words);
 * - nothing -> the surface default.
 */
export function resolveMode(surfaceDefault: Mode, signal: ModeSignal = {}): ModeResolution {
  const { flags, utterance } = signal;
  if (flags?.auto) return { mode: "A", rationale: "--auto flag" };
  if (flags?.review) return { mode: "B", rationale: "--review flag" };

  if (utterance != null) {
    const u = utterance.trim();
    if (SKIP_PREVIEW.test(u))
      return { mode: "A", rationale: "utterance asked to skip the preview" };
    if (u.length > 0 && !/\s/.test(u) && isBareSource(u)) {
      return { mode: surfaceDefault, rationale: "bare source token; surface default" };
    }
    return { mode: "C", rationale: "natural-language intent; infer from the prose" };
  }

  return { mode: surfaceDefault, rationale: "surface default" };
}
