import { z } from "zod";

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

export const SetProfileMsg = z.object({
  type: z.literal("SET_PROFILE"),
  nickname,
  avatar: z.string().min(1).max(8), // emoji
});

export const StartGameMsg = z.object({
  type: z.literal("START_GAME"),
});

export const SubmitAnswerMsg = z.object({
  type: z.literal("SUBMIT_ANSWER"),
  questionId: z.number().int(),
  answer: z.string().max(200),
});

export const CastJudgeVoteMsg = z.object({
  type: z.literal("CAST_JUDGE_VOTE"),
  answerId: z.string(),
  vote: z.enum(["valid", "invalid"]),
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

export const ClientMessage = z.discriminatedUnion("type", [
  HelloMsg,
  SetProfileMsg,
  StartGameMsg,
  SubmitAnswerMsg,
  CastJudgeVoteMsg,
  HostNextMsg,
  HostKickMsg,
  HostSettingsMsg,
  PlayAgainMsg,
]);

export type ClientMessage = z.infer<typeof ClientMessage>;

// ---------- Server → Client ----------
// (payload shapes for these are domain types from ./domain, kept loosely typed
// here since they're only ever produced by the server, never parsed from user input)

export type ServerMessageType =
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
