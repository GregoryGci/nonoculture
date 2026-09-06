import { describe, expect, it } from "vitest";
import { computeNextAlarmTs, createRoom, transition } from "./state-machine.js";
import type { DeckItem, GameState, InternalQuestion } from "./types.js";
import {
  CHAIN_DRAW_DURATION_MS,
  CHAIN_GUESS_DURATION_MS,
  CHAIN_POINTS,
  CHAIN_PROMPT_DURATION_MS,
  CHAIN_REVEAL_PER_ITEM_MS,
  DISCONNECT_GRACE_MS,
} from "./types.js";

const T0 = 1_000_000;

function question(overrides: Partial<InternalQuestion> = {}): InternalQuestion {
  return {
    id: 1,
    theme: "geo",
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

function trivia(...questions: InternalQuestion[]): DeckItem[] {
  return questions.map((q) => ({ kind: "trivia" as const, question: q }));
}

function chainSlot(): DeckItem {
  return { kind: "chain" };
}

function join(state: GameState, playerId: string, now = T0) {
  return transition(state, { kind: "PLAYER_JOIN", playerId, playerToken: `tok-${playerId}`, roomCode: "1234", now })
    .state;
}

function withProfile(state: GameState, playerId: string, nickname: string) {
  return transition(state, { kind: "SET_PROFILE", playerId, nickname, avatar: "🦊" }).state;
}

describe("createRoom", () => {
  it("starts empty in LOBBY", () => {
    const state = createRoom("1234", T0);
    expect(state.phase).toBe("LOBBY");
    expect(Object.keys(state.players)).toHaveLength(0);
  });
});

describe("PLAYER_JOIN", () => {
  it("makes the first joiner the host", () => {
    let state = createRoom("1234", T0);
    state = join(state, "p1");
    expect(state.hostPlayerId).toBe("p1");
    expect(state.players.p1?.isHost).toBe(true);
  });

  it("does not make the second joiner host", () => {
    let state = createRoom("1234", T0);
    state = join(state, "p1");
    state = join(state, "p2");
    expect(state.hostPlayerId).toBe("p1");
    expect(state.players.p2?.isHost).toBe(false);
  });

  it("is idempotent for a returning playerId (marks connected)", () => {
    let state = createRoom("1234", T0);
    state = join(state, "p1");
    state = transition(state, { kind: "PLAYER_DISCONNECT", playerId: "p1", now: T0 + 1 }).state;
    state = join(state, "p1", T0 + 2);
    expect(Object.keys(state.players)).toHaveLength(1);
    expect(state.players.p1?.connected).toBe(true);
  });
});

describe("host migration on disconnect", () => {
  it("passes host to the oldest connected player", () => {
    let state = createRoom("1234", T0);
    state = join(state, "host", T0);
    state = join(state, "p2", T0 + 10);
    state = join(state, "p3", T0 + 20);
    state = transition(state, { kind: "PLAYER_DISCONNECT", playerId: "host", now: T0 + 30 }).state;
    expect(state.hostPlayerId).toBe("p2");
  });

  it("does not restore host rights automatically on reconnect", () => {
    let state = createRoom("1234", T0);
    state = join(state, "host", T0);
    state = join(state, "p2", T0 + 10);
    state = transition(state, { kind: "PLAYER_DISCONNECT", playerId: "host", now: T0 + 20 }).state;
    state = join(state, "host", T0 + 25); // reconnect via a fresh HELLO/PLAYER_JOIN
    expect(state.hostPlayerId).toBe("p2");
    expect(state.players.host?.isHost).toBe(false);
  });

  it("keeps the same host if nobody else is connected", () => {
    let state = createRoom("1234", T0);
    state = join(state, "host", T0);
    state = transition(state, { kind: "PLAYER_DISCONNECT", playerId: "host", now: T0 + 10 }).state;
    expect(state.hostPlayerId).toBe("host");
  });
});

describe("game loop: QUESTION -> QUESTION -> HOST_REVIEW -> FINISHED", () => {
  function setupStarted() {
    let state = createRoom("1234", T0);
    state = join(state, "host", T0);
    state = withProfile(state, "host", "Alice");
    state = join(state, "p2", T0 + 1);
    state = withProfile(state, "p2", "Bob");
    const result = transition(state, {
      kind: "START_GAME",
      playerId: "host",
      now: T0 + 100,
      deck: trivia(question({ id: 1 }), question({ id: 2, answer: "Berlin" })),
    });
    return result.state;
  }

  it("only the host can start the game", () => {
    let state = createRoom("1234", T0);
    state = join(state, "host", T0);
    state = join(state, "p2", T0 + 1);
    const result = transition(state, {
      kind: "START_GAME",
      playerId: "p2",
      now: T0 + 100,
      deck: trivia(question()),
    });
    expect(result.state.phase).toBe("LOBBY");
  });

  it("moves to QUESTION with a server deadline", () => {
    const state = setupStarted();
    expect(state.phase).toBe("QUESTION");
    expect(state.phaseDeadlineTs).toBe(T0 + 100 + state.settings.questionDurationSec * 1000);
  });

  it("advances straight to the next QUESTION as soon as all connected players answer, no wait", () => {
    let state = setupStarted();
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "host", questionId: 1, raw: "Paris", now: T0 + 200 })
      .state;
    expect(state.phase).toBe("QUESTION");
    expect(state.deckIndex).toBe(0);
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "p2", questionId: 1, raw: "paris", now: T0 + 201 })
      .state;
    expect(state.phase).toBe("QUESTION");
    expect(state.deckIndex).toBe(1);
    expect(state.phaseDeadlineTs).toBe(T0 + 201 + state.settings.questionDurationSec * 1000);
    expect(state.answers).toHaveLength(0); // fresh buffer for the new question
  });

  it("archives answers for the review before clearing them", () => {
    let state = setupStarted();
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "host", questionId: 1, raw: "Paris", now: T0 + 200 })
      .state;
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "p2", questionId: 1, raw: "nope", now: T0 + 201 })
      .state;
    expect(state.answerLog[0]).toEqual([
      { playerId: "host", raw: "Paris", submittedAt: T0 + 200 },
      { playerId: "p2", raw: "nope", submittedAt: T0 + 201 },
    ]);
  });

  it("locks a second answer from the same player", () => {
    let state = setupStarted();
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "host", questionId: 1, raw: "Paris", now: T0 + 200 })
      .state;
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "host", questionId: 1, raw: "Lyon", now: T0 + 201 })
      .state;
    expect(state.answers.filter((a) => a.playerId === "host")).toHaveLength(1);
    expect(state.answers[0]?.raw).toBe("Paris");
  });

  it("times out unanswered players via ALARM_FIRED and moves on with whatever was submitted", () => {
    let state = setupStarted();
    const deadline = state.phaseDeadlineTs!;
    state = transition(state, { kind: "ALARM_FIRED", now: deadline }).state;
    expect(state.phase).toBe("QUESTION");
    expect(state.deckIndex).toBe(1);
    expect(state.answerLog[0]).toBeUndefined(); // nobody answered in time, nothing to log or review
  });

  it("does not award any score automatically — scoring is entirely manual, at HOST_REVIEW", () => {
    let state = setupStarted();
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "host", questionId: 1, raw: "Paris", now: T0 + 200 })
      .state;
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "p2", questionId: 1, raw: "Paris", now: T0 + 201 })
      .state;
    expect(state.players.host?.score).toBe(0);
    expect(state.players.p2?.score).toBe(0);
  });

  it("reaches HOST_REVIEW (no timer) after the last question, then FINISHED once the host is done", () => {
    let state = setupStarted();
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "host", questionId: 1, raw: "Paris", now: T0 + 200 })
      .state;
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "p2", questionId: 1, raw: "Paris", now: T0 + 201 })
      .state; // -> QUESTION #2
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "host", questionId: 2, raw: "Berlin", now: T0 + 300 })
      .state;
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "p2", questionId: 2, raw: "Berlin", now: T0 + 301 })
      .state; // -> HOST_REVIEW
    expect(state.phase).toBe("HOST_REVIEW");
    expect(state.phaseDeadlineTs).toBeNull(); // host takes as long as they want

    state = transition(state, { kind: "HOST_NEXT", playerId: "host", now: T0 + 500 }).state;
    expect(state.phase).toBe("FINISHED");
    expect(state.phaseDeadlineTs).toBeNull();
  });

  it("ignores HOST_NEXT (finish review) from a non-host player", () => {
    let state = setupStarted();
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "host", questionId: 1, raw: "Paris", now: T0 + 200 })
      .state;
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "p2", questionId: 1, raw: "Paris", now: T0 + 201 })
      .state;
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "host", questionId: 2, raw: "Berlin", now: T0 + 300 })
      .state;
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "p2", questionId: 2, raw: "Berlin", now: T0 + 301 })
      .state; // -> HOST_REVIEW
    state = transition(state, { kind: "HOST_NEXT", playerId: "p2", now: T0 + 500 }).state;
    expect(state.phase).toBe("HOST_REVIEW");
  });
});

describe("HOST_REVIEW / SUBMIT_HOST_GRADE", () => {
  function setupAtReview() {
    let state = createRoom("1234", T0);
    state = join(state, "host", T0);
    state = withProfile(state, "host", "Alice");
    state = join(state, "p2", T0 + 1);
    state = withProfile(state, "p2", "Bob");
    state = transition(state, {
      kind: "START_GAME",
      playerId: "host",
      now: T0 + 100,
      deck: trivia(question({ id: 1 })),
    }).state;
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "host", questionId: 1, raw: "Paris", now: T0 + 200 })
      .state;
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "p2", questionId: 1, raw: "Pariss", now: T0 + 201 })
      .state; // -> HOST_REVIEW
    return state;
  }

  it("assigns GOOD (1), PRESQUE (0.5) or NUL (0) and updates the score immediately", () => {
    let state = setupAtReview();
    state = transition(state, {
      kind: "SUBMIT_HOST_GRADE",
      playerId: "host",
      deckIndex: 0,
      targetPlayerId: "host",
      grade: 1,
    }).state;
    expect(state.players.host?.score).toBe(1);

    state = transition(state, {
      kind: "SUBMIT_HOST_GRADE",
      playerId: "host",
      deckIndex: 0,
      targetPlayerId: "p2",
      grade: 0.5,
    }).state;
    expect(state.players.p2?.score).toBe(0.5);
    expect(state.grades["0:host"]).toBe(1);
    expect(state.grades["0:p2"]).toBe(0.5);
  });

  it("re-grading the same answer replaces the previous score instead of stacking", () => {
    let state = setupAtReview();
    state = transition(state, {
      kind: "SUBMIT_HOST_GRADE",
      playerId: "host",
      deckIndex: 0,
      targetPlayerId: "host",
      grade: 1,
    }).state;
    state = transition(state, {
      kind: "SUBMIT_HOST_GRADE",
      playerId: "host",
      deckIndex: 0,
      targetPlayerId: "host",
      grade: 0,
    }).state;
    expect(state.players.host?.score).toBe(0);
  });

  it("ignores a grade from a non-host player", () => {
    let state = setupAtReview();
    state = transition(state, {
      kind: "SUBMIT_HOST_GRADE",
      playerId: "p2",
      deckIndex: 0,
      targetPlayerId: "host",
      grade: 1,
    }).state;
    expect(state.players.host?.score).toBe(0);
  });

  it("ignores a grade for a player who never answered that question", () => {
    let state = createRoom("1234", T0);
    state = join(state, "host", T0);
    state = join(state, "p2", T0 + 1);
    state = join(state, "p3", T0 + 2);
    state = transition(state, {
      kind: "START_GAME",
      playerId: "host",
      now: T0 + 100,
      deck: trivia(question({ id: 1 })),
    }).state;
    // Only host and p2 answer; p3 stays connected but never submits, so the alarm timeout advances.
    state = transition(state, { kind: "ALARM_FIRED", now: state.phaseDeadlineTs! }).state;
    state = transition(state, {
      kind: "SUBMIT_HOST_GRADE",
      playerId: "host",
      deckIndex: 0,
      targetPlayerId: "p3",
      grade: 1,
    }).state;
    expect(state.players.p3?.score).toBe(0);
  });

  it("ignores grades outside HOST_REVIEW", () => {
    let state = createRoom("1234", T0);
    state = join(state, "host", T0);
    state = join(state, "p2", T0 + 1);
    state = transition(state, {
      kind: "START_GAME",
      playerId: "host",
      now: T0 + 100,
      deck: trivia(question({ id: 1 }), question({ id: 2 })),
    }).state;
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "host", questionId: 1, raw: "Paris", now: T0 + 200 })
      .state;
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "p2", questionId: 1, raw: "Paris", now: T0 + 201 })
      .state; // -> QUESTION #2, still mid-game
    state = transition(state, {
      kind: "SUBMIT_HOST_GRADE",
      playerId: "host",
      deckIndex: 0,
      targetPlayerId: "host",
      grade: 1,
    }).state;
    expect(state.players.host?.score).toBe(0);
  });
});

describe("disconnect grace period", () => {
  it("keeps a disconnected player and their score for a while, then removes them", () => {
    let state = createRoom("1234", T0);
    state = join(state, "host", T0);
    state = join(state, "p2", T0 + 1);
    state = transition(state, { kind: "PLAYER_DISCONNECT", playerId: "p2", now: T0 + 10 }).state;
    expect(state.players.p2).toBeDefined();
    expect(state.players.p2?.connected).toBe(false);

    state = transition(state, { kind: "ALARM_FIRED", now: T0 + 10 + DISCONNECT_GRACE_MS - 1 }).state;
    expect(state.players.p2).toBeDefined();

    state = transition(state, { kind: "ALARM_FIRED", now: T0 + 10 + DISCONNECT_GRACE_MS + 1 }).state;
    expect(state.players.p2).toBeUndefined();
  });

  it("excludes disconnected players from the all-answered check", () => {
    let state = createRoom("1234", T0);
    state = join(state, "host", T0);
    state = join(state, "p2", T0 + 1);
    state = transition(state, {
      kind: "START_GAME",
      playerId: "host",
      now: T0 + 100,
      deck: trivia(question(), question({ id: 2 })),
    }).state;
    state = transition(state, { kind: "PLAYER_DISCONNECT", playerId: "p2", now: T0 + 150 }).state;
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "host", questionId: 1, raw: "Paris", now: T0 + 200 })
      .state;
    expect(state.phase).toBe("QUESTION");
    expect(state.deckIndex).toBe(1); // advanced past question 1 without waiting on the disconnected p2
  });
});

describe("computeNextAlarmTs", () => {
  it("returns null for a fresh LOBBY with a connected player", () => {
    let state = createRoom("1234", T0);
    state = join(state, "host", T0);
    expect(computeNextAlarmTs(state)).toBeNull();
  });

  it("returns the phase deadline during QUESTION", () => {
    let state = createRoom("1234", T0);
    state = join(state, "host", T0);
    state = transition(state, {
      kind: "START_GAME",
      playerId: "host",
      now: T0 + 100,
      deck: trivia(question()),
    }).state;
    expect(computeNextAlarmTs(state)).toBe(state.phaseDeadlineTs);
  });

  it("returns the disconnect-grace deadline when a player drops mid-game", () => {
    let state = createRoom("1234", T0);
    state = join(state, "host", T0);
    state = join(state, "p2", T0 + 1);
    state = transition(state, {
      kind: "START_GAME",
      playerId: "host",
      now: T0 + 100,
      deck: trivia(question()),
    }).state;
    state = transition(state, { kind: "PLAYER_DISCONNECT", playerId: "p2", now: T0 + 150 }).state;
    const expected = Math.min(state.phaseDeadlineTs!, T0 + 150 + DISCONNECT_GRACE_MS);
    expect(computeNextAlarmTs(state)).toBe(expected);
  });

  it("returns null during HOST_REVIEW", () => {
    let state = createRoom("1234", T0);
    state = join(state, "host", T0);
    state = transition(state, {
      kind: "START_GAME",
      playerId: "host",
      now: T0 + 100,
      deck: trivia(question()),
    }).state;
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "host", questionId: 1, raw: "Paris", now: T0 + 200 })
      .state;
    expect(state.phase).toBe("HOST_REVIEW");
    expect(computeNextAlarmTs(state)).toBeNull();
  });
});

describe("chain round (téléphone dessiné)", () => {
  function setupChainStarted() {
    let state = createRoom("1234", T0);
    state = join(state, "host", T0);
    state = withProfile(state, "host", "Alice");
    state = join(state, "p2", T0 + 1);
    state = withProfile(state, "p2", "Bob");
    state = join(state, "p3", T0 + 2);
    state = withProfile(state, "p3", "Carl");
    return transition(state, { kind: "START_GAME", playerId: "host", now: T0 + 100, deck: [chainSlot()] }).state;
  }

  it("enters CHAIN_PROMPT with all connected players snapshotted in join order", () => {
    const state = setupChainStarted();
    expect(state.phase).toBe("CHAIN_PROMPT");
    expect(state.chain?.order).toEqual(["host", "p2", "p3"]);
    expect(state.phaseDeadlineTs).toBe(T0 + 100 + CHAIN_PROMPT_DURATION_MS);
  });

  it("skips a chain slot entirely when fewer than 3 players are connected", () => {
    let state = createRoom("1234", T0);
    state = join(state, "host", T0);
    state = join(state, "p2", T0 + 1);
    state = transition(state, {
      kind: "START_GAME",
      playerId: "host",
      now: T0 + 100,
      deck: [chainSlot(), ...trivia(question())],
    }).state;
    expect(state.phase).toBe("QUESTION"); // the chain slot was skipped straight through
  });

  it("advances to CHAIN_DRAW once everyone has submitted a prompt, before the timer", () => {
    let state = setupChainStarted();
    state = transition(state, { kind: "SUBMIT_CHAIN_PROMPT", playerId: "host", text: "chat", now: T0 + 110 }).state;
    state = transition(state, { kind: "SUBMIT_CHAIN_PROMPT", playerId: "p2", text: "banane", now: T0 + 111 }).state;
    expect(state.phase).toBe("CHAIN_PROMPT");
    state = transition(state, { kind: "SUBMIT_CHAIN_PROMPT", playerId: "p3", text: "voiture", now: T0 + 112 }).state;
    expect(state.phase).toBe("CHAIN_DRAW");
    expect(state.phaseDeadlineTs).toBe(T0 + 112 + CHAIN_DRAW_DURATION_MS);
  });

  it("locks a second prompt submission from the same player", () => {
    let state = setupChainStarted();
    state = transition(state, { kind: "SUBMIT_CHAIN_PROMPT", playerId: "host", text: "chat", now: T0 + 110 }).state;
    state = transition(state, { kind: "SUBMIT_CHAIN_PROMPT", playerId: "host", text: "chien", now: T0 + 111 }).state;
    expect(state.chain?.prompts.host).toBe("chat");
  });

  it("routes each drawer to the correct origin prompt, and advances to CHAIN_GUESS", () => {
    let state = setupChainStarted();
    state = transition(state, { kind: "SUBMIT_CHAIN_PROMPT", playerId: "host", text: "chat", now: T0 + 110 }).state;
    state = transition(state, { kind: "SUBMIT_CHAIN_PROMPT", playerId: "p2", text: "banane", now: T0 + 111 }).state;
    state = transition(state, { kind: "SUBMIT_CHAIN_PROMPT", playerId: "p3", text: "voiture", now: T0 + 112 }).state; // -> CHAIN_DRAW
    // rotation [host, p2, p3]: p2 draws host's prompt, p3 draws p2's prompt, host draws p3's prompt
    state = transition(state, { kind: "SUBMIT_CHAIN_DRAWING", playerId: "p2", dataUrl: "d-host", now: T0 + 120 }).state;
    state = transition(state, { kind: "SUBMIT_CHAIN_DRAWING", playerId: "p3", dataUrl: "d-p2", now: T0 + 121 }).state;
    expect(state.phase).toBe("CHAIN_DRAW");
    state = transition(state, { kind: "SUBMIT_CHAIN_DRAWING", playerId: "host", dataUrl: "d-p3", now: T0 + 122 }).state;
    expect(state.phase).toBe("CHAIN_GUESS");
    expect(state.chain?.drawings.host).toBe("d-host");
    expect(state.chain?.drawings.p2).toBe("d-p2");
    expect(state.chain?.drawings.p3).toBe("d-p3");
  });

  it("resolves guesses, scores only the matching chain, and moves to CHAIN_REVEAL", () => {
    let state = setupChainStarted();
    state = transition(state, { kind: "SUBMIT_CHAIN_PROMPT", playerId: "host", text: "chat", now: T0 + 110 }).state;
    state = transition(state, { kind: "SUBMIT_CHAIN_PROMPT", playerId: "p2", text: "banane", now: T0 + 111 }).state;
    state = transition(state, { kind: "SUBMIT_CHAIN_PROMPT", playerId: "p3", text: "voiture", now: T0 + 112 }).state;
    state = transition(state, { kind: "SUBMIT_CHAIN_DRAWING", playerId: "p2", dataUrl: "d-host", now: T0 + 120 }).state;
    state = transition(state, { kind: "SUBMIT_CHAIN_DRAWING", playerId: "p3", dataUrl: "d-p2", now: T0 + 121 }).state;
    state = transition(state, { kind: "SUBMIT_CHAIN_DRAWING", playerId: "host", dataUrl: "d-p3", now: T0 + 122 }).state;
    // rotation [host, p2, p3]: host guesses p2's drawing, p2 guesses p3's drawing, p3 guesses host's drawing
    state = transition(state, { kind: "SUBMIT_CHAIN_GUESS", playerId: "p3", text: "chat", now: T0 + 130 }).state; // correct
    state = transition(state, { kind: "SUBMIT_CHAIN_GUESS", playerId: "host", text: "nawak", now: T0 + 131 }).state; // wrong
    expect(state.phase).toBe("CHAIN_GUESS");
    state = transition(state, { kind: "SUBMIT_CHAIN_GUESS", playerId: "p2", text: "nimportequoi", now: T0 + 132 }).state; // wrong
    expect(state.phase).toBe("CHAIN_REVEAL");
    // only host's chain matched (prompt "chat" correctly guessed by p3) -> host, p2 (drawer), p3 (guesser) each score
    expect(state.players.host?.score).toBe(CHAIN_POINTS);
    expect(state.players.p2?.score).toBe(CHAIN_POINTS);
    expect(state.players.p3?.score).toBe(CHAIN_POINTS);
    expect(state.phaseDeadlineTs).toBe(T0 + 132 + 3 * CHAIN_REVEAL_PER_ITEM_MS);
  });

  it("lets the host skip the CHAIN_REVEAL wait and clears the chain state, going straight to the next deck slot", () => {
    let state = setupChainStarted();
    state = transition(state, { kind: "ALARM_FIRED", now: state.phaseDeadlineTs! }).state; // -> CHAIN_DRAW (fallback prompts)
    state = transition(state, { kind: "ALARM_FIRED", now: state.phaseDeadlineTs! }).state; // -> CHAIN_GUESS (fallback drawings)
    state = transition(state, { kind: "ALARM_FIRED", now: state.phaseDeadlineTs! }).state; // -> CHAIN_REVEAL (fallback guesses)
    expect(state.phase).toBe("CHAIN_REVEAL");
    state = transition(state, { kind: "HOST_NEXT", playerId: "host", now: T0 + 999 }).state;
    expect(state.phase).toBe("HOST_REVIEW"); // deck had only the one chain slot
    expect(state.chain).toBeNull();
  });

  it("fills missing submissions with a fallback on timeout instead of hanging forever", () => {
    let state = setupChainStarted();
    state = transition(state, { kind: "ALARM_FIRED", now: state.phaseDeadlineTs! }).state;
    expect(state.phase).toBe("CHAIN_DRAW");
    expect(Object.values(state.chain!.prompts)).toEqual(["…", "…", "…"]);
  });
});

describe("PLAY_AGAIN", () => {
  it("resets scores, grades and phase but keeps the same players", () => {
    let state = createRoom("1234", T0);
    state = join(state, "host", T0);
    state = join(state, "p2", T0 + 1);
    state = transition(state, {
      kind: "START_GAME",
      playerId: "host",
      now: T0 + 100,
      deck: trivia(question()),
    }).state;
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "host", questionId: 1, raw: "Paris", now: T0 + 200 })
      .state;
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "p2", questionId: 1, raw: "Paris", now: T0 + 201 })
      .state; // -> HOST_REVIEW
    state = transition(state, {
      kind: "SUBMIT_HOST_GRADE",
      playerId: "host",
      deckIndex: 0,
      targetPlayerId: "host",
      grade: 1,
    }).state;
    state = transition(state, { kind: "HOST_NEXT", playerId: "host", now: T0 + 400 }).state; // -> FINISHED
    expect(state.players.host?.score).toBe(1);

    state = transition(state, { kind: "PLAY_AGAIN", playerId: "host", now: T0 + 1000 }).state;
    expect(state.phase).toBe("LOBBY");
    expect(state.players.host?.score).toBe(0);
    expect(state.grades).toEqual({});
    expect(state.answerLog).toEqual({});
    expect(Object.keys(state.players)).toEqual(["host", "p2"]);
  });
});
