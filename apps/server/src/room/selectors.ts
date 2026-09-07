import { isChainMatch, normalizeAnswer } from "@nonoculture/shared";
import type {
  BluffView,
  ChainResult,
  ChainTask,
  DuelView,
  PlayerPublic,
  QuestionPublic,
  ReviewQuestion,
  RoomStateSync,
} from "@nonoculture/shared";
import { originForRole } from "./state-machine.js";
import { CHAIN_POINTS } from "./types.js";
import type { GameState, InternalQuestion } from "./types.js";

function triviaAt(state: GameState, index: number): InternalQuestion | null {
  const item = state.deck[index];
  return item?.kind === "trivia" ? item.question : null;
}

/** The question behind whichever slot is in play, trivia or special. */
function questionAt(state: GameState, index: number): InternalQuestion | null {
  const item = state.deck[index];
  if (!item || item.kind === "chain") return null;
  return item.question;
}

/**
 * The bluff round as one player sees it.
 *
 * Authorship is withheld until the reveal — sending it during the vote would put the answer
 * in the network inspector, which is the whole game.
 */
function computeBluff(state: GameState, forPlayerId: string, nicknameOf: (id: string) => string): BluffView | null {
  const bluff = state.bluff;
  const question = questionAt(state, state.deckIndex);
  if (!bluff || !question) return null;
  const step =
    state.phase === "BLUFF_WRITE"
      ? "write"
      : state.phase === "BLUFF_VOTE"
        ? "vote"
        : state.phase === "BLUFF_REVEAL"
          ? "reveal"
          : null;
  if (!step) return null;

  const revealing = step === "reveal";
  const options = (step === "write" ? [] : bluff.options).map((o) => ({
    id: o.id,
    text: o.text,
    authorNickname: revealing && o.authorId ? nicknameOf(o.authorId) : null,
    isReal: revealing ? o.authorId === null : false,
  }));

  const byOption = new Map(bluff.options.map((o) => [o.id, o]));
  const results = revealing
    ? Object.entries(bluff.votes).map(([voterId, optionId]) => ({
        nickname: nicknameOf(voterId),
        votedText: byOption.get(optionId)?.text ?? "—",
        correct: byOption.get(optionId)?.authorId === null,
      }))
    : null;

  return {
    step,
    prompt: question.prompt,
    submitted: bluff.fakes[forPlayerId] !== undefined,
    options,
    yourVote: bluff.votes[forPlayerId] ?? null,
    results,
  };
}

/** The duel as one player sees it — contestants see their own hits, nobody sees the other's. */
function computeDuel(state: GameState, forPlayerId: string, nicknameOf: (id: string) => string): DuelView | null {
  const duel = state.duel;
  const question = questionAt(state, state.deckIndex);
  if (!duel || !question) return null;
  const step =
    state.phase === "DUEL_PREDICT"
      ? "predict"
      : state.phase === "DUEL_ANSWER"
        ? "answer"
        : state.phase === "DUEL_REVEAL"
          ? "reveal"
          : null;
  if (!step) return null;

  const accepted = [question.answer, ...question.aliases].filter((a) => normalizeAnswer(a).length > 0);
  const counts = duel.contestants.map((id) => ({
    playerId: id,
    nickname: nicknameOf(id),
    found: duel.found[id]?.length ?? 0,
  }));

  const [a, b] = duel.contestants;
  const winner =
    (duel.found[a]?.length ?? 0) === (duel.found[b]?.length ?? 0)
      ? null
      : (duel.found[a]?.length ?? 0) > (duel.found[b]?.length ?? 0)
        ? a
        : b;

  return {
    step,
    prompt: question.prompt,
    contestants: counts,
    youAreContestant: duel.contestants.includes(forPlayerId),
    yourPrediction: duel.predictions[forPlayerId] ?? null,
    yourFound: duel.found[forPlayerId] ?? [],
    reveal:
      step === "reveal"
        ? duel.contestants.map((id) => ({
            nickname: nicknameOf(id),
            found: duel.found[id] ?? [],
            winner: id === winner,
          }))
        : null,
    acceptedTotal: accepted.length,
  };
}

/** Looks up a chain drawing's data URL — the bytes live outside GameState (see ChainRoundState). */
export type DrawingResolver = (originPlayerId: string) => string;

function computeChainTask(state: GameState, forPlayerId: string, resolveDrawing: DrawingResolver): ChainTask | null {
  if (!state.chain || !state.chain.order.includes(forPlayerId)) return null;
  const { order, prompts, drawings, guesses } = state.chain;

  if (state.phase === "CHAIN_PROMPT") {
    return { role: "prompt", content: null, alreadySubmitted: prompts[forPlayerId] !== undefined };
  }
  if (state.phase === "CHAIN_DRAW") {
    const origin = originForRole(order, forPlayerId, 1);
    return {
      role: "draw",
      content: origin ? (prompts[origin] ?? "") : null,
      alreadySubmitted: origin ? drawings[origin] === true : false,
    };
  }
  if (state.phase === "CHAIN_GUESS") {
    const origin = originForRole(order, forPlayerId, 2);
    return {
      role: "guess",
      content: origin ? resolveDrawing(origin) : null,
      alreadySubmitted: origin ? guesses[origin] !== undefined : false,
    };
  }
  return null;
}

function computeChainReveal(
  state: GameState,
  nicknameOf: (id: string) => string,
  resolveDrawing: DrawingResolver,
): ChainResult[] | null {
  if (state.phase !== "CHAIN_REVEAL" || !state.chain) return null;
  const { order, prompts, guesses } = state.chain;
  return order.map((originId, idx) => {
    const drawerId = order[(idx + 1) % order.length]!;
    const guesserId = order[(idx + 2) % order.length]!;
    const prompt = prompts[originId] ?? "";
    const guess = guesses[originId] ?? "";
    const matched = isChainMatch(guess, prompt);
    return {
      originPlayerId: originId,
      originNickname: nicknameOf(originId),
      prompt,
      drawerNickname: nicknameOf(drawerId),
      drawingDataUrl: resolveDrawing(originId),
      guesserNickname: nicknameOf(guesserId),
      guess,
      matched,
      points: matched ? CHAIN_POINTS : 0,
    };
  });
}

/**
 * The grading list, for the host alone.
 *
 * Everyone used to receive it so the room could follow along, but players now wait on the
 * podium instead, and shipping every answer to a client that never displays them only puts
 * them in reach of the network inspector.
 */
function computeReviewQuestions(
  state: GameState,
  forPlayerId: string,
  nicknameOf: (id: string) => string,
): ReviewQuestion[] | null {
  if (state.phase !== "HOST_REVIEW" || forPlayerId !== state.hostPlayerId) return null;
  return Object.entries(state.answerLog)
    .map(([deckIndexStr, answers]) => {
      const deckIndex = Number(deckIndexStr);
      const question = triviaAt(state, deckIndex);
      return {
        deckIndex,
        prompt: question?.prompt ?? "",
        correctAnswer: question?.answer ?? "",
        explanation: question?.explanation ?? null,
        answers: answers.map((a) => ({
          playerId: a.playerId,
          nickname: nicknameOf(a.playerId),
          raw: a.raw,
          grade: state.grades[`${deckIndex}:${a.playerId}`] ?? null,
        })),
      };
    })
    .sort((a, b) => a.deckIndex - b.deckIndex);
}

export function buildStateSync(
  state: GameState,
  forPlayerId: string,
  resolveMediaUrl: (mediaKey: string) => string = () => "",
  resolveDrawing: DrawingResolver = () => "",
): RoomStateSync {
  const players: PlayerPublic[] = Object.values(state.players)
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map((p) => ({
      playerId: p.playerId,
      nickname: p.nickname,
      avatar: p.avatar,
      score: p.score,
      connected: p.connected,
      isHost: p.isHost,
      hasAnswered: state.answers.some((a) => a.playerId === p.playerId),
    }));

  const question = triviaAt(state, state.deckIndex);
  const currentQuestion: QuestionPublic | null = question
    ? {
        id: question.id,
        theme: question.theme,
        difficulty: question.difficulty,
        type: question.type,
        prompt: question.prompt,
        mediaUrl: question.mediaKey ? resolveMediaUrl(question.mediaKey) : null,
        answerKind: question.answerKind,
      }
    : null;

  // Preloaded while the current question is on screen, so it's already cached by the time we advance.
  const nextQuestion = triviaAt(state, state.deckIndex + 1);
  const nextQuestionMedia =
    state.phase === "QUESTION" && nextQuestion?.mediaKey
      ? { type: nextQuestion.type, url: resolveMediaUrl(nextQuestion.mediaKey) }
      : null;

  const nicknameOf = (playerId: string) => state.players[playerId]?.nickname ?? "?";

  return {
    roomCode: state.roomCode,
    phase: state.phase,
    settings: state.settings,
    players,
    hostPlayerId: state.hostPlayerId,
    questionIndex: state.deckIndex,
    questionTotal: state.deck.length,
    currentQuestion,
    nextQuestionMedia,
    phaseDeadlineTs: state.phaseDeadlineTs,
    youHaveAnswered: state.answers.some((a) => a.playerId === forPlayerId),
    chainTask: computeChainTask(state, forPlayerId, resolveDrawing),
    chainReveal: computeChainReveal(state, nicknameOf, resolveDrawing),
    bluff: computeBluff(state, forPlayerId, nicknameOf),
    duel: computeDuel(state, forPlayerId, nicknameOf),
    reviewQuestions: computeReviewQuestions(state, forPlayerId, nicknameOf),
  };
}
