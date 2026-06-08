// Sprint 1: prove the style registry seam is INERT. The "recallit" style must
// reproduce today's behavior exactly — its regimen equals dailyPhases for every
// modality, the learner regimen override stays allowed, and "done" is retention.
// An unknown style name must FAIL CLOSED (never silently improvise a course).
import { describe, expect, test } from "bun:test";
import { coursePhases, dailyPhases, resolveDailyPhases } from "../src/context.ts";
import { DEFAULT_STYLE, getStyle, registerStyle, styleName } from "../src/styles/registry.ts";
import type { Modality, TopicConfig } from "../src/types.ts";

const MODALITIES: Modality[] = ["text", "voice", "both"];

describe("style registry (Sprint 1 — inert seam)", () => {
  test("recallit style regimen is identical to today's dailyPhases", () => {
    const recallit = getStyle("recallit");
    for (const m of MODALITIES) {
      expect(recallit.regimen(m)).toEqual(dailyPhases(m));
    }
  });

  test("recallit is the default, allows the regimen override, completes on retention", () => {
    expect(DEFAULT_STYLE).toBe("recallit");
    expect(styleName({})).toBe("recallit");
    expect(styleName({ style: "recallit" })).toBe("recallit");
    const recallit = getStyle("recallit");
    expect(recallit.allowsRegimenOverride).toBe(true);
    expect(recallit.done).toEqual({ kind: "retention", stability: 21 });
  });

  test("unknown style name fails closed", () => {
    expect(() => getStyle("nope")).toThrow(/unknown style "nope"/);
  });

  test("registerStyle adds a style resolvable by name", () => {
    registerStyle("test-only", {
      id: "test-only",
      name: "Test",
      regimen: () => ["review", "reflect"],
      allowsRegimenOverride: false,
      done: { kind: "scenarios", all: true },
    });
    expect(getStyle("test-only").id).toBe("test-only");
  });
});

describe("regimen override validation (resolveDailyPhases)", () => {
  const topic = (style?: string): TopicConfig => ({
    id: "t",
    name: "T",
    modality: "text",
    style,
    meta: {},
  });

  test("recallit honors drill/converse and falls back to its own regimen", () => {
    expect(resolveDailyPhases(topic("recallit"), "drill")).toEqual(["review", "reflect"]);
    expect(resolveDailyPhases(topic(), "full")).toEqual(dailyPhases("text"));
    expect(resolveDailyPhases(topic())).toEqual(dailyPhases("text"));
  });

  test("a style that disallows overrides rejects a --regimen override", () => {
    registerStyle("strict", {
      id: "strict",
      name: "Strict",
      regimen: () => ["read", "assess"],
      allowsRegimenOverride: false,
      done: { kind: "assessment", pass: 0.8 },
    });
    expect(resolveDailyPhases(topic("strict"))).toEqual(["read", "assess"]);
    expect(() => resolveDailyPhases(topic("strict"), "drill")).toThrow(/does not allow/);
    // "full"/absent means "the style's own phases", not an override — always fine.
    expect(resolveDailyPhases(topic("strict"), "full")).toEqual(["read", "assess"]);
  });

  test("coursePhases is null-tolerant for display", () => {
    expect(coursePhases(null)).toEqual(dailyPhases("text"));
  });
});
