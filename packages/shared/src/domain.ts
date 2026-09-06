export const PHASES = [
  "LOBBY",
  "QUESTION",
  "CHAIN_PROMPT",
  "CHAIN_DRAW",
  "CHAIN_GUESS",
  "CHAIN_REVEAL",
  "HOST_REVIEW",
  "FINISHED",
] as const;

export type Phase = (typeof PHASES)[number];

export const QUESTION_TYPES = ["text", "image", "audio", "video"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/**
 * Hard ceiling on one chain drawing, as data-URL characters (~45 KB of image).
 * Every drawing of a round is broadcast inside STATE_SYNC and kept in the room's Durable
 * Object storage, so this is a budget, not just an anti-abuse check: the client compresses
 * to land far below it (see DrawingCanvas), and anything above is refused outright.
 */
export const MAX_DRAWING_DATA_URL_LENGTH = 60_000;

/**
 * A drawing round needs three links to work — one writes, the next draws, a third guesses.
 * With two players the guesser is the author, who already knows the answer, so the slot is
 * skipped. Shared because the client explains the rule and the server enforces it.
 */
export const CHAIN_MIN_PLAYERS = 3;

/** A manual grade the host assigns to one player's answer during HOST_REVIEW. */
export const GRADES = [0, 0.5, 1] as const;
export type Grade = (typeof GRADES)[number];

export interface GameSettings {
  questionCount: number; // 5-40
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
  avatar: string; // emoji, or an svg-avatar id (see apps/web/src/components/Avatar.tsx)
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

/** One player's answer to one trivia question, as graded (or not yet) by the host. */
export interface ReviewAnswer {
  playerId: string;
  nickname: string;
  raw: string;
  grade: Grade | null;
}

/** One trivia question and every answer given to it, for the host's end-of-game review pass. */
export interface ReviewQuestion {
  deckIndex: number;
  prompt: string;
  correctAnswer: string;
  explanation: string | null;
  answers: ReviewAnswer[];
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
  /** Set during QUESTION so the client can preload the next question's media in advance. */
  nextQuestionMedia: { type: QuestionType; url: string } | null;
  phaseDeadlineTs: number | null; // absolute server timestamp, null = no countdown
  youHaveAnswered: boolean;
  chainTask: ChainTask | null;
  chainReveal: ChainResult[] | null;
  /** Every trivia question and answer of the game, for the host's end-of-game review — set only during HOST_REVIEW. */
  reviewQuestions: ReviewQuestion[] | null;
}
