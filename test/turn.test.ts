// T9: the turn state machine enforces "respond before reveal" and code-owned rating.
import { describe, expect, test } from "bun:test";
import { newCard } from "../src/card.ts";
import { TurnError, TurnTracker } from "../src/turn.ts";

const card = () => newCard({ front: "casa", back: "house" });

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

  test("present -> respond -> reveal succeeds and rating is engine-computed", () => {
    const tt = new TurnTracker();
    const c = card();
    tt.present(c);
    const evalResult = tt.respond(c, "house");
    expect(evalResult.rating).toBe("Easy"); // deterministic, exact match
    const revealed = tt.reveal(c);
    expect(revealed.back).toBe("house");
    expect(revealed.evaluation.rating).toBe("Easy");
    expect(tt.ratingFor(c.id).rating).toBe("Easy");
  });

  test("a wrong response yields Again, still gated through the same flow", () => {
    const tt = new TurnTracker();
    const c = card();
    tt.present(c);
    expect(tt.respond(c, "perro").rating).toBe("Again");
    expect(tt.reveal(c).evaluation.rating).toBe("Again");
  });
});
