export const PHASES = [
  "LOBBY",
  "QUESTION",
  "REVEAL",
  "JUDGING",
  "SCOREBOARD",
  "CHAIN_PROMPT",
  "CHAIN_DRAW",
  "CHAIN_GUESS",
  "CHAIN_REVEAL",
  "FINISHED",
] as const;

export type Phase = (typeof PHASES)[number];

export const QUESTION_TYPES = ["text", "image", "audio", "video"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export interface GameSettings {
  questionCount: number; // 20-40
  questionDurationSec: number; // 15-30
  themes: string[]; // empty = all themes
}

export const DEFAULT_SETTINGS: GameSettings = {
  questionCount: 20,
  questionDurationSec: 20,
  themes: [],
};

export interface PlayerPublic {
  playerId: string;
  nickname: string;
  avatar: string; // emoji, or an svg-avatar id (see packages/shared/src/avatars.ts)
  score: number;
  connected: boolean;
  isHost: boolean;
  hasAnswered: boolean; // only meaningful during QUESTION, never reveals content
}

/** Question shape sent to clients during QUESTION — never includes the answer. */
export interface QuestionPublic {
  id: number;
  theme: string;
  difficulty: 1 | 2 | 3;
  type: QuestionType;
  prompt: string;
  mediaUrl: string | null;
}

export interface RevealedAnswer {
  playerId: string;
  nickname: string;
  rawAnswer: string;
  /** null while a grey-zone answer is still awaiting the room's JUDGING vote. */
  accepted: boolean | null;
  points: number;
}

export interface JudgePromptItem {
  answerId: string;
  playerId: string;
  nickname: string;
  rawAnswer: string;
}

/**
 * What the current player must do right now during a chain ("téléphone dessiné") round.
 * `content` is what was handed to them by the previous link in the chain — null for the
 * "prompt" role, which originates the chain instead of continuing it.
 */
export interface ChainTask {
  role: "prompt" | "draw" | "guess";
  content: string | null;
  alreadySubmitted: boolean;
}

/** One fully-resolved chain, shown to everyone during CHAIN_REVEAL. */
export interface ChainResult {
  originPlayerId: string;
  originNickname: string;
  prompt: string;
  drawerNickname: string;
  drawingDataUrl: string;
  guesserNickname: string;
  guess: string;
  matched: boolean;
  points: number;
}

/**
 * The full state a client needs to render itself from scratch — sent as STATE_SYNC.
 * No client-side guessing allowed: everything visible must be derivable from this alone.
 */
export interface RoomStateSync {
  roomCode: string;
  phase: Phase;
  settings: GameSettings;
  players: PlayerPublic[];
  hostPlayerId: string;
  questionIndex: number; // 0-based index into the full deck (trivia + chain slots)
  questionTotal: number;
  currentQuestion: QuestionPublic | null;
  /** Set only during SCOREBOARD so the client can preload the next question's media in advance. */
  nextQuestionMedia: { type: QuestionType; url: string } | null;
  phaseDeadlineTs: number | null; // absolute server timestamp, null = no countdown
  youHaveAnswered: boolean;
  revealedAnswers: RevealedAnswer[] | null;
  /** The expected answer text, shown from REVEAL onward for the question just played. */
  revealedCorrectAnswer: string | null;
  revealedExplanation: string | null;
  judgePrompt: JudgePromptItem | null;
  chainTask: ChainTask | null;
  chainReveal: ChainResult[] | null;
}
