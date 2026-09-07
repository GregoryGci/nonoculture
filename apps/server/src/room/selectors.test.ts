import { describe, expect, it } from "vitest";
import { buildStateSync } from "./selectors.js";
import { createRoom, transition } from "./state-machine.js";
import type { DeckItem, GameState, InternalQuestion } from "./types.js";

const T0 = 1_000_000;

function question(): InternalQuestion {
  return {
    id: 1,
    theme: "geo",
    family: null,
    answerKind: "text",
    difficulty: 1,
    type: "text",
    prompt: "Capitale de la France ?",
    mediaKey: null,
    answer: "Paris",
    aliases: [],
    explanation: null,
  };
}

function join(state: GameState, playerId: string, now: number) {
  return transition(state, { kind: "PLAYER_JOIN", playerId, playerToken: `tok-${playerId}`, roomCode: "1234", now })
    .state;
}

/** Plays a one-question game to completion so the room sits in HOST_REVIEW. */
function roomInReview(): GameState {
  let state = createRoom("1234", T0);
  state = join(state, "host", T0);
  state = join(state, "p2", T0 + 1);
  const deck: DeckItem[] = [{ kind: "trivia", question: question() }];
  state = transition(state, { kind: "START_GAME", playerId: "host", now: T0 + 100, deck }).state;
  state = transition(state, {
    kind: "SUBMIT_ANSWER",
    playerId: "host",
    questionId: 1,
    raw: "Paris",
    now: T0 + 200,
  }).state;
  state = transition(state, {
    kind: "SUBMIT_ANSWER",
    playerId: "p2",
    questionId: 1,
    raw: "Lyon",
    now: T0 + 201,
  }).state;
  return state;
}

describe("buildStateSync during HOST_REVIEW", () => {
  it("sends the grading list to the host", () => {
    const state = roomInReview();
    expect(state.phase).toBe("HOST_REVIEW");
    const sync = buildStateSync(state, "host");
    expect(sync.reviewQuestions).toHaveLength(1);
    expect(sync.reviewQuestions?.[0]?.answers).toHaveLength(2);
  });

  it("withholds it from every other player", () => {
    // They wait on the podium instead, so shipping them every answer would only expose it
    // in the network inspector for a screen that never renders it.
    const state = roomInReview();
    expect(buildStateSync(state, "p2").reviewQuestions).toBeNull();
  });

  it("withholds it from observers on the host screen", () => {
    expect(buildStateSync(roomInReview(), "").reviewQuestions).toBeNull();
  });

  it("still reports every player's score, so the waiting room can rank live", () => {
    const state = roomInReview();
    const sync = buildStateSync(state, "p2");
    expect(sync.players.map((p) => p.playerId).sort()).toEqual(["host", "p2"]);
  });
});
