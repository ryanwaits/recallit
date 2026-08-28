// T9: the turn state machine enforces "respond before reveal" and code-owned rating.
import { describe, expect, test } from "bun:test";
import { newCard } from "../src/card.ts";
import { registerGrader } from "../src/graders/registry.ts";
import { TurnError, TurnTracker } from "../src/turn.ts";
import type { EvalResult } from "../src/types.ts";

const card = () => newCard({ front: "casa", back: "house" });

// The lexical grader (default, used throughout this file) never holds — narrow away
// the HoldResult branch so tests can assert on .rating without the type escaping.
function expectRated(result: EvalResult | { hold: true; reason: string }): EvalResult {
  if ("hold" in result) throw new Error(`unexpected hold: ${result.reason}`);
  return result;
}

describe("TurnTracker", () => {
  test("reveal is refused before a response is recorded", () => {
    const tt = new TurnTracker();
    const c = card();
    tt.present(c);
    expect(() => tt.reveal(c)).toThrow(TurnError);
    expect(() => tt.ratingFor(c.id)).toThrow(TurnError);
  });

  test("reveal is refused before the card is even presented", () => {
    const tt = new TurnTracker();
    expect(() => tt.reveal(card())).toThrow(/was not presented/);
  });

  test("present -> respond -> reveal succeeds and rating is engine-computed", async () => {
    const tt = new TurnTracker();
    const c = card();
    tt.present(c);
    const evalResult = expectRated(await tt.respond(c, "house"));
    expect(evalResult.rating).toBe("Easy"); // deterministic, exact match
    const revealed = tt.reveal(c);
    expect(revealed.back).toBe("house");
    expect(revealed.evaluation.rating).toBe("Easy");
    expect(tt.ratingFor(c.id).rating).toBe("Easy");
  });

  test("a wrong response yields Again, still gated through the same flow", async () => {
    const tt = new TurnTracker();
    const c = card();
    tt.present(c);
    expect(expectRated(await tt.respond(c, "perro")).rating).toBe("Again");
    expect(tt.reveal(c).evaluation.rating).toBe("Again");
  });

  test("a HOLD leaves the turn untouched (still presented, reveal stays refused, retry works)", async () => {
    registerGrader("hold-once", (_card, response) =>
      response === "first try"
        ? { hold: true, reason: "not confident" }
        : { rating: "Good", score: 1, reasons: [] },
    );
    const tt = new TurnTracker();
    const c = newCard({ front: "casa", back: "house", meta: { grader: "hold-once" } });
    tt.present(c);

    const held = await tt.respond(c, "first try");
    expect("hold" in held && held.hold).toBe(true);
    expect(tt.get(c.id)?.phase).toBe("presented"); // untouched — never advanced to "responded"
    expect(() => tt.reveal(c)).toThrow(TurnError); // still refused, correctly

    const retried = expectRated(await tt.respond(c, "second try")); // retry from "presented" is legal
    expect(retried.rating).toBe("Good");
    expect(tt.reveal(c).back).toBe("house");
  });
});
