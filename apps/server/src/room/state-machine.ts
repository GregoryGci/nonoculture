import {
  BLUFF_MIN_PLAYERS,
  BLUFF_POINTS_FOOLED,
  BLUFF_POINTS_FOUND,
  CHAIN_MIN_PLAYERS,
  DEFAULT_SETTINGS,
  DUEL_MIN_PLAYERS,
  DUEL_POINTS_PREDICTED,
  DUEL_POINTS_WINNER,
  MAX_CHAIN_ROUNDS,
  NUMERIC_POINTS_CLOSEST,
  NUMERIC_POINTS_EXACT,
  MAX_SPECIAL_ROUNDS,
  isChainMatch,
  normalizeAnswer,
} from "@nonoculture/shared";
import type { GameSettings, Grade } from "@nonoculture/shared";
import {
  CHAIN_DRAW_DURATION_MS,
  CHAIN_GUESS_DURATION_MS,
  CHAIN_POINTS,
  CHAIN_PROMPT_DURATION_MS,
  BLUFF_REVEAL_DURATION_MS,
  BLUFF_VOTE_DURATION_MS,
  BLUFF_WRITE_DURATION_MS,
  CHAIN_REVEAL_PER_ITEM_MS,
  CODE_RELEASE_DELAY_MS,
  DUEL_ANSWER_DURATION_MS,
  DUEL_PREDICT_DURATION_MS,
  DUEL_REVEAL_DURATION_MS,
  DISCONNECT_GRACE_MS,
  ROOM_IDLE_TIMEOUT_MS,
} from "./types.js";
import type {
  BluffRoundState,
  ChainRoundState,
  Effect,
  GameEvent,
  GameState,
  InternalPlayer,
  InternalQuestion,
} from "./types.js";

export interface TransitionResult {
  state: GameState;
  effects: Effect[];
}

function clampSettings(partial: Partial<GameSettings>, base: GameSettings): GameSettings {
  return {
    questionCount:
      partial.questionCount !== undefined ? Math.min(40, Math.max(5, partial.questionCount)) : base.questionCount,
    questionDurationSec:
      partial.questionDurationSec !== undefined
        ? Math.min(30, Math.max(15, partial.questionDurationSec))
        : base.questionDurationSec,
    chainRounds:
      partial.chainRounds !== undefined
        ? Math.min(MAX_CHAIN_ROUNDS, Math.max(0, partial.chainRounds))
        : base.chainRounds,
    bluffRounds:
      partial.bluffRounds !== undefined
        ? Math.min(MAX_SPECIAL_ROUNDS, Math.max(0, partial.bluffRounds))
        : base.bluffRounds,
    duelRounds:
      partial.duelRounds !== undefined
        ? Math.min(MAX_SPECIAL_ROUNDS, Math.max(0, partial.duelRounds))
        : base.duelRounds,
    numericRounds:
      partial.numericRounds !== undefined
        ? Math.min(MAX_SPECIAL_ROUNDS, Math.max(0, partial.numericRounds))
        : base.numericRounds,
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

function allChainStepDone(state: GameState, submissions: Record<string, unknown>, roleOffset: number): boolean {
  const order = state.chain?.order ?? [];
  if (order.length === 0) return false;
  const relevantOrigins = order.filter((_, idx) => {
    const assigneeId = order[(idx + roleOffset) % order.length]!;
    return state.players[assigneeId]?.connected;
  });
  if (relevantOrigins.length === 0) return true; // nobody left connected to do this step, don't block
  return relevantOrigins.every((originId) => submissions[originId] !== undefined);
}

function fillMissing<T>(order: string[], entries: Record<string, T>, fallback: T): Record<string, T> {
  const filled = { ...entries };
  for (const id of order) {
    if (filled[id] === undefined) filled[id] = fallback;
  }
  return filled;
}

function advancePastChainPrompt(state: GameState, now: number): GameState {
  const chain: ChainRoundState = {
    ...state.chain!,
    prompts: fillMissing(state.chain!.order, state.chain!.prompts, "…"),
  };
  return { ...state, chain, phase: "CHAIN_DRAW", phaseDeadlineTs: now + CHAIN_DRAW_DURATION_MS };
}

function advancePastChainDraw(state: GameState, now: number): GameState {
  const chain: ChainRoundState = {
    ...state.chain!,
    drawings: fillMissing(state.chain!.order, state.chain!.drawings, false),
  };
  return { ...state, chain, phase: "CHAIN_GUESS", phaseDeadlineTs: now + CHAIN_GUESS_DURATION_MS };
}

function resolveChain(state: GameState, now: number): GameState {
  const { order, prompts, guesses } = state.chain!;
  const scores = Object.fromEntries(Object.values(state.players).map((p) => [p.playerId, p.score]));
  order.forEach((originId, idx) => {
    const prompt = prompts[originId] ?? "";
    const guess = guesses[originId] ?? "";
    if (!isChainMatch(guess, prompt)) return;
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
  const chain: ChainRoundState = {
    ...state.chain!,
    guesses: fillMissing(state.chain!.order, state.chain!.guesses, ""),
  };
  return resolveChain({ ...state, chain }, now);
}

// ---------- Bluff round ----------

/** Every accepted spelling of a question's answer, normalised for comparison. */
function acceptedAnswers(question: InternalQuestion): string[] {
  return [question.answer, ...question.aliases].map(normalizeAnswer).filter((a) => a.length > 0);
}

/**
 * Builds what voters see: the real answer hidden among the fakes.
 *
 * A fake that happens to match the real answer is dropped rather than shown twice — its
 * author was right, not deceptive, and two identical options would make the vote nonsense.
 */
function buildBluffOptions(question: InternalQuestion, fakes: Record<string, string>): BluffRoundState["options"] {
  const accepted = acceptedAnswers(question);
  const seen = new Set(accepted);
  const options: BluffRoundState["options"] = [{ id: "real", text: question.answer, authorId: null }];
  for (const [authorId, text] of Object.entries(fakes)) {
    const norm = normalizeAnswer(text);
    if (norm.length === 0 || seen.has(norm)) continue;
    seen.add(norm);
    options.push({ id: `f-${authorId}`, text, authorId });
  }
  // Deterministic shuffle is not needed; the order is snapshotted into state once.
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j]!, options[i]!];
  }
  return options;
}

function resolveBluff(state: GameState, now: number): GameState {
  const bluff = state.bluff!;
  const scores = Object.fromEntries(Object.values(state.players).map((p) => [p.playerId, p.score]));
  const byOption = new Map(bluff.options.map((o) => [o.id, o]));

  for (const [voterId, optionId] of Object.entries(bluff.votes)) {
    const option = byOption.get(optionId);
    if (!option) continue;
    if (option.authorId === null) {
      scores[voterId] = (scores[voterId] ?? 0) + BLUFF_POINTS_FOUND;
    } else if (option.authorId !== voterId) {
      // You can't score off your own lie.
      scores[option.authorId] = (scores[option.authorId] ?? 0) + BLUFF_POINTS_FOOLED;
    }
  }

  const players = Object.fromEntries(
    Object.entries(state.players).map(([id, p]) => [id, { ...p, score: scores[id] ?? p.score }]),
  );
  return { ...state, players, phase: "BLUFF_REVEAL", phaseDeadlineTs: now + BLUFF_REVEAL_DURATION_MS };
}

// ---------- Duel round ----------

function resolveDuel(state: GameState, now: number): GameState {
  const duel = state.duel!;
  const [a, b] = duel.contestants;
  const countA = duel.found[a]?.length ?? 0;
  const countB = duel.found[b]?.length ?? 0;
  const winner = countA === countB ? null : countA > countB ? a : b;

  const scores = Object.fromEntries(Object.values(state.players).map((p) => [p.playerId, p.score]));
  if (winner) {
    scores[winner] = (scores[winner] ?? 0) + DUEL_POINTS_WINNER;
    for (const [spectatorId, backed] of Object.entries(duel.predictions)) {
      if (backed === winner) scores[spectatorId] = (scores[spectatorId] ?? 0) + DUEL_POINTS_PREDICTED;
    }
  }

  const players = Object.fromEntries(
    Object.entries(state.players).map(([id, p]) => [id, { ...p, score: scores[id] ?? p.score }]),
  );
  return { ...state, players, phase: "DUEL_REVEAL", phaseDeadlineTs: now + DUEL_REVEAL_DURATION_MS };
}

/** Enters the deck slot at `index`: a trivia QUESTION, a chain round, or HOST_REVIEW past the end.
 *  Chain slots are skipped (recursively) if too few players are connected to run one. */
function startDeckSlot(state: GameState, index: number, now: number): GameState {
  if (index >= state.deck.length) {
    return { ...state, phase: "HOST_REVIEW", deckIndex: index, ...CLEARED, phaseDeadlineTs: null };
  }
  const item = state.deck[index];
  if (!item) return startDeckSlot(state, index + 1, now); // defensive: a malformed deck slot
  const base = { ...state, deckIndex: index, answers: [], ...CLEARED };
  const participants = connectedPlayers(state);

  if (item.kind === "trivia") {
    return { ...base, phase: "QUESTION", phaseDeadlineTs: now + state.settings.questionDurationSec * 1000 };
  }

  if (item.kind === "bluff") {
    // Below the minimum there aren't enough lies to hide the real answer among.
    if (participants.length < BLUFF_MIN_PLAYERS) return startDeckSlot(state, index + 1, now);
    return {
      ...base,
      phase: "BLUFF_WRITE",
      bluff: { fakes: {}, options: [], votes: {} },
      phaseDeadlineTs: now + BLUFF_WRITE_DURATION_MS,
    };
  }

  if (item.kind === "duel") {
    // Two contestants and at least one spectator, otherwise the predictions are empty.
    if (participants.length < DUEL_MIN_PLAYERS) return startDeckSlot(state, index + 1, now);
    // Whoever has duelled least often goes first, so the same two don't get picked all game.
    const ranked = [...participants].sort((a, b) => a.duels - b.duels || Math.random() - 0.5);
    const contestants: [string, string] = [ranked[0]!.playerId, ranked[1]!.playerId];
    const players = { ...state.players };
    for (const id of contestants) players[id] = { ...players[id]!, duels: players[id]!.duels + 1 };
    return {
      ...base,
      players,
      phase: "DUEL_PREDICT",
      duel: { contestants, predictions: {}, found: {}, attempts: {} },
      phaseDeadlineTs: now + DUEL_PREDICT_DURATION_MS,
    };
  }

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

/** Every special-round slate wiped, so a slot never inherits the previous one's state. */
const CLEARED = { chain: null, bluff: null, duel: null } as const;

/** The question attached to the slot currently in play, whatever kind it is. */
function currentQuestion(state: GameState): InternalQuestion | null {
  const item = state.deck[state.deckIndex];
  if (!item) return null;
  return item.kind === "chain" ? null : item.question;
}

function advancePastBluffWrite(state: GameState, now: number): GameState {
  const question = currentQuestion(state);
  if (!question) return state;
  const options = buildBluffOptions(question, state.bluff!.fakes);
  return {
    ...state,
    bluff: { ...state.bluff!, options },
    phase: "BLUFF_VOTE",
    phaseDeadlineTs: now + BLUFF_VOTE_DURATION_MS,
  };
}

/** Moves on to the next deck slot (or HOST_REVIEW), with no scoreboard/reveal interlude. */
function advanceDeck(state: GameState, now: number): GameState {
  return startDeckSlot(state, state.deckIndex + 1, now);
}

/** The first number in a free-text answer, or null if there isn't one. */
function parseNumber(raw: string): number | null {
  const match = raw
    .replace(/\s/g, "")
    .replace(/,/g, ".")
    .match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

/**
 * Scores a "closest wins" question the moment it closes.
 *
 * Exact hits score more than merely-closest, and a tie splits nothing — everyone equally
 * close scores. Anyone who wrote no number at all simply doesn't place.
 */
function scoreNumericQuestion(state: GameState, question: InternalQuestion): GameState {
  const target = parseNumber(question.answer);
  if (target === null) return state;

  const distances = state.answers
    .map((a) => ({ playerId: a.playerId, value: parseNumber(a.raw) }))
    .filter((a): a is { playerId: string; value: number } => a.value !== null)
    .map((a) => ({ playerId: a.playerId, gap: Math.abs(a.value - target) }));
  if (distances.length === 0) return state;

  const best = Math.min(...distances.map((d) => d.gap));
  const scores = Object.fromEntries(Object.values(state.players).map((p) => [p.playerId, p.score]));
  for (const { playerId, gap } of distances) {
    if (gap !== best) continue;
    scores[playerId] = (scores[playerId] ?? 0) + (gap === 0 ? NUMERIC_POINTS_EXACT : NUMERIC_POINTS_CLOSEST);
  }

  const players = Object.fromEntries(
    Object.entries(state.players).map(([id, p]) => [id, { ...p, score: scores[id] ?? p.score }]),
  );
  return { ...state, players };
}

/**
 * Archives the current question's answers for the end-of-game review, then advances.
 *
 * A "closest wins" question is settled here instead and kept out of the review: it has an
 * objective answer, so putting it in front of the host would be asking them to rubber-stamp
 * arithmetic.
 */
function logAnswersAndAdvance(state: GameState, now: number): GameState {
  const question = currentQuestion(state);
  if (question?.answerKind === "number") {
    return advanceDeck(scoreNumericQuestion(state, question), now);
  }
  const answerLog =
    state.answers.length > 0 ? { ...state.answerLog, [state.deckIndex]: state.answers } : state.answerLog;
  return advanceDeck({ ...state, answerLog }, now);
}

/**
 * Re-evaluates the current step now that the roster changed. Without this, a round whose
 * last outstanding player disconnects sits there until its timer expires, even though
 * everyone still in the room is done.
 */
/** True once every connected player has an entry — the usual "waiting on the room" test. */
function allConnectedHaveKeys(state: GameState, entries: Record<string, unknown>): boolean {
  const eligible = connectedPlayers(state);
  if (eligible.length === 0) return false;
  return eligible.every((p) => entries[p.playerId] !== undefined);
}

/** Contestants don't predict, so only the spectators are waited on. */
function allSpectatorsPredicted(state: GameState): boolean {
  const duel = state.duel;
  if (!duel) return false;
  const spectators = connectedPlayers(state).filter((p) => !duel.contestants.includes(p.playerId));
  if (spectators.length === 0) return true;
  return spectators.every((p) => duel.predictions[p.playerId] !== undefined);
}

function advanceIfStepComplete(state: GameState, now: number): GameState {
  // Only when someone is still around: an empty room shouldn't burn through phases.
  if (connectedPlayers(state).length === 0) return state;
  if (state.phase === "QUESTION") {
    return allConnectedAnswered(state) ? logAnswersAndAdvance(state, now) : state;
  }
  const special = advanceIfSpecialComplete(state, now);
  if (special !== state) return special;
  if (!state.chain) return state;
  if (state.phase === "CHAIN_PROMPT") {
    return allChainStepDone(state, state.chain.prompts, 0) ? advancePastChainPrompt(state, now) : state;
  }
  if (state.phase === "CHAIN_DRAW") {
    return allChainStepDone(state, state.chain.drawings, 1) ? advancePastChainDraw(state, now) : state;
  }
  if (state.phase === "CHAIN_GUESS") {
    return allChainStepDone(state, state.chain.guesses, 2) ? advancePastChainGuess(state, now) : state;
  }
  return state;
}

/** The same roster re-check for the rounds that wait on everyone. */
function advanceIfSpecialComplete(state: GameState, now: number): GameState {
  if (connectedPlayers(state).length === 0) return state;
  if (state.phase === "BLUFF_WRITE" && state.bluff) {
    return allConnectedHaveKeys(state, state.bluff.fakes) ? advancePastBluffWrite(state, now) : state;
  }
  if (state.phase === "BLUFF_VOTE" && state.bluff) {
    return allConnectedHaveKeys(state, state.bluff.votes) ? resolveBluff(state, now) : state;
  }
  if (state.phase === "DUEL_PREDICT" && state.duel) {
    return allSpectatorsPredicted(state)
      ? { ...state, phase: "DUEL_ANSWER", phaseDeadlineTs: now + DUEL_ANSWER_DURATION_MS }
      : state;
  }
  return state;
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
    answerLog: {},
    grades: {},
    chain: null,
    bluff: null,
    duel: null,
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
          duels: 0,
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
      next = advanceIfStepComplete({ ...state, players, hostPlayerId }, event.now);
      break;
    }

    case "HOST_KICK": {
      if (event.playerId !== state.hostPlayerId) break;
      if (!state.players[event.targetId]) break;
      const { [event.targetId]: _removed, ...rest } = state.players;
      // Removing them from the state isn't enough: their socket would still be open and a
      // fresh HELLO would walk them straight back in as a new player.
      effects.push({ kind: "CLOSE_PLAYER_SOCKETS", playerId: event.targetId, reason: "kicked" });
      let hostPlayerId = state.hostPlayerId;
      if (event.targetId === state.hostPlayerId) {
        // The host kicked themselves — hand the room over instead of leaving hostPlayerId
        // pointing at someone who no longer exists (nobody could start or end the game).
        const successor = oldestConnected({ ...state, players: rest });
        hostPlayerId = successor?.playerId ?? "";
        if (successor) rest[successor.playerId] = { ...successor, isHost: true };
      }
      next = advanceIfStepComplete({ ...state, players: rest, hostPlayerId }, event.now);
      break;
    }

    case "HOST_SETTINGS": {
      if (event.playerId !== state.hostPlayerId || state.phase !== "LOBBY") break;
      next = { ...state, settings: clampSettings(event.settings, state.settings) };
      break;
    }

    case "START_GAME": {
      if (event.playerId !== state.hostPlayerId || state.phase !== "LOBBY") break;
      if (event.deck.length === 0) {
        // Empty bank or a theme filter that matches nothing — say so instead of starting
        // a game with no questions in it.
        effects.push({
          kind: "SEND_ERROR",
          playerId: event.playerId,
          message: "Aucune question disponible pour ces thèmes.",
        });
        break;
      }
      next = startDeckSlot({ ...state, deck: event.deck }, 0, event.now);
      break;
    }

    case "SUBMIT_ANSWER": {
      if (state.phase !== "QUESTION") break;
      const item = state.deck[state.deckIndex];
      const question = item?.kind === "trivia" ? item.question : null;
      if (!question || question.id !== event.questionId) break;
      const player = state.players[event.playerId];
      if (!player || !player.connected) break;
      if (state.answers.some((a) => a.playerId === event.playerId)) break; // locked

      effects.push({ kind: "SEND_ANSWER_RECEIVED", playerId: event.playerId });
      next = {
        ...state,
        answers: [...state.answers, { playerId: event.playerId, raw: event.raw, submittedAt: event.now }],
      };

      if (allConnectedAnswered(next)) {
        next = logAnswersAndAdvance(next, event.now);
      }
      break;
    }

    case "SUBMIT_HOST_GRADE": {
      if (state.phase !== "HOST_REVIEW" || event.playerId !== state.hostPlayerId) break;
      const answered = state.answerLog[event.deckIndex]?.some((a) => a.playerId === event.targetPlayerId);
      if (!answered) break;
      const key = `${event.deckIndex}:${event.targetPlayerId}`;
      const previousGrade: Grade = state.grades[key] ?? 0;
      const target = state.players[event.targetPlayerId];
      if (!target) break;
      next = {
        ...state,
        grades: { ...state.grades, [key]: event.grade },
        players: {
          ...state.players,
          [event.targetPlayerId]: { ...target, score: target.score - previousGrade + event.grade },
        },
      };
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
      const chain = { ...state.chain, drawings: { ...state.chain.drawings, [origin]: true } };
      next = { ...state, chain };
      effects.push({ kind: "STORE_CHAIN_DRAWING", originId: origin, dataUrl: event.dataUrl });
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

    case "SUBMIT_BLUFF": {
      if (state.phase !== "BLUFF_WRITE" || !state.bluff) break;
      if (!state.players[event.playerId]?.connected) break;
      if (state.bluff.fakes[event.playerId] !== undefined) break; // locked
      const bluff = { ...state.bluff, fakes: { ...state.bluff.fakes, [event.playerId]: event.text } };
      next = { ...state, bluff };
      effects.push({ kind: "SEND_ANSWER_RECEIVED", playerId: event.playerId });
      if (allConnectedHaveKeys(next, bluff.fakes)) next = advancePastBluffWrite(next, event.now);
      break;
    }

    case "SUBMIT_BLUFF_VOTE": {
      if (state.phase !== "BLUFF_VOTE" || !state.bluff) break;
      if (!state.players[event.playerId]?.connected) break;
      if (state.bluff.votes[event.playerId] !== undefined) break; // locked
      const option = state.bluff.options.find((o) => o.id === event.optionId);
      // Voting for your own lie would be free points; there is nothing to work out.
      if (!option || option.authorId === event.playerId) break;
      const bluff = { ...state.bluff, votes: { ...state.bluff.votes, [event.playerId]: event.optionId } };
      next = { ...state, bluff };
      effects.push({ kind: "SEND_ANSWER_RECEIVED", playerId: event.playerId });
      if (allConnectedHaveKeys(next, bluff.votes)) next = resolveBluff(next, event.now);
      break;
    }

    case "SUBMIT_DUEL_PREDICTION": {
      if (state.phase !== "DUEL_PREDICT" || !state.duel) break;
      if (!state.players[event.playerId]?.connected) break;
      // Contestants don't get to bet on themselves.
      if (state.duel.contestants.includes(event.playerId)) break;
      if (!state.duel.contestants.includes(event.targetId)) break;
      if (state.duel.predictions[event.playerId] !== undefined) break; // locked
      const duel = { ...state.duel, predictions: { ...state.duel.predictions, [event.playerId]: event.targetId } };
      next = { ...state, duel };
      effects.push({ kind: "SEND_ANSWER_RECEIVED", playerId: event.playerId });
      if (allSpectatorsPredicted(next)) {
        next = { ...next, phase: "DUEL_ANSWER", phaseDeadlineTs: event.now + DUEL_ANSWER_DURATION_MS };
      }
      break;
    }

    case "SUBMIT_DUEL_ANSWER": {
      if (state.phase !== "DUEL_ANSWER" || !state.duel) break;
      if (!state.duel.contestants.includes(event.playerId)) break;
      const question = currentQuestion(state);
      if (!question) break;

      const attempts = [...(state.duel.attempts[event.playerId] ?? []), event.text];
      const found = [...(state.duel.found[event.playerId] ?? [])];
      const guess = normalizeAnswer(event.text);
      const accepted = acceptedAnswers(question);
      // Counted once each: repeating a hit shouldn't inflate the score.
      const alreadyFound = new Set(found.map(normalizeAnswer));
      if (guess.length > 0 && accepted.includes(guess) && !alreadyFound.has(guess)) found.push(event.text);

      next = {
        ...state,
        duel: {
          ...state.duel,
          attempts: { ...state.duel.attempts, [event.playerId]: attempts },
          found: { ...state.duel.found, [event.playerId]: found },
        },
      };
      // A contestant who has named everything ends the round early for both.
      if (found.length >= accepted.length) next = resolveDuel(next, event.now);
      break;
    }

    case "HOST_NEXT": {
      if (event.playerId !== state.hostPlayerId) break;
      if (state.phase === "CHAIN_REVEAL" || state.phase === "BLUFF_REVEAL" || state.phase === "DUEL_REVEAL") {
        next = advanceDeck(state, event.now);
      } else if (state.phase === "HOST_REVIEW") {
        next = { ...state, phase: "FINISHED", phaseDeadlineTs: null };
      }
      break;
    }

    case "PLAY_AGAIN": {
      if (event.playerId !== state.hostPlayerId || state.phase !== "FINISHED") break;
      const players = Object.fromEntries(
        Object.entries(state.players).map(([id, p]) => [id, { ...p, score: 0, duels: 0 }]),
      );
      next = {
        ...state,
        phase: "LOBBY",
        players,
        deck: [],
        deckIndex: -1,
        answers: [],
        answerLog: {},
        grades: {},
        chain: null,
        bluff: null,
        duel: null,
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
    if (state.chain !== null && next.chain === null) {
      effects.push({ kind: "CLEAR_CHAIN_DRAWINGS" });
    }
    if (next.phase === "FINISHED" && state.phase !== "FINISHED") {
      effects.push({ kind: "SET_CODE_EXPIRY", expiresAt: next.lastActivityAt + CODE_RELEASE_DELAY_MS });
    }
  }

  return { state: next, effects };
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
      next = logAnswersAndAdvance(next, now);
    } else if (next.phase === "CHAIN_PROMPT") {
      next = advancePastChainPrompt(next, now);
    } else if (next.phase === "CHAIN_DRAW") {
      next = advancePastChainDraw(next, now);
    } else if (next.phase === "CHAIN_GUESS") {
      next = advancePastChainGuess(next, now);
    } else if (next.phase === "CHAIN_REVEAL") {
      next = advanceDeck(next, now);
    } else if (next.phase === "BLUFF_WRITE") {
      next = advancePastBluffWrite(next, now);
    } else if (next.phase === "BLUFF_VOTE") {
      next = resolveBluff(next, now);
    } else if (next.phase === "BLUFF_REVEAL") {
      next = advanceDeck(next, now);
    } else if (next.phase === "DUEL_PREDICT") {
      next = { ...next, phase: "DUEL_ANSWER", phaseDeadlineTs: now + DUEL_ANSWER_DURATION_MS };
    } else if (next.phase === "DUEL_ANSWER") {
      next = resolveDuel(next, now);
    } else if (next.phase === "DUEL_REVEAL") {
      next = advanceDeck(next, now);
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
  // Including FINISHED: a room nobody ever came back to still has to be swept, otherwise
  // its storage lives forever with no alarm left to collect it.
  if (connectedPlayers(state).length === 0) {
    candidates.push(state.lastActivityAt + ROOM_IDLE_TIMEOUT_MS);
  }
  return candidates.length > 0 ? Math.min(...candidates) : null;
}
