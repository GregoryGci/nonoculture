import { z } from "zod";
import { MAX_DRAWING_DATA_URL_LENGTH } from "./domain.js";

const nickname = z.string().trim().min(1).max(16);
const uuid = z.string().uuid();
const token = z.string().min(16).max(128);
const roomCode = z.string().regex(/^\d{4,5}$/);

// ---------- Client → Server ----------

export const HelloMsg = z.object({
  type: z.literal("HELLO"),
  playerId: uuid,
  playerToken: token.optional(), // absent on first-ever connection
  roomCode,
});

/** For the read-only "host screen" TV view — never becomes a player, never votes/answers. */
export const ObserveMsg = z.object({
  type: z.literal("OBSERVE"),
  roomCode,
});

export const SetProfileMsg = z.object({
  type: z.literal("SET_PROFILE"),
  nickname,
  avatar: z.string().min(1).max(24), // emoji, or an id from packages/shared avatar set
});

export const StartGameMsg = z.object({
  type: z.literal("START_GAME"),
});

export const SubmitAnswerMsg = z.object({
  type: z.literal("SUBMIT_ANSWER"),
  questionId: z.number().int(),
  answer: z.string().max(200),
});

/** Host-only: assigns a grade to one player's answer to one trivia question during HOST_REVIEW. */
export const SubmitHostGradeMsg = z.object({
  type: z.literal("SUBMIT_HOST_GRADE"),
  deckIndex: z.number().int().min(0),
  playerId: uuid,
  grade: z.union([z.literal(0), z.literal(0.5), z.literal(1)]),
});

export const HostNextMsg = z.object({
  type: z.literal("HOST_NEXT"),
});

export const HostKickMsg = z.object({
  type: z.literal("HOST_KICK"),
  playerId: uuid,
});

export const HostSettingsMsg = z.object({
  type: z.literal("HOST_SETTINGS"),
  questionCount: z.number().int().min(20).max(40).optional(),
  questionDurationSec: z.number().int().min(15).max(30).optional(),
  themes: z.array(z.string()).optional(),
});

export const PlayAgainMsg = z.object({
  type: z.literal("PLAY_AGAIN"),
});

// --- Chain round ("téléphone dessiné") ---

export const SubmitChainPromptMsg = z.object({
  type: z.literal("SUBMIT_CHAIN_PROMPT"),
  text: z.string().min(1).max(80),
});

/** A small compressed WebP/JPEG data URL — the client compresses to stay well under this. */
export const SubmitChainDrawingMsg = z.object({
  type: z.literal("SUBMIT_CHAIN_DRAWING"),
  dataUrl: z
    .string()
    .min(1)
    .max(MAX_DRAWING_DATA_URL_LENGTH)
    .regex(/^data:image\/(webp|jpeg|png);base64,/),
});

export const SubmitChainGuessMsg = z.object({
  type: z.literal("SUBMIT_CHAIN_GUESS"),
  text: z.string().min(1).max(80),
});

export const ClientMessage = z.discriminatedUnion("type", [
  HelloMsg,
  ObserveMsg,
  SetProfileMsg,
  StartGameMsg,
  SubmitAnswerMsg,
  SubmitHostGradeMsg,
  HostNextMsg,
  HostKickMsg,
  HostSettingsMsg,
  PlayAgainMsg,
  SubmitChainPromptMsg,
  SubmitChainDrawingMsg,
  SubmitChainGuessMsg,
]);

export type ClientMessage = z.infer<typeof ClientMessage>;

// ---------- Server → Client ----------
// (payload shapes for these are domain types from ./domain, kept loosely typed
// here since they're only ever produced by the server, never parsed from user input)

export type ServerMessageType =
  | "HELLO_OK"
  | "STATE_SYNC"
  | "PHASE_CHANGE"
  | "PLAYER_JOINED"
  | "PLAYER_LEFT"
  | "ANSWER_RECEIVED"
  | "REVEAL_ANSWERS"
  | "JUDGE_PROMPT"
  | "SCORE_UPDATE"
  | "GAME_OVER"
  | "ERROR";

export interface ServerMessage<T = unknown> {
  type: ServerMessageType;
  payload: T;
}

export function parseClientMessage(raw: unknown): ClientMessage | null {
  const result = ClientMessage.safeParse(raw);
  return result.success ? result.data : null;
}
