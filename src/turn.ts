// Per-session turn state machine. This enforces the load-bearing pedagogical
// invariant the plan review flagged: a card's answer cannot be revealed (or
// graded) until the learner has produced a response. The agent advances turns
// through these methods but cannot skip the response step, and the rating is
// always the engine-computed one — the agent never picks it.
import { gradeResponse } from "./graders/registry.ts";
import type { EvalResult, RecallCard } from "./types.ts";

export type TurnPhase = "presented" | "responded" | "revealed" | "graded";

export interface Turn {
  cardId: string;
  phase: TurnPhase;
  response?: string;
  evaluation?: EvalResult;
}

export class TurnError extends Error {}

export class TurnTracker {
  private readonly turns = new Map<string, Turn>();

  present(card: RecallCard): { front: string; context?: string } {
    this.turns.set(card.id, { cardId: card.id, phase: "presented" });
    return { front: card.front, context: card.context };
  }

  /** Record the learner's response and compute the rating deterministically. */
  respond(card: RecallCard, response: string): EvalResult {
    const turn = this.require(card.id, ["presented", "responded"], "respond");
    // Dispatch by card.meta.grader; absent => lexical = today's evaluateAnswer.
    const evaluation = gradeResponse(card, response);
    turn.response = response;
    turn.evaluation = evaluation;
    turn.phase = "responded";
    return evaluation;
  }

  /** GATED: only allowed once a response has been recorded for this card. */
  reveal(card: RecallCard): { back: string; evaluation: EvalResult } {
    const turn = this.require(card.id, ["responded", "revealed"], "reveal");
    if (!turn.evaluation) throw new TurnError(`cannot reveal: no response for ${card.id}`);
    turn.phase = "revealed";
    return { back: card.back, evaluation: turn.evaluation };
  }

  /** The rating a card must be graded with — always the code-computed one. */
  ratingFor(cardId: string): EvalResult {
    const turn = this.turns.get(cardId);
    if (!turn?.evaluation) throw new TurnError(`cannot grade: no response for ${cardId}`);
    return turn.evaluation;
  }

  markGraded(cardId: string): void {
    const turn = this.turns.get(cardId);
    if (turn) turn.phase = "graded";
  }

  get(cardId: string): Turn | undefined {
    return this.turns.get(cardId);
  }

  private require(cardId: string, allowed: TurnPhase[], action: string): Turn {
    const turn = this.turns.get(cardId);
    if (!turn) throw new TurnError(`cannot ${action}: card ${cardId} was not presented`);
    if (!allowed.includes(turn.phase)) {
      throw new TurnError(
        `cannot ${action}: card ${cardId} is in phase "${turn.phase}" (need ${allowed.join("|")})`,
      );
    }
    return turn;
  }
}
