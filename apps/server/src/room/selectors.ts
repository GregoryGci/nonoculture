import { pointsForDifficulty } from "@quiproquo/shared";
import type {
  JudgePromptItem,
  PlayerPublic,
  QuestionPublic,
  RevealedAnswer,
  RoomStateSync,
} from "@quiproquo/shared";
import type { GameState } from "./types.js";

const REVEAL_VISIBLE_PHASES = new Set(["REVEAL", "JUDGING", "SCOREBOARD"]);

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

  const question = state.questions[state.questionIndex] ?? null;
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
    questionIndex: state.questionIndex,
    questionTotal: state.questions.length,
    currentQuestion,
    phaseDeadlineTs: state.phaseDeadlineTs,
    youHaveAnswered: state.answers.some((a) => a.playerId === forPlayerId),
    revealedAnswers,
    judgePrompt,
  };
}
