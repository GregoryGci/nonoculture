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

export interface GameState {
  roomCode: string;
  phase: Phase;
  settings: GameSettings;
  players: Record<string, InternalPlayer>;
  hostPlayerId: string;
  questions: InternalQuestion[]; // the drawn deck for this game, in play order
  questionIndex: number; // -1 before first question
  answers: SubmittedAnswer[]; // answers for the *current* question only, cleared each QUESTION
  greyZoneQueue: string[]; // playerIds pending judgement, current question only
  currentJudging: { playerId: string; votes: Record<string, JudgeVote> } | null;
  phaseDeadlineTs: number | null;
  createdAt: number;
  lastActivityAt: number;
}

export type GameEvent =
  | { kind: "PLAYER_JOIN"; playerId: string; playerToken: string; roomCode: string; now: number }
  | { kind: "PLAYER_DISCONNECT"; playerId: string; now: number }
  | { kind: "SET_PROFILE"; playerId: string; nickname: string; avatar: string }
  | { kind: "HOST_SETTINGS"; playerId: string; settings: Partial<GameSettings> }
  | { kind: "START_GAME"; playerId: string; now: number; questions: InternalQuestion[] }
  | { kind: "SUBMIT_ANSWER"; playerId: string; questionId: number; raw: string; now: number }
  | { kind: "CAST_JUDGE_VOTE"; playerId: string; vote: "valid" | "invalid"; now: number }
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
