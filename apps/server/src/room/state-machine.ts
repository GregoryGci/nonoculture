import { classifyAnswer, computeScoreDeltas, applyScoreDeltas, DEFAULT_SETTINGS } from "@quiproquo/shared";
import type { GameSettings } from "@quiproquo/shared";
import {
  CODE_RELEASE_DELAY_MS,
  DISCONNECT_GRACE_MS,
  JUDGE_VOTE_DURATION_MS,
  REVEAL_DURATION_MS,
  ROOM_IDLE_TIMEOUT_MS,
  SCOREBOARD_DURATION_MS,
} from "./types.js";
import type { Effect, GameEvent, GameState, InternalPlayer, SubmittedAnswer } from "./types.js";

export interface TransitionResult {
  state: GameState;
  effects: Effect[];
}

function clampSettings(partial: Partial<GameSettings>, base: GameSettings): GameSettings {
  return {
    questionCount: partial.questionCount !== undefined
      ? Math.min(40, Math.max(20, partial.questionCount))
      : base.questionCount,
    questionDurationSec: partial.questionDurationSec !== undefined
      ? Math.min(30, Math.max(15, partial.questionDurationSec))
      : base.questionDurationSec,
    themes: partial.themes ?? base.themes,
  };
}

function connectedPlayers(state: GameState): InternalPlayer[] {
  return Object.values(state.players).filter((p) => p.connected);
}

function oldestConnected(state: GameState, excluding?: string): InternalPlayer | null {
  const candidates = connectedPlayers(state).filter((p) => p.playerId !== excluding);
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (a.joinedAt <= b.joinedAt ? a : b));
}

function finalizeAnswer(a: SubmittedAnswer): SubmittedAnswer {
  if (a.accepted !== null) return a;
  if (a.classification === "auto_valid") return { ...a, accepted: true };
  if (a.classification === "auto_invalid") return { ...a, accepted: false };
  return a; // grey_zone left pending unless voted on
}

function currentDifficulty(state: GameState): 1 | 2 | 3 {
  return state.questions[state.questionIndex]?.difficulty ?? 1;
}

/** Apply score deltas for every answer that now has a final accepted value. */
function applyPendingScores(state: GameState): GameState {
  const finalized = state.answers.map(finalizeAnswer);
  const deltas = computeScoreDeltas(
    finalized.filter((a) => a.accepted !== null).map((a) => ({ playerId: a.playerId, accepted: a.accepted as boolean })),
    currentDifficulty(state),
  );
  const scores = applyScoreDeltas(
    Object.fromEntries(Object.values(state.players).map((p) => [p.playerId, p.score])),
    deltas,
  );
  const players = Object.fromEntries(
    Object.entries(state.players).map(([id, p]) => [id, { ...p, score: scores[id] ?? p.score }]),
  );
  return { ...state, answers: finalized, players };
}

function goToScoreboardOrNext(state: GameState, now: number): GameState {
  const scored = applyPendingScores(state);
  return {
    ...scored,
    phase: "SCOREBOARD",
    currentJudging: null,
    greyZoneQueue: [],
    phaseDeadlineTs: now + SCOREBOARD_DURATION_MS,
  };
}

function startJudgingOrScoreboard(state: GameState, now: number): GameState {
  if (state.greyZoneQueue.length === 0) {
    return goToScoreboardOrNext(state, now);
  }
  const [next, ...rest] = state.greyZoneQueue;
  return {
    ...state,
    phase: "JUDGING",
    greyZoneQueue: rest,
    currentJudging: { playerId: next!, votes: {} },
    phaseDeadlineTs: now + JUDGE_VOTE_DURATION_MS,
  };
}

function finalizeCurrentJudging(state: GameState): GameState {
  if (!state.currentJudging) return state;
  const { playerId, votes } = state.currentJudging;
  const tally = Object.values(votes).reduce(
    (acc, v) => (v.vote === "valid" ? { ...acc, valid: acc.valid + 1 } : { ...acc, invalid: acc.invalid + 1 }),
    { valid: 0, invalid: 0 },
  );
  let accepted: boolean;
  if (tally.valid > tally.invalid) {
    accepted = true;
  } else if (tally.invalid > tally.valid) {
    accepted = false;
  } else {
    const hostVote = votes[state.hostPlayerId];
    accepted = hostVote ? hostVote.vote === "valid" : false; // no tiebreak cast => reject
  }
  const answers = state.answers.map((a) => (a.playerId === playerId ? { ...a, accepted } : a));
  return { ...state, answers, currentJudging: null };
}

function allEligibleVoted(state: GameState): boolean {
  if (!state.currentJudging) return false;
  const { playerId, votes } = state.currentJudging;
  const eligible = connectedPlayers(state).filter((p) => p.playerId !== playerId);
  return eligible.length > 0 && eligible.every((p) => votes[p.playerId] !== undefined);
}

function allConnectedAnswered(state: GameState): boolean {
  const eligible = connectedPlayers(state);
  if (eligible.length === 0) return false;
  const answeredIds = new Set(state.answers.map((a) => a.playerId));
  return eligible.every((p) => answeredIds.has(p.playerId));
}

export function createRoom(roomCode: string, now: number): GameState {
  return {
    roomCode,
    phase: "LOBBY",
    settings: DEFAULT_SETTINGS,
    players: {},
    hostPlayerId: "",
    questions: [],
    questionIndex: -1,
    answers: [],
    greyZoneQueue: [],
    currentJudging: null,
    phaseDeadlineTs: null,
    createdAt: now,
    lastActivityAt: now,
  };
}

export function transition(state: GameState, event: GameEvent): TransitionResult {
  const effects: Effect[] = [];
  let next = state;

  switch (event.kind) {
    case "PLAYER_JOIN": {
      const existing = state.players[event.playerId];
      if (existing) {
        next = {
          ...state,
          players: {
            ...state.players,
            [event.playerId]: { ...existing, connected: true, disconnectedAt: null },
          },
        };
      } else {
        const isFirst = Object.keys(state.players).length === 0;
        const player: InternalPlayer = {
          playerId: event.playerId,
          playerToken: event.playerToken,
          nickname: "",
          avatar: "",
          score: 0,
          isHost: isFirst,
          connected: true,
          joinedAt: event.now,
          disconnectedAt: null,
        };
        next = {
          ...state,
          players: { ...state.players, [event.playerId]: player },
          hostPlayerId: isFirst ? event.playerId : state.hostPlayerId,
        };
      }
      break;
    }

    case "SET_PROFILE": {
      const player = state.players[event.playerId];
      if (!player) break;
      next = {
        ...state,
        players: {
          ...state.players,
          [event.playerId]: { ...player, nickname: event.nickname, avatar: event.avatar },
        },
      };
      break;
    }

    case "PLAYER_DISCONNECT": {
      const player = state.players[event.playerId];
      if (!player || !player.connected) break;
      let players = {
        ...state.players,
        [event.playerId]: { ...player, connected: false, disconnectedAt: event.now },
      };
      let hostPlayerId = state.hostPlayerId;
      if (player.isHost) {
        const successor = oldestConnected({ ...state, players }, event.playerId);
        if (successor) {
          hostPlayerId = successor.playerId;
          players = {
            ...players,
            [event.playerId]: { ...players[event.playerId]!, isHost: false },
            [successor.playerId]: { ...successor, isHost: true },
          };
        }
      }
      next = { ...state, players, hostPlayerId };
      break;
    }

    case "PLAYER_RECONNECT": {
      const player = state.players[event.playerId];
      if (!player) break;
      next = {
        ...state,
        players: {
          ...state.players,
          [event.playerId]: { ...player, connected: true, disconnectedAt: null },
        },
      };
      break;
    }

    case "HOST_KICK": {
      if (event.playerId !== state.hostPlayerId) break;
      const { [event.targetId]: _removed, ...rest } = state.players;
      next = { ...state, players: rest };
      break;
    }

    case "HOST_SETTINGS": {
      if (event.playerId !== state.hostPlayerId || state.phase !== "LOBBY") break;
      next = { ...state, settings: clampSettings(event.settings, state.settings) };
      break;
    }

    case "START_GAME": {
      if (event.playerId !== state.hostPlayerId || state.phase !== "LOBBY") break;
      if (event.questions.length === 0) break;
      next = {
        ...state,
        phase: "QUESTION",
        questions: event.questions,
        questionIndex: 0,
        answers: [],
        greyZoneQueue: [],
        currentJudging: null,
        phaseDeadlineTs: event.now + state.settings.questionDurationSec * 1000,
      };
      break;
    }

    case "SUBMIT_ANSWER": {
      if (state.phase !== "QUESTION") break;
      const question = state.questions[state.questionIndex];
      if (!question || question.id !== event.questionId) break;
      const player = state.players[event.playerId];
      if (!player || !player.connected) break;
      if (state.answers.some((a) => a.playerId === event.playerId)) break; // locked

      const { classification } = classifyAnswer(event.raw, question.answer, question.aliases);
      const answer: SubmittedAnswer = {
        playerId: event.playerId,
        raw: event.raw,
        submittedAt: event.now,
        classification,
        accepted: classification === "grey_zone" ? null : classification === "auto_valid",
      };
      effects.push({ kind: "SEND_ANSWER_RECEIVED", playerId: event.playerId });
      next = { ...state, answers: [...state.answers, answer] };

      if (allConnectedAnswered(next)) {
        next = revealFromQuestion(next, event.now);
      }
      break;
    }

    case "CAST_JUDGE_VOTE": {
      if (state.phase !== "JUDGING" || !state.currentJudging) break;
      if (event.playerId === state.currentJudging.playerId) break; // can't vote on own answer
      if (!state.players[event.playerId]?.connected) break;
      next = {
        ...state,
        currentJudging: {
          ...state.currentJudging,
          votes: { ...state.currentJudging.votes, [event.playerId]: { voterId: event.playerId, vote: event.vote } },
        },
      };
      if (allEligibleVoted(next)) {
        next = finalizeCurrentJudging(next);
        next = startJudgingOrScoreboard(next, event.now);
      }
      break;
    }

    case "HOST_NEXT": {
      if (event.playerId !== state.hostPlayerId) break;
      if (state.phase === "SCOREBOARD") {
        next = advanceFromScoreboard(state, event.now);
      } else if (state.phase === "REVEAL") {
        next = startJudgingOrScoreboard(state, event.now);
      }
      break;
    }

    case "PLAY_AGAIN": {
      if (event.playerId !== state.hostPlayerId || state.phase !== "FINISHED") break;
      const players = Object.fromEntries(
        Object.entries(state.players).map(([id, p]) => [id, { ...p, score: 0 }]),
      );
      next = {
        ...state,
        phase: "LOBBY",
        players,
        questions: [],
        questionIndex: -1,
        answers: [],
        greyZoneQueue: [],
        currentJudging: null,
        phaseDeadlineTs: null,
      };
      break;
    }

    case "ALARM_FIRED": {
      next = handleAlarm(state, event.now, effects);
      break;
    }
  }

  if (next !== state) {
    const now = "now" in event ? event.now : state.lastActivityAt;
    next = { ...next, lastActivityAt: now };
    if (next.phase === "FINISHED" && state.phase !== "FINISHED") {
      effects.push({ kind: "SET_CODE_EXPIRY", expiresAt: next.lastActivityAt + CODE_RELEASE_DELAY_MS });
    }
  }

  return { state: next, effects };
}

function revealFromQuestion(state: GameState, now: number): GameState {
  const greyZoneQueue = state.answers.filter((a) => a.classification === "grey_zone").map((a) => a.playerId);
  return {
    ...state,
    phase: "REVEAL",
    greyZoneQueue,
    phaseDeadlineTs: now + REVEAL_DURATION_MS,
  };
}

function advanceFromScoreboard(state: GameState, now: number): GameState {
  const nextIndex = state.questionIndex + 1;
  if (nextIndex >= state.questions.length) {
    return { ...state, phase: "FINISHED", phaseDeadlineTs: null };
  }
  return {
    ...state,
    phase: "QUESTION",
    questionIndex: nextIndex,
    answers: [],
    greyZoneQueue: [],
    currentJudging: null,
    phaseDeadlineTs: now + state.settings.questionDurationSec * 1000,
  };
}

function handleAlarm(state: GameState, now: number, effects: Effect[]): GameState {
  let next = state;

  // 1. Drop players whose disconnect grace period has elapsed.
  const survivors = Object.fromEntries(
    Object.entries(next.players).filter(([, p]) => {
      if (p.connected || p.disconnectedAt === null) return true;
      return now - p.disconnectedAt < DISCONNECT_GRACE_MS;
    }),
  );
  if (Object.keys(survivors).length !== Object.keys(next.players).length) {
    let hostPlayerId = next.hostPlayerId;
    if (!survivors[hostPlayerId]) {
      const successor = oldestConnected({ ...next, players: survivors });
      hostPlayerId = successor?.playerId ?? hostPlayerId;
      if (successor) survivors[successor.playerId] = { ...successor, isHost: true };
    }
    next = { ...next, players: survivors, hostPlayerId };
  }

  // 2. Room-wide idle cleanup: nobody connected for a long time.
  if (connectedPlayers(next).length === 0 && now - next.lastActivityAt >= ROOM_IDLE_TIMEOUT_MS) {
    effects.push({ kind: "DESTROY_ROOM" });
    return next;
  }

  // 3. Phase deadline handling.
  if (next.phaseDeadlineTs !== null && now >= next.phaseDeadlineTs) {
    if (next.phase === "QUESTION") {
      next = revealFromQuestion(next, now);
    } else if (next.phase === "REVEAL") {
      next = startJudgingOrScoreboard(next, now);
    } else if (next.phase === "JUDGING") {
      next = finalizeCurrentJudging(next);
      next = startJudgingOrScoreboard(next, now);
    } else if (next.phase === "SCOREBOARD") {
      next = advanceFromScoreboard(next, now);
    }
  }

  return next;
}

/** Earliest timestamp the DO should next wake up for, or null if nothing pending. */
export function computeNextAlarmTs(state: GameState): number | null {
  const candidates: number[] = [];
  if (state.phaseDeadlineTs !== null) candidates.push(state.phaseDeadlineTs);
  for (const p of Object.values(state.players)) {
    if (!p.connected && p.disconnectedAt !== null) {
      candidates.push(p.disconnectedAt + DISCONNECT_GRACE_MS);
    }
  }
  if (connectedPlayers(state).length === 0 && state.phase !== "FINISHED") {
    candidates.push(state.lastActivityAt + ROOM_IDLE_TIMEOUT_MS);
  }
  return candidates.length > 0 ? Math.min(...candidates) : null;
}
