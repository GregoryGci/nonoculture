import type { GameSettings, Grade, Phase, QuestionType } from "@nonoculture/shared";

/** Full question record as stored in D1 — includes the secret answer/aliases. */
export interface InternalQuestion {
  id: number;
  theme: string;
  /** Generator template it came from; null for hand-written questions. */
  family: string | null;
  /** How the answer is judged: by the host, by proximity, or by counting list hits. */
  answerKind: "text" | "number" | "list" | "math";
  difficulty: 1 | 2 | 3;
  type: QuestionType;
  prompt: string;
  mediaKey: string | null;
  answer: string;
  aliases: string[];
  explanation: string | null;
}

/** One slot in the game's deck. Each non-trivia kind runs its own little phase sequence. */
export type DeckItem =
  | { kind: "trivia"; question: InternalQuestion }
  | { kind: "chain" }
  | { kind: "bluff"; question: InternalQuestion }
  | { kind: "duel"; question: InternalQuestion }
  | { kind: "reflex" };

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
  /** Duels fought this game. Picking the least-duelled players spreads the spotlight. */
  duels: number;
}

export interface SubmittedAnswer {
  playerId: string;
  raw: string;
  submittedAt: number;
}

/** Snapshot of participants and their submissions for the chain round currently in play. */
export interface ChainRoundState {
  order: string[]; // playerIds, snapshotted when the round starts
  prompts: Record<string, string>; // originPlayerId -> prompt text
  /**
   * originPlayerId -> whether that link's drawing has been submitted. The image bytes
   * themselves are deliberately *not* here: GameState is serialised into a single DO
   * storage value on every phase transition, so carrying a handful of base64 images in
   * it would rewrite hundreds of kilobytes per submission and can blow past the
   * per-value storage limit outright. RoomDO keeps them in their own keys instead.
   */
  drawings: Record<string, boolean>;
  guesses: Record<string, string>; // originPlayerId -> guess text
}

/**
 * A bluff round. Players invent a plausible answer, then everyone votes on which of the
 * shuffled options is the real one — points for spotting it, and for every player fooled.
 */
export interface BluffRoundState {
  /** Fake answers, by their author. */
  fakes: Record<string, string>;
  /** What voters see: the real answer hidden among the fakes, in a fixed shuffled order.
   *  authorId is null for the real one. Never sent to the client with authorId attached. */
  options: { id: string; text: string; authorId: string | null }[];
  /** voterId -> option id they picked. */
  votes: Record<string, string>;
}

/**
 * A duel. Two contestants race to list as many valid items as they can ("citez des films de
 * Tarantino"); spectators call the winner beforehand. Entirely self-scored: the question
 * carries its own set of accepted answers.
 */
export interface DuelRoundState {
  contestants: [string, string];
  /** spectatorId -> the contestant they backed. */
  predictions: Record<string, string>;
  /** contestantId -> the distinct valid items they found, in order. */
  found: Record<string, string[]>;
  /** contestantId -> everything they typed, valid or not, for the reveal. */
  attempts: Record<string, string[]>;
}

/**
 * A reflex round in progress.
 *
 * `goTs` is the instant the screen turned green, set by the alarm handler and never sent to
 * a client before that moment — the whole round is worthless if anyone can see it coming.
 */
export interface ReflexRoundState {
  /**
   * When the screen will turn green. Never leaves the Durable Object: it is deliberately not
   * `phaseDeadlineTs`, because that field is broadcast, and a broadcast countdown is a
   * broadcast answer. `computeNextAlarmTs` reads it so the DO still wakes up on time.
   */
  goAtTs: number;
  goTs: number | null;
  /** playerId -> milliseconds after the green, as timed on arrival at the server. */
  times: Record<string, number>;
  /** Players who tapped while the screen was still red. Out for this round. */
  falseStarts: string[];
  /** playerId -> points awarded, filled in at the reveal. */
  points: Record<string, number>;
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
  /** Every trivia question's answers, keyed by deck index, kept for the end-of-game host review. */
  answerLog: Record<number, SubmittedAnswer[]>;
  /** Host-assigned grades, keyed by `${deckIndex}:${playerId}`. */
  grades: Record<string, Grade>;
  /**
   * Which review card the room is looking at.
   *
   * Server-side rather than local to the host's screen: the whole point of showing the
   * correction to everyone is that they follow along, and they cannot follow along if each
   * client paginates on its own.
   */
  reviewIndex: number;
  chain: ChainRoundState | null; // set only while playing a chain slot
  bluff: BluffRoundState | null; // set only while playing a bluff slot
  duel: DuelRoundState | null; // set only while playing a duel slot
  reflex: ReflexRoundState | null; // set only while playing a reflex slot
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
  | { kind: "SUBMIT_HOST_GRADE"; playerId: string; deckIndex: number; targetPlayerId: string; grade: Grade }
  | { kind: "HOST_REVIEW_GOTO"; playerId: string; index: number; now: number }
  | { kind: "SUBMIT_CHAIN_PROMPT"; playerId: string; text: string; now: number }
  | { kind: "SUBMIT_CHAIN_DRAWING"; playerId: string; dataUrl: string; now: number }
  | { kind: "SUBMIT_CHAIN_GUESS"; playerId: string; text: string; now: number }
  | { kind: "SUBMIT_BLUFF"; playerId: string; text: string; now: number }
  | { kind: "SUBMIT_BLUFF_VOTE"; playerId: string; optionId: string; now: number }
  | { kind: "SUBMIT_DUEL_PREDICTION"; playerId: string; targetId: string; now: number }
  | { kind: "SUBMIT_DUEL_ANSWER"; playerId: string; text: string; now: number }
  | { kind: "SUBMIT_REFLEX_TAP"; playerId: string; now: number }
  | { kind: "HOST_NEXT"; playerId: string; now: number }
  | { kind: "HOST_KICK"; playerId: string; targetId: string; now: number }
  | { kind: "ALARM_FIRED"; now: number }
  | { kind: "PLAY_AGAIN"; playerId: string; now: number };

export type Effect =
  | { kind: "SET_CODE_EXPIRY"; expiresAt: number }
  | { kind: "DESTROY_ROOM" }
  | { kind: "SEND_ANSWER_RECEIVED"; playerId: string }
  | { kind: "SEND_ERROR"; playerId: string; message: string }
  /** The state machine accepted a drawing; RoomDO persists the bytes out-of-band. */
  | { kind: "STORE_CHAIN_DRAWING"; originId: string; dataUrl: string }
  /** The chain round is over — its out-of-band drawings can go. */
  | { kind: "CLEAR_CHAIN_DRAWINGS" }
  /** Force-close every socket of a player, so a kick actually removes them. */
  | { kind: "CLOSE_PLAYER_SOCKETS"; playerId: string; reason: string };

export const DISCONNECT_GRACE_MS = 5 * 60 * 1000;
export const ROOM_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const CODE_RELEASE_DELAY_MS = 30 * 60 * 1000;

export const CHAIN_PROMPT_DURATION_MS = 30_000;
export const CHAIN_DRAW_DURATION_MS = 45_000;
export const CHAIN_GUESS_DURATION_MS = 30_000;
export const CHAIN_REVEAL_PER_ITEM_MS = 6_000;
export const CHAIN_POINTS = 2;

export const BLUFF_WRITE_DURATION_MS = 45_000;
export const BLUFF_VOTE_DURATION_MS = 30_000;
export const BLUFF_REVEAL_DURATION_MS = 12_000;

export const DUEL_PREDICT_DURATION_MS = 15_000;
export const DUEL_ANSWER_DURATION_MS = 45_000;
export const DUEL_REVEAL_DURATION_MS = 12_000;

/** The red screen lasts somewhere in this window, so nobody can learn the rhythm. */
export const REFLEX_WAIT_MIN_MS = 2_000;
export const REFLEX_WAIT_MAX_MS = 7_000;
/** Long enough that a distracted player still registers a time, short enough to stay tense. */
export const REFLEX_GO_DURATION_MS = 6_000;
export const REFLEX_REVEAL_DURATION_MS = 10_000;
