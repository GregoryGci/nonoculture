import { describe, expect, it } from "vitest";
import { createRoom, transition } from "./state-machine.js";
import type { DeckItem, GameState, InternalQuestion } from "./types.js";

const T0 = 1_000_000;

function question(overrides: Partial<InternalQuestion> = {}): InternalQuestion {
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
    ...overrides,
  };
}

function room(players: string[], deck: DeckItem[]): GameState {
  let state = createRoom("1234", T0);
  players.forEach((id, i) => {
    state = transition(state, {
      kind: "PLAYER_JOIN",
      playerId: id,
      playerToken: `tok-${id}`,
      roomCode: "1234",
      now: T0 + i,
    }).state;
  });
  return transition(state, { kind: "START_GAME", playerId: players[0]!, now: T0 + 100, deck }).state;
}

describe("bluff round", () => {
  const deck: DeckItem[] = [{ kind: "bluff", question: question() }];

  function afterFakes(): GameState {
    let state = room(["a", "b", "c"], deck);
    expect(state.phase).toBe("BLUFF_WRITE");
    for (const [id, text] of [
      ["a", "Lyon"],
      ["b", "Marseille"],
      ["c", "Bordeaux"],
    ] as const) {
      state = transition(state, { kind: "SUBMIT_BLUFF", playerId: id, text, now: T0 + 200 }).state;
    }
    return state;
  }

  it("moves to the vote once everyone has lied, hiding the real answer among the fakes", () => {
    const state = afterFakes();
    expect(state.phase).toBe("BLUFF_VOTE");
    expect(state.bluff?.options).toHaveLength(4);
    expect(state.bluff?.options.filter((o) => o.authorId === null)).toHaveLength(1);
    expect(state.bluff?.options.map((o) => o.text)).toContain("Paris");
  });

  it("drops a fake that happens to be the real answer instead of showing it twice", () => {
    let state = room(["a", "b", "c"], deck);
    state = transition(state, { kind: "SUBMIT_BLUFF", playerId: "a", text: "paris", now: T0 + 200 }).state;
    state = transition(state, { kind: "SUBMIT_BLUFF", playerId: "b", text: "Lyon", now: T0 + 201 }).state;
    state = transition(state, { kind: "SUBMIT_BLUFF", playerId: "c", text: "Nice", now: T0 + 202 }).state;
    const texts = state.bluff!.options.map((o) => o.text.toLowerCase());
    expect(texts.filter((t) => t === "paris")).toHaveLength(1);
  });

  it("scores the spotter, and the author of every fake that caught someone", () => {
    let state = afterFakes();
    const real = state.bluff!.options.find((o) => o.authorId === null)!;
    const lieByA = state.bluff!.options.find((o) => o.authorId === "a")!;

    state = transition(state, { kind: "SUBMIT_BLUFF_VOTE", playerId: "a", optionId: real.id, now: T0 + 300 }).state;
    state = transition(state, { kind: "SUBMIT_BLUFF_VOTE", playerId: "b", optionId: lieByA.id, now: T0 + 301 }).state;
    state = transition(state, { kind: "SUBMIT_BLUFF_VOTE", playerId: "c", optionId: lieByA.id, now: T0 + 302 }).state;

    expect(state.phase).toBe("BLUFF_REVEAL");
    expect(state.players.a?.score).toBe(2 + 1 + 1); // found it, and fooled two
    expect(state.players.b?.score).toBe(0);
    expect(state.players.c?.score).toBe(0);
  });

  it("refuses a vote for your own lie", () => {
    const state = afterFakes();
    const own = state.bluff!.options.find((o) => o.authorId === "a")!;
    const after = transition(state, { kind: "SUBMIT_BLUFF_VOTE", playerId: "a", optionId: own.id, now: T0 + 300 });
    expect(after.state.bluff?.votes.a).toBeUndefined();
  });
});

describe("duel round", () => {
  const listQuestion = question({
    answerKind: "list",
    prompt: "Citez des films de X",
    answer: "Alien",
    aliases: ["Blade Runner", "Gladiator", "Le Gladiateur"],
  });
  const deck: DeckItem[] = [{ kind: "duel", question: listQuestion }];

  function spectatorOf(state: GameState): string {
    return Object.keys(state.players).find((id) => !state.duel!.contestants.includes(id))!;
  }

  it("picks two contestants and waits on the spectators", () => {
    const state = room(["a", "b", "c"], deck);
    expect(state.phase).toBe("DUEL_PREDICT");
    expect(state.duel?.contestants).toHaveLength(2);
    expect(["a", "b", "c"].filter((id) => !state.duel!.contestants.includes(id))).toHaveLength(1);
  });

  it("counts each valid item once, however many times it is typed", () => {
    let state = room(["a", "b", "c"], deck);
    const x = state.duel!.contestants[0];
    state = transition(state, {
      kind: "SUBMIT_DUEL_PREDICTION",
      playerId: spectatorOf(state),
      targetId: x,
      now: T0 + 200,
    }).state;
    expect(state.phase).toBe("DUEL_ANSWER");

    for (const text of ["Alien", "alien", "Blade Runner", "quelque chose de faux"]) {
      state = transition(state, { kind: "SUBMIT_DUEL_ANSWER", playerId: x, text, now: T0 + 300 }).state;
    }
    expect(state.duel?.found[x]).toHaveLength(2);
    expect(state.duel?.attempts[x]).toHaveLength(4);
  });

  it("awards the winner and the spectators who called it", () => {
    let state = room(["a", "b", "c"], deck);
    const [x, y] = state.duel!.contestants;
    const spectator = spectatorOf(state);
    state = transition(state, {
      kind: "SUBMIT_DUEL_PREDICTION",
      playerId: spectator,
      targetId: x,
      now: T0 + 200,
    }).state;
    state = transition(state, { kind: "SUBMIT_DUEL_ANSWER", playerId: x, text: "Alien", now: T0 + 300 }).state;
    state = transition(state, { kind: "SUBMIT_DUEL_ANSWER", playerId: x, text: "Gladiator", now: T0 + 301 }).state;
    state = transition(state, { kind: "ALARM_FIRED", now: state.phaseDeadlineTs! }).state;

    expect(state.phase).toBe("DUEL_REVEAL");
    expect(state.players[x]?.score).toBe(3);
    expect(state.players[y]?.score).toBe(0);
    expect(state.players[spectator]?.score).toBe(1);
  });

  it("keeps a contestant from betting on themselves", () => {
    const state = room(["a", "b", "c"], deck);
    const x = state.duel!.contestants[0];
    const after = transition(state, { kind: "SUBMIT_DUEL_PREDICTION", playerId: x, targetId: x, now: T0 + 200 });
    expect(after.state.duel?.predictions[x]).toBeUndefined();
  });
});

describe("closest-wins questions", () => {
  const numeric = question({ answerKind: "number", prompt: "En quelle année ?", answer: "1969" });
  const deck: DeckItem[] = [{ kind: "trivia", question: numeric }];

  it("scores the closest answer and keeps it out of the host review", () => {
    let state = room(["a", "b", "c"], deck);
    state = transition(state, {
      kind: "SUBMIT_ANSWER",
      playerId: "a",
      questionId: 1,
      raw: "1970",
      now: T0 + 200,
    }).state;
    state = transition(state, {
      kind: "SUBMIT_ANSWER",
      playerId: "b",
      questionId: 1,
      raw: "1985",
      now: T0 + 201,
    }).state;
    state = transition(state, {
      kind: "SUBMIT_ANSWER",
      playerId: "c",
      questionId: 1,
      raw: "1969",
      now: T0 + 202,
    }).state;

    expect(state.phase).toBe("HOST_REVIEW");
    expect(state.players.c?.score).toBe(3); // exact
    expect(state.players.a?.score).toBe(0);
    expect(state.players.b?.score).toBe(0);
    // Nothing for the host to grade: this one is arithmetic, not judgement.
    expect(state.answerLog).toEqual({});
  });

  it("rewards everyone equally close rather than splitting the points", () => {
    let state = room(["a", "b"], deck);
    state = transition(state, {
      kind: "SUBMIT_ANSWER",
      playerId: "a",
      questionId: 1,
      raw: "1968",
      now: T0 + 200,
    }).state;
    state = transition(state, {
      kind: "SUBMIT_ANSWER",
      playerId: "b",
      questionId: 1,
      raw: "1970",
      now: T0 + 201,
    }).state;
    expect(state.players.a?.score).toBe(2);
    expect(state.players.b?.score).toBe(2);
  });

  it("ignores an answer with no number in it", () => {
    let state = room(["a", "b"], deck);
    state = transition(state, {
      kind: "SUBMIT_ANSWER",
      playerId: "a",
      questionId: 1,
      raw: "aucune idee",
      now: T0 + 200,
    }).state;
    state = transition(state, {
      kind: "SUBMIT_ANSWER",
      playerId: "b",
      questionId: 1,
      raw: "vers 1971",
      now: T0 + 201,
    }).state;
    expect(state.players.a?.score).toBe(0);
    expect(state.players.b?.score).toBe(2);
  });
});
