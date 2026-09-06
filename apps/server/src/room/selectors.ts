import { classifyAnswer, pointsForDifficulty } from "@quiproquo/shared";
import type {
  ChainResult,
  ChainTask,
  JudgePromptItem,
  PlayerPublic,
  QuestionPublic,
  RevealedAnswer,
  RoomStateSync,
} from "@quiproquo/shared";
import { originForRole } from "./state-machine.js";
import { CHAIN_POINTS } from "./types.js";
import type { GameState, InternalQuestion } from "./types.js";

const REVEAL_VISIBLE_PHASES = new Set(["REVEAL", "JUDGING", "SCOREBOARD"]);

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

  const nextQuestion = triviaAt(state, state.deckIndex + 1);
  const nextQuestionMedia =
    state.phase === "SCOREBOARD" && nextQuestion?.mediaKey
      ? { type: nextQuestion.type, url: resolveMediaUrl(nextQuestion.mediaKey) }
      : null;

  const nicknameOf = (playerId: string) => state.players[playerId]?.nickname ?? "?";

  const revealedAnswers: RevealedAnswer[] | null = REVEAL_VISIBLE_PHASES.has(state.phase)
    ? state.answers.map((a) => ({
        playerId: a.playerId,
        nickname: nicknameOf(a.playerId),
        rawAnswer: a.raw,
        accepted: a.accepted,
        points: a.accepted ? pointsForDifficulty(question?.difficulty ?? 1) : 0,
      }))
    : null;

  const judgePrompt: JudgePromptItem | null =
    state.phase === "JUDGING" && state.currentJudging
      ? {
          answerId: state.currentJudging.playerId,
          playerId: state.currentJudging.playerId,
          nickname: nicknameOf(state.currentJudging.playerId),
          rawAnswer: state.answers.find((a) => a.playerId === state.currentJudging?.playerId)?.raw ?? "",
        }
      : null;

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
    revealedAnswers,
    revealedCorrectAnswer: REVEAL_VISIBLE_PHASES.has(state.phase) ? (question?.answer ?? null) : null,
    revealedExplanation: REVEAL_VISIBLE_PHASES.has(state.phase) ? (question?.explanation ?? null) : null,
    judgePrompt,
    chainTask: computeChainTask(state, forPlayerId),
    chainReveal: computeChainReveal(state, nicknameOf),
  };
}
