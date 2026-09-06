import type { GameSettings, Phase, QuestionType } from "@quiproquo/shared";

/** Full question record as stored in D1 — includes the secret answer/aliases. */
export interface InternalQuestion {
  id: number;
  theme: string;
  difficulty: 1 | 2 | 3;
  type: QuestionType;
  prompt: string;
  mediaKey: string | null;
  answer: string;
  aliases: string[];
  explanation: string | null;
}

/** One slot in the game's deck: a regular trivia question, or a chain ("téléphone dessiné") round. */
export type DeckItem = { kind: "trivia"; question: InternalQuestion } | { kind: "chain" };

export interface InternalPlayer {
  playerId: string;
  playerToken: string;
  nickname: string;
  avatar: string;
  score: number;
  isHost: boolean;
  connected: boolean;
  joinedAt: number;
  disconnectedAt: number | null; // set when connected flips false; null while connected
}

export interface SubmittedAnswer {
  playerId: string;
  raw: string;
  submittedAt: number;
  classification: "auto_valid" | "auto_invalid" | "grey_zone";
  /** Final accepted/rejected state — set immediately for auto_valid/auto_invalid,
   *  set after the room vote (or host tie-break) for grey_zone. */
  accepted: boolean | null;
}

export interface JudgeVote {
  voterId: string;
  vote: "valid" | "invalid";
}

/** Snapshot of participants and their submissions for the chain round currently in play. */
export interface ChainRoundState {
  order: string[]; // playerIds, snapshotted when the round starts
  prompts: Record<string, string>; // originPlayerId -> prompt text
  drawings: Record<string, string>; // originPlayerId -> drawing data URL
  guesses: Record<string, string>; // originPlayerId -> guess text
}

export interface GameState {
  roomCode: string;
  phase: Phase;
  settings: GameSettings;
  players: Record<string, InternalPlayer>;
  hostPlayerId: string;
  deck: DeckItem[]; // the drawn deck for this game, in play order
  deckIndex: number; // -1 before the first slot
  answers: SubmittedAnswer[]; // answers for the *current* trivia question only
  greyZoneQueue: string[]; // playerIds pending judgement, current question only
  currentJudging: { playerId: string; votes: Record<string, JudgeVote> } | null;
  chain: ChainRoundState | null; // set only while playing a chain slot
  phaseDeadlineTs: number | null;
  createdAt: number;
  lastActivityAt: number;
}

export type GameEvent =
  | { kind: "PLAYER_JOIN"; playerId: string; playerToken: string; roomCode: string; now: number }
  | { kind: "PLAYER_DISCONNECT"; playerId: string; now: number }
  | { kind: "SET_PROFILE"; playerId: string; nickname: string; avatar: string }
  | { kind: "HOST_SETTINGS"; playerId: string; settings: Partial<GameSettings> }
  | { kind: "START_GAME"; playerId: string; now: number; deck: DeckItem[] }
  | { kind: "SUBMIT_ANSWER"; playerId: string; questionId: number; raw: string; now: number }
  | { kind: "CAST_JUDGE_VOTE"; playerId: string; vote: "valid" | "invalid"; now: number }
  | { kind: "SUBMIT_CHAIN_PROMPT"; playerId: string; text: string; now: number }
  | { kind: "SUBMIT_CHAIN_DRAWING"; playerId: string; dataUrl: string; now: number }
  | { kind: "SUBMIT_CHAIN_GUESS"; playerId: string; text: string; now: number }
  | { kind: "HOST_NEXT"; playerId: string; now: number }
  | { kind: "HOST_KICK"; playerId: string; targetId: string }
  | { kind: "ALARM_FIRED"; now: number }
  | { kind: "PLAY_AGAIN"; playerId: string; now: number };

export type Effect =
  | { kind: "SET_CODE_EXPIRY"; expiresAt: number }
  | { kind: "DESTROY_ROOM" }
  | { kind: "SEND_ANSWER_RECEIVED"; playerId: string }
  | { kind: "SEND_ERROR"; playerId: string; message: string };

export const REVEAL_DURATION_MS = 6_000;
export const JUDGE_VOTE_DURATION_MS = 10_000;
export const SCOREBOARD_DURATION_MS = 5_000;
export const DISCONNECT_GRACE_MS = 5 * 60 * 1000;
export const ROOM_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const CODE_RELEASE_DELAY_MS = 30 * 60 * 1000;

export const CHAIN_MIN_PLAYERS = 3;
export const CHAIN_PROMPT_DURATION_MS = 30_000;
export const CHAIN_DRAW_DURATION_MS = 45_000;
export const CHAIN_GUESS_DURATION_MS = 30_000;
export const CHAIN_REVEAL_PER_ITEM_MS = 6_000;
export const CHAIN_POINTS = 2;
