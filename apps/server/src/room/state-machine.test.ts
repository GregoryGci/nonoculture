import { describe, expect, it } from "vitest";
import { computeNextAlarmTs, createRoom, transition } from "./state-machine.js";
import type { GameState, InternalQuestion } from "./types.js";
import { DISCONNECT_GRACE_MS, JUDGE_VOTE_DURATION_MS, REVEAL_DURATION_MS, SCOREBOARD_DURATION_MS } from "./types.js";

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
    state = transition(state, { kind: "PLAYER_RECONNECT", playerId: "host", now: T0 + 25 }).state;
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

describe("game loop: QUESTION -> REVEAL -> SCOREBOARD", () => {
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
      questions: [question({ id: 1 }), question({ id: 2, answer: "Berlin" })],
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
      questions: [question()],
    });
    expect(result.state.phase).toBe("LOBBY");
  });

  it("moves to QUESTION with a server deadline", () => {
    const state = setupStarted();
    expect(state.phase).toBe("QUESTION");
    expect(state.phaseDeadlineTs).toBe(T0 + 100 + state.settings.questionDurationSec * 1000);
  });

  it("advances to REVEAL as soon as all connected players answer, before the timer", () => {
    let state = setupStarted();
    state = transition(state, {
      kind: "SUBMIT_ANSWER",
      playerId: "host",
      questionId: 1,
      raw: "Paris",
      now: T0 + 200,
    }).state;
    expect(state.phase).toBe("QUESTION");
    state = transition(state, {
      kind: "SUBMIT_ANSWER",
      playerId: "p2",
      questionId: 1,
      raw: "paris",
      now: T0 + 201,
    }).state;
    expect(state.phase).toBe("REVEAL");
    expect(state.phaseDeadlineTs).toBe(T0 + 201 + REVEAL_DURATION_MS);
  });

  it("gives SCOREBOARD a fixed server-side duration", () => {
    let state = setupStarted();
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "host", questionId: 1, raw: "Paris", now: T0 + 200 })
      .state;
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "p2", questionId: 1, raw: "Paris", now: T0 + 201 })
      .state;
    const revealDeadline = state.phaseDeadlineTs!;
    state = transition(state, { kind: "ALARM_FIRED", now: revealDeadline }).state;
    expect(state.phase).toBe("SCOREBOARD");
    expect(state.phaseDeadlineTs).toBe(revealDeadline + SCOREBOARD_DURATION_MS);
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

  it("times out unanswered players via ALARM_FIRED and reveals", () => {
    let state = setupStarted();
    const deadline = state.phaseDeadlineTs!;
    state = transition(state, { kind: "ALARM_FIRED", now: deadline }).state;
    expect(state.phase).toBe("REVEAL");
    expect(state.answers).toHaveLength(0); // nobody answered
  });

  it("auto-accepts an exact answer and scores it on reveal->scoreboard", () => {
    let state = setupStarted();
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "host", questionId: 1, raw: "Paris", now: T0 + 200 })
      .state;
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "p2", questionId: 1, raw: "nope", now: T0 + 201 })
      .state;
    expect(state.phase).toBe("REVEAL");
    state = transition(state, { kind: "ALARM_FIRED", now: state.phaseDeadlineTs! }).state;
    expect(state.phase).toBe("SCOREBOARD");
    expect(state.players.host?.score).toBe(1); // difficulty 1
    expect(state.players.p2?.score).toBe(0);
  });

  it("skips JUDGING entirely when nothing is in the grey zone", () => {
    let state = setupStarted();
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "host", questionId: 1, raw: "Paris", now: T0 + 200 })
      .state;
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "p2", questionId: 1, raw: "xyz", now: T0 + 201 })
      .state;
    state = transition(state, { kind: "ALARM_FIRED", now: state.phaseDeadlineTs! }).state;
    expect(state.phase).toBe("SCOREBOARD");
  });

  it("advances from SCOREBOARD to the next QUESTION, then to FINISHED after the last one", () => {
    let state = setupStarted();
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "host", questionId: 1, raw: "Paris", now: T0 + 200 })
      .state;
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "p2", questionId: 1, raw: "Paris", now: T0 + 201 })
      .state;
    state = transition(state, { kind: "ALARM_FIRED", now: state.phaseDeadlineTs! }).state; // -> SCOREBOARD
    state = transition(state, { kind: "ALARM_FIRED", now: state.phaseDeadlineTs! }).state; // -> QUESTION #2
    expect(state.phase).toBe("QUESTION");
    expect(state.questionIndex).toBe(1);

    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "host", questionId: 2, raw: "Berlin", now: T0 + 300 })
      .state;
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "p2", questionId: 2, raw: "Berlin", now: T0 + 301 })
      .state;
    state = transition(state, { kind: "ALARM_FIRED", now: state.phaseDeadlineTs! }).state; // -> SCOREBOARD
    state = transition(state, { kind: "ALARM_FIRED", now: state.phaseDeadlineTs! }).state; // -> FINISHED
    expect(state.phase).toBe("FINISHED");
    expect(state.phaseDeadlineTs).toBeNull();
  });

  it("lets the host skip the scoreboard wait via HOST_NEXT", () => {
    let state = setupStarted();
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "host", questionId: 1, raw: "Paris", now: T0 + 200 })
      .state;
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "p2", questionId: 1, raw: "Paris", now: T0 + 201 })
      .state;
    state = transition(state, { kind: "ALARM_FIRED", now: state.phaseDeadlineTs! }).state; // -> SCOREBOARD
    state = transition(state, { kind: "HOST_NEXT", playerId: "host", now: T0 + 500 }).state;
    expect(state.phase).toBe("QUESTION");
  });

  it("ignores HOST_NEXT from a non-host player", () => {
    let state = setupStarted();
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "host", questionId: 1, raw: "Paris", now: T0 + 200 })
      .state;
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "p2", questionId: 1, raw: "Paris", now: T0 + 201 })
      .state;
    state = transition(state, { kind: "ALARM_FIRED", now: state.phaseDeadlineTs! }).state; // -> SCOREBOARD
    const before = state.phase;
    state = transition(state, { kind: "HOST_NEXT", playerId: "p2", now: T0 + 500 }).state;
    expect(state.phase).toBe(before);
  });
});

describe("JUDGING", () => {
  function setupGreyZone() {
    let state = createRoom("1234", T0);
    state = join(state, "host", T0);
    state = withProfile(state, "host", "Alice");
    state = join(state, "p2", T0 + 1);
    state = withProfile(state, "p2", "Bob");
    state = join(state, "p3", T0 + 2);
    state = withProfile(state, "p3", "Carl");
    state = transition(state, {
      kind: "START_GAME",
      playerId: "host",
      now: T0 + 100,
      questions: [question({ id: 1, answer: "Berlin" })],
    }).state;
    // "berlim" vs "berlin" -> normalized distance 1/6 = 0.167, in the grey zone (0.15, 0.5).
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "host", questionId: 1, raw: "berlim", now: T0 + 200 })
      .state; // grey zone
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "p2", questionId: 1, raw: "nope", now: T0 + 201 })
      .state; // auto_invalid
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "p3", questionId: 1, raw: "Berlin", now: T0 + 202 })
      .state; // auto_valid
    return state; // all 3 answered -> already moved to REVEAL
  }

  it("enters JUDGING for a grey-zone answer after REVEAL", () => {
    let state = setupGreyZone();
    expect(state.phase).toBe("REVEAL");
    const revealDeadline = state.phaseDeadlineTs!;
    state = transition(state, { kind: "ALARM_FIRED", now: revealDeadline }).state;
    expect(state.phase).toBe("JUDGING");
    expect(state.currentJudging?.playerId).toBe("host");
    expect(state.phaseDeadlineTs).toBe(revealDeadline + JUDGE_VOTE_DURATION_MS);
  });

  it("the answer owner cannot vote on their own answer", () => {
    let state = setupGreyZone();
    state = transition(state, { kind: "ALARM_FIRED", now: state.phaseDeadlineTs! }).state; // JUDGING
    const before = state;
    state = transition(state, { kind: "CAST_JUDGE_VOTE", playerId: "host", vote: "valid", now: T0 + 300 }).state;
    expect(state.currentJudging?.votes).toEqual(before.currentJudging?.votes);
  });

  it("accepts the answer once majority votes valid, and advances early", () => {
    let state = setupGreyZone();
    state = transition(state, { kind: "ALARM_FIRED", now: state.phaseDeadlineTs! }).state; // JUDGING
    state = transition(state, { kind: "CAST_JUDGE_VOTE", playerId: "p2", vote: "valid", now: T0 + 300 }).state;
    // only p2 and p3 are eligible voters (host owns the answer) -> after both vote, auto-advance
    state = transition(state, { kind: "CAST_JUDGE_VOTE", playerId: "p3", vote: "valid", now: T0 + 301 }).state;
    expect(state.phase).toBe("SCOREBOARD");
    expect(state.players.host?.score).toBe(1);
  });

  it("rejects the answer when majority votes invalid", () => {
    let state = setupGreyZone();
    state = transition(state, { kind: "ALARM_FIRED", now: state.phaseDeadlineTs! }).state; // JUDGING
    state = transition(state, { kind: "CAST_JUDGE_VOTE", playerId: "p2", vote: "invalid", now: T0 + 300 }).state;
    state = transition(state, { kind: "CAST_JUDGE_VOTE", playerId: "p3", vote: "invalid", now: T0 + 301 }).state;
    expect(state.players.host?.score).toBe(0);
  });

  it("falls back to the host's vote to break a tie", () => {
    let state = createRoom("1234", T0);
    state = join(state, "host", T0);
    state = withProfile(state, "host", "Alice");
    state = join(state, "p2", T0 + 1);
    state = withProfile(state, "p2", "Bob");
    state = join(state, "p3", T0 + 2);
    state = withProfile(state, "p3", "Carl");
    state = join(state, "p4", T0 + 3);
    state = withProfile(state, "p4", "Dan");
    state = transition(state, {
      kind: "START_GAME",
      playerId: "host",
      now: T0 + 100,
      questions: [question({ id: 1, answer: "Berlin" })],
    }).state;
    // p2's answer goes to judging; host, p3, p4 vote (host is a voter here, p2 is the owner)
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "p2", questionId: 1, raw: "berlim", now: T0 + 200 })
      .state;
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "host", questionId: 1, raw: "Berlin", now: T0 + 201 })
      .state;
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "p3", questionId: 1, raw: "Berlin", now: T0 + 202 })
      .state;
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "p4", questionId: 1, raw: "Berlin", now: T0 + 203 })
      .state; // -> REVEAL (all answered)
    state = transition(state, { kind: "ALARM_FIRED", now: state.phaseDeadlineTs! }).state; // -> JUDGING
    state = transition(state, { kind: "CAST_JUDGE_VOTE", playerId: "host", vote: "valid", now: T0 + 300 }).state;
    state = transition(state, { kind: "CAST_JUDGE_VOTE", playerId: "p3", vote: "invalid", now: T0 + 301 }).state;
    // tie 1-1 pending p4's vote too -> not resolved yet since not all eligible voted (host,p3,p4 = 3 eligible)
    state = transition(state, { kind: "CAST_JUDGE_VOTE", playerId: "p4", vote: "invalid", now: T0 + 302 }).state;
    // 1 valid (host) vs 2 invalid (p3,p4) -> majority invalid, not actually a tie; assert rejected
    expect(state.players.p2?.score).toBe(0);
  });

  it("times out a vote via ALARM_FIRED and moves to the next grey-zone item or SCOREBOARD", () => {
    let state = setupGreyZone();
    state = transition(state, { kind: "ALARM_FIRED", now: state.phaseDeadlineTs! }).state; // JUDGING
    const deadline = state.phaseDeadlineTs!;
    state = transition(state, { kind: "ALARM_FIRED", now: deadline }).state;
    expect(state.phase).toBe("SCOREBOARD"); // no votes cast -> rejected by default, no more grey items
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
      questions: [question()],
    }).state;
    state = transition(state, { kind: "PLAYER_DISCONNECT", playerId: "p2", now: T0 + 150 }).state;
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "host", questionId: 1, raw: "Paris", now: T0 + 200 })
      .state;
    expect(state.phase).toBe("REVEAL");
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
      questions: [question()],
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
      questions: [question()],
    }).state;
    state = transition(state, { kind: "PLAYER_DISCONNECT", playerId: "p2", now: T0 + 150 }).state;
    const expected = Math.min(state.phaseDeadlineTs!, T0 + 150 + DISCONNECT_GRACE_MS);
    expect(computeNextAlarmTs(state)).toBe(expected);
  });
});

describe("PLAY_AGAIN", () => {
  it("resets scores and phase but keeps the same players", () => {
    let state = createRoom("1234", T0);
    state = join(state, "host", T0);
    state = join(state, "p2", T0 + 1);
    state = transition(state, {
      kind: "START_GAME",
      playerId: "host",
      now: T0 + 100,
      questions: [question()],
    }).state;
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "host", questionId: 1, raw: "Paris", now: T0 + 200 })
      .state;
    state = transition(state, { kind: "SUBMIT_ANSWER", playerId: "p2", questionId: 1, raw: "Paris", now: T0 + 201 })
      .state;
    state = transition(state, { kind: "ALARM_FIRED", now: state.phaseDeadlineTs! }).state; // SCOREBOARD
    state = transition(state, { kind: "ALARM_FIRED", now: state.phaseDeadlineTs! }).state; // FINISHED
    expect(state.players.host?.score).toBe(1);

    state = transition(state, { kind: "PLAY_AGAIN", playerId: "host", now: T0 + 1000 }).state;
    expect(state.phase).toBe("LOBBY");
    expect(state.players.host?.score).toBe(0);
    expect(Object.keys(state.players)).toEqual(["host", "p2"]);
  });
});
