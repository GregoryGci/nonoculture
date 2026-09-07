export const PHASES = [
  "LOBBY",
  "QUESTION",
  "CHAIN_PROMPT",
  "CHAIN_DRAW",
  "CHAIN_GUESS",
  "CHAIN_REVEAL",
  "BLUFF_WRITE",
  "BLUFF_VOTE",
  "BLUFF_REVEAL",
  "DUEL_PREDICT",
  "DUEL_ANSWER",
  "DUEL_REVEAL",
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
  /** Special rounds in the deck. Each counts towards questionCount. */
  chainRounds: number;
  bluffRounds: number;
  duelRounds: number;
  /** Ordinary questions scored by proximity instead of by the host. */
  numericRounds: number;
  themes: string[]; // empty = all themes
}

export const MAX_CHAIN_ROUNDS = 6;
export const MAX_SPECIAL_ROUNDS = 6;

/** A bluff round needs enough fake answers to hide the real one among. */
export const BLUFF_MIN_PLAYERS = 3;
/** A duel needs two contestants and at least one spectator to make predictions worthwhile. */
export const DUEL_MIN_PLAYERS = 3;

/** Points awarded by the self-scoring rounds. */
export const BLUFF_POINTS_FOUND = 2; // you spotted the real answer
export const BLUFF_POINTS_FOOLED = 1; // per player your fake caught
export const DUEL_POINTS_WINNER = 3;
export const DUEL_POINTS_PREDICTED = 1; // spectators who called it
export const NUMERIC_POINTS_CLOSEST = 2;
export const NUMERIC_POINTS_EXACT = 3;

/** Theme ids the bank uses, with their display label. Shared so the settings screen and the
 *  question screen name a theme the same way. */
export const THEME_LABELS: Record<string, string> = {
  histoire: "Histoire",
  geo: "Géographie",
  sciences: "Sciences",
  cinema: "Cinéma",
  musique: "Musique",
  gaming: "Gaming",
  sport: "Sport",
  insolite: "Insolite",
  animaux: "Animaux",
  cuisine: "Cuisine",
  litterature: "Littérature",
  technologie: "Technologie",
  lol: "League of Legends",
  dofus: "Dofus",
  drapeaux: "Drapeaux",
};

export function themeLabel(id: string): string {
  return THEME_LABELS[id] ?? id;
}

export const DEFAULT_SETTINGS: GameSettings = {
  questionCount: 20,
  questionDurationSec: 20,
  chainRounds: 1,
  bluffRounds: 1,
  duelRounds: 1,
  numericRounds: 2,
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
  /** "number" means the closest answer wins and no host grading happens. */
  answerKind: "text" | "number" | "list";
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
/** What a player sees during a bluff round. */
export interface BluffView {
  step: "write" | "vote" | "reveal";
  prompt: string;
  /** During "write": whether you have already offered a lie. */
  submitted: boolean;
  /** During "vote" and "reveal": the shuffled options. Authors are withheld until reveal. */
  options: { id: string; text: string; authorNickname: string | null; isReal: boolean }[];
  /** The option you voted for, if any. */
  yourVote: string | null;
  /** During "reveal": who voted for what, and what it earned them. */
  results: { nickname: string; votedText: string; correct: boolean }[] | null;
}

/** What a player sees during a duel round. */
export interface DuelView {
  step: "predict" | "answer" | "reveal";
  prompt: string;
  contestants: { playerId: string; nickname: string; found: number }[];
  /** True when you are one of the two fighting. */
  youAreContestant: boolean;
  /** The contestant you backed, if you are a spectator who has called it. */
  yourPrediction: string | null;
  /** Your own accepted items, so a contestant can see what has landed. */
  yourFound: string[];
  /** During "reveal": each contestant's accepted items, and the winner. */
  reveal: { nickname: string; found: string[]; winner: boolean }[] | null;
  /** How many answers the question accepts in total, shown as a target. */
  acceptedTotal: number;
}

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
  bluff: BluffView | null;
  duel: DuelView | null;
  /** Every trivia question and answer of the game, for the host's end-of-game review — set only during HOST_REVIEW. */
  reviewQuestions: ReviewQuestion[] | null;
}
