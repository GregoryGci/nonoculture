import { classifyAnswer } from "@quiproquo/shared";
import type { ChainResult, ChainTask, PlayerPublic, QuestionPublic, ReviewQuestion, RoomStateSync } from "@quiproquo/shared";
import { originForRole } from "./state-machine.js";
import { CHAIN_POINTS } from "./types.js";
import type { GameState, InternalQuestion } from "./types.js";

function triviaAt(state: GameState, index: number): InternalQuestion | null {
  const item = state.deck[index];
  return item?.kind === "trivia" ? item.question : null;
}

function computeChainTask(state: GameState, forPlayerId: string): ChainTask | null {
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
      alreadySubmitted: origin ? drawings[origin] !== undefined : false,
    };
  }
  if (state.phase === "CHAIN_GUESS") {
    const origin = originForRole(order, forPlayerId, 2);
    return {
      role: "guess",
      content: origin ? (drawings[origin] ?? "") : null,
      alreadySubmitted: origin ? guesses[origin] !== undefined : false,
    };
  }
  return null;
}

function computeChainReveal(state: GameState, nicknameOf: (id: string) => string): ChainResult[] | null {
  if (state.phase !== "CHAIN_REVEAL" || !state.chain) return null;
  const { order, prompts, drawings, guesses } = state.chain;
  return order.map((originId, idx) => {
    const drawerId = order[(idx + 1) % order.length]!;
    const guesserId = order[(idx + 2) % order.length]!;
    const prompt = prompts[originId] ?? "";
    const guess = guesses[originId] ?? "";
    const matched = prompt.length > 0 && guess.length > 0 && classifyAnswer(guess, prompt).classification === "auto_valid";
    return {
      originPlayerId: originId,
      originNickname: nicknameOf(originId),
      prompt,
      drawerNickname: nicknameOf(drawerId),
      drawingDataUrl: drawings[originId] ?? "",
      guesserNickname: nicknameOf(guesserId),
      guess,
      matched,
      points: matched ? CHAIN_POINTS : 0,
    };
  });
}

function computeReviewQuestions(state: GameState, nicknameOf: (id: string) => string): ReviewQuestion[] | null {
  if (state.phase !== "HOST_REVIEW") return null;
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
    chainTask: computeChainTask(state, forPlayerId),
    chainReveal: computeChainReveal(state, nicknameOf),
    reviewQuestions: computeReviewQuestions(state, nicknameOf),
  };
}
