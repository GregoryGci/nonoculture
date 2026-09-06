import { classifyAnswer, computeScoreDeltas, applyScoreDeltas, DEFAULT_SETTINGS } from "@quiproquo/shared";
import type { GameSettings } from "@quiproquo/shared";
import {
  CHAIN_DRAW_DURATION_MS,
  CHAIN_GUESS_DURATION_MS,
  CHAIN_MIN_PLAYERS,
  CHAIN_POINTS,
  CHAIN_PROMPT_DURATION_MS,
  CHAIN_REVEAL_PER_ITEM_MS,
  CODE_RELEASE_DELAY_MS,
  DISCONNECT_GRACE_MS,
  JUDGE_VOTE_DURATION_MS,
  REVEAL_DURATION_MS,
  ROOM_IDLE_TIMEOUT_MS,
  SCOREBOARD_DURATION_MS,
} from "./types.js";
import type {
  ChainRoundState,
  DeckItem,
  Effect,
  GameEvent,
  GameState,
  InternalPlayer,
  InternalQuestion,
  SubmittedAnswer,
} from "./types.js";

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

function currentTriviaQuestion(state: GameState): InternalQuestion | null {
  const item = state.deck[state.deckIndex];
  return item?.kind === "trivia" ? item.question : null;
}

function currentDifficulty(state: GameState): 1 | 2 | 3 {
  return currentTriviaQuestion(state)?.difficulty ?? 1;
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
    chain: null,
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

// ---------- Chain round ("téléphone dessiné") ----------

/** The origin player `roleOffset` steps behind `playerId` in the rotation — i.e. whose
 *  content `playerId` is responsible for continuing (1 = drawer, 2 = guesser). */
export function originForRole(order: string[], playerId: string, roleOffset: number): string | null {
  const idx = order.indexOf(playerId);
  if (idx === -1) return null;
  return order[(idx - roleOffset + order.length) % order.length]!;
}

function allChainStepDone(state: GameState, submissions: Record<string, string>, roleOffset: number): boolean {
  const order = state.chain?.order ?? [];
  if (order.length === 0) return false;
  const relevantOrigins = order.filter((_, idx) => {
    const assigneeId = order[(idx + roleOffset) % order.length]!;
    return state.players[assigneeId]?.connected;
  });
  if (relevantOrigins.length === 0) return true; // nobody left connected to do this step, don't block
  return relevantOrigins.every((originId) => submissions[originId] !== undefined);
}

function fillMissing(order: string[], entries: Record<string, string>, fallback: string): Record<string, string> {
  const filled = { ...entries };
  for (const id of order) {
    if (filled[id] === undefined) filled[id] = fallback;
  }
  return filled;
}

function advancePastChainPrompt(state: GameState, now: number): GameState {
  const chain: ChainRoundState = { ...state.chain!, prompts: fillMissing(state.chain!.order, state.chain!.prompts, "…") };
  return { ...state, chain, phase: "CHAIN_DRAW", phaseDeadlineTs: now + CHAIN_DRAW_DURATION_MS };
}

function advancePastChainDraw(state: GameState, now: number): GameState {
  const chain: ChainRoundState = { ...state.chain!, drawings: fillMissing(state.chain!.order, state.chain!.drawings, "") };
  return { ...state, chain, phase: "CHAIN_GUESS", phaseDeadlineTs: now + CHAIN_GUESS_DURATION_MS };
}

function resolveChain(state: GameState, now: number): GameState {
  const { order, prompts, guesses } = state.chain!;
  const scores = Object.fromEntries(Object.values(state.players).map((p) => [p.playerId, p.score]));
  order.forEach((originId, idx) => {
    const prompt = prompts[originId] ?? "";
    const guess = guesses[originId] ?? "";
    const matched = prompt.length > 0 && guess.length > 0 && classifyAnswer(guess, prompt).classification === "auto_valid";
    if (!matched) return;
    const drawerId = order[(idx + 1) % order.length]!;
    const guesserId = order[(idx + 2) % order.length]!;
    for (const id of [originId, drawerId, guesserId]) {
      scores[id] = (scores[id] ?? 0) + CHAIN_POINTS;
    }
  });
  const players = Object.fromEntries(
    Object.entries(state.players).map(([id, p]) => [id, { ...p, score: scores[id] ?? p.score }]),
  );
  return {
    ...state,
    players,
    phase: "CHAIN_REVEAL",
    phaseDeadlineTs: now + order.length * CHAIN_REVEAL_PER_ITEM_MS,
  };
}

function advancePastChainGuess(state: GameState, now: number): GameState {
  const chain: ChainRoundState = { ...state.chain!, guesses: fillMissing(state.chain!.order, state.chain!.guesses, "") };
  return resolveChain({ ...state, chain }, now);
}

function goToScoreboardFromChainReveal(state: GameState, now: number): GameState {
  return { ...state, phase: "SCOREBOARD", chain: null, phaseDeadlineTs: now + SCOREBOARD_DURATION_MS };
}

/** Enters the deck slot at `index`: a trivia QUESTION, a chain round, or FINISHED past the end.
 *  Chain slots are skipped (recursively) if too few players are connected to run one. */
function startDeckSlot(state: GameState, index: number, now: number): GameState {
  if (index >= state.deck.length) {
    return { ...state, phase: "FINISHED", deckIndex: index, phaseDeadlineTs: null };
  }
  const item: DeckItem = state.deck[index]!;
  const base = {
    ...state,
    deckIndex: index,
    answers: [],
    greyZoneQueue: [],
    currentJudging: null,
  };
  if (item.kind === "trivia") {
    return {
      ...base,
      phase: "QUESTION",
      chain: null,
      phaseDeadlineTs: now + state.settings.questionDurationSec * 1000,
    };
  }
  const participants = connectedPlayers(state);
  if (participants.length < CHAIN_MIN_PLAYERS) {
    return startDeckSlot(state, index + 1, now); // not enough players right now, skip this slot
  }
  const order = participants.sort((a, b) => a.joinedAt - b.joinedAt).map((p) => p.playerId);
  return {
    ...base,
    phase: "CHAIN_PROMPT",
    chain: { order, prompts: {}, drawings: {}, guesses: {} },
    phaseDeadlineTs: now + CHAIN_PROMPT_DURATION_MS,
  };
}

function advanceFromScoreboard(state: GameState, now: number): GameState {
  return startDeckSlot(state, state.deckIndex + 1, now);
}

export function createRoom(roomCode: string, now: number): GameState {
  return {
    roomCode,
    phase: "LOBBY",
    settings: DEFAULT_SETTINGS,
    players: {},
    hostPlayerId: "",
    deck: [],
    deckIndex: -1,
    answers: [],
    greyZoneQueue: [],
    currentJudging: null,
    chain: null,
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
      if (event.deck.length === 0) break;
      next = startDeckSlot({ ...state, deck: event.deck }, 0, event.now);
      break;
    }

    case "SUBMIT_ANSWER": {
      if (state.phase !== "QUESTION") break;
      const question = currentTriviaQuestion(state);
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

    case "SUBMIT_CHAIN_PROMPT": {
      if (state.phase !== "CHAIN_PROMPT" || !state.chain) break;
      if (!state.chain.order.includes(event.playerId)) break;
      if (state.chain.prompts[event.playerId] !== undefined) break; // locked
      const chain = { ...state.chain, prompts: { ...state.chain.prompts, [event.playerId]: event.text } };
      next = { ...state, chain };
      effects.push({ kind: "SEND_ANSWER_RECEIVED", playerId: event.playerId });
      if (allChainStepDone(next, chain.prompts, 0)) {
        next = advancePastChainPrompt(next, event.now);
      }
      break;
    }

    case "SUBMIT_CHAIN_DRAWING": {
      if (state.phase !== "CHAIN_DRAW" || !state.chain) break;
      if (!state.players[event.playerId]?.connected) break;
      const origin = originForRole(state.chain.order, event.playerId, 1);
      if (!origin || state.chain.drawings[origin] !== undefined) break;
      const chain = { ...state.chain, drawings: { ...state.chain.drawings, [origin]: event.dataUrl } };
      next = { ...state, chain };
      effects.push({ kind: "SEND_ANSWER_RECEIVED", playerId: event.playerId });
      if (allChainStepDone(next, chain.drawings, 1)) {
        next = advancePastChainDraw(next, event.now);
      }
      break;
    }

    case "SUBMIT_CHAIN_GUESS": {
      if (state.phase !== "CHAIN_GUESS" || !state.chain) break;
      if (!state.players[event.playerId]?.connected) break;
      const origin = originForRole(state.chain.order, event.playerId, 2);
      if (!origin || state.chain.guesses[origin] !== undefined) break;
      const chain = { ...state.chain, guesses: { ...state.chain.guesses, [origin]: event.text } };
      next = { ...state, chain };
      effects.push({ kind: "SEND_ANSWER_RECEIVED", playerId: event.playerId });
      if (allChainStepDone(next, chain.guesses, 2)) {
        next = advancePastChainGuess(next, event.now);
      }
      break;
    }

    case "HOST_NEXT": {
      if (event.playerId !== state.hostPlayerId) break;
      if (state.phase === "SCOREBOARD") {
        next = advanceFromScoreboard(state, event.now);
      } else if (state.phase === "REVEAL") {
        next = startJudgingOrScoreboard(state, event.now);
      } else if (state.phase === "CHAIN_REVEAL") {
        next = goToScoreboardFromChainReveal(state, event.now);
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
        deck: [],
        deckIndex: -1,
        answers: [],
        greyZoneQueue: [],
        currentJudging: null,
        chain: null,
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
    } else if (next.phase === "CHAIN_PROMPT") {
      next = advancePastChainPrompt(next, now);
    } else if (next.phase === "CHAIN_DRAW") {
      next = advancePastChainDraw(next, now);
    } else if (next.phase === "CHAIN_GUESS") {
      next = advancePastChainGuess(next, now);
    } else if (next.phase === "CHAIN_REVEAL") {
      next = goToScoreboardFromChainReveal(next, now);
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
