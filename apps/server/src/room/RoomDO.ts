import { DurableObject } from "cloudflare:workers";
import { parseClientMessage } from "@nonoculture/shared";
import type { GameSettings, ServerMessageType } from "@nonoculture/shared";
import { buildDeck } from "../lib/questions.js";
import { sanitizeNickname, sanitizeText } from "../lib/sanitize.js";
import { setRoomCodeExpiry } from "../lib/room-code.js";
import { RateLimiter } from "../lib/rate-limit.js";
import { buildStateSync } from "./selectors.js";
import { computeNextAlarmTs, createRoom, transition } from "./state-machine.js";
import type { GameEvent, GameState } from "./types.js";

interface Env {
  DB: D1Database;
  /** Optional: the R2 bucket isn't bound until one exists on the account. */
  MEDIA?: R2Bucket;
  /** Static assets, which also carry question media (apps/web/public/media). */
  ASSETS?: { fetch: typeof fetch };
}

/** Every accepted socket gets a socketId up front so it can be rate-limited individually
 *  even before it identifies itself; playerId/observer are added once it does. */
type SocketAttachment =
  { socketId: string } | { socketId: string; playerId: string } | { socketId: string; observer: true };

const STORAGE_KEY = "state";
/** Chain drawings are stored one key each, outside the (frequently rewritten) game state. */
const DRAWING_PREFIX = "chain:drawing:";
// Generous enough for a host rapid-firing SUBMIT_HOST_GRADE through a long review list.
const MESSAGE_RATE_LIMIT = { maxHits: 120, windowMs: 10_000 };

/**
 * Every host-adjustable setting, forwarded from the WS message to the state machine.
 *
 * This used to be a hand-written list of `if (parsed.x !== undefined)` lines, and adding
 * `reflexRounds` to the protocol, the lobby slider and the deck builder without adding it
 * here meant the slider did nothing at all — no error, no warning, the round simply never
 * appeared. The `satisfies` below makes that omission a compile error instead.
 */
const SETTING_KEYS = [
  "questionCount",
  "questionDurationSec",
  "chainRounds",
  "bluffRounds",
  "duelRounds",
  "reflexRounds",
  "blurRounds",
  "numericRounds",
  "themes",
] as const satisfies readonly (keyof GameSettings)[];

/** Fails to compile if a GameSettings field is missing from SETTING_KEYS. */
type _EverySettingForwarded =
  Exclude<keyof GameSettings, (typeof SETTING_KEYS)[number]> extends never
    ? true
    : ["réglage non transmis au serveur", Exclude<keyof GameSettings, (typeof SETTING_KEYS)[number]>];
const _everySettingForwarded: _EverySettingForwarded = true;
void _everySettingForwarded;

function send(ws: WebSocket, type: ServerMessageType, payload: unknown): void {
  try {
    ws.send(JSON.stringify({ type, payload }));
  } catch {
    // socket already closed; ignore, cleanup happens via webSocketClose/error
  }
}

function resolveMediaUrl(mediaKey: string): string {
  return `/media/${mediaKey}`;
}

export class RoomDO extends DurableObject<Env> {
  private gameState: GameState | null = null;
  /** originPlayerId -> data URL, mirroring the DRAWING_PREFIX storage keys. Only ever
   *  populated during a chain round, so this stays a handful of entries. */
  private chainDrawings = new Map<string, string>();
  private readonly messageLimiter = new RateLimiter(MESSAGE_RATE_LIMIT.maxHits, MESSAGE_RATE_LIMIT.windowMs);

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Not awaitable from a constructor by design: blockConcurrencyWhile makes the runtime
    // queue every incoming event until the state is rehydrated.
    void ctx.blockConcurrencyWhile(async () => {
      this.gameState = (await ctx.storage.get<GameState>(STORAGE_KEY)) ?? null;
      const stored = await ctx.storage.list<string>({ prefix: DRAWING_PREFIX });
      for (const [key, dataUrl] of stored) {
        this.chainDrawings.set(key.slice(DRAWING_PREFIX.length), dataUrl);
      }
    });
  }

  override fetch(request: Request): Response {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    if (!this.gameState) {
      const roomCode = new URL(request.url).searchParams.get("code");
      if (!roomCode) return new Response("missing room code", { status: 400 });
      this.gameState = createRoom(roomCode, Date.now());
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ socketId: crypto.randomUUID() } satisfies SocketAttachment);
    // Free ping/pong: the runtime answers "PING" with "PONG" without waking the DO.
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("PING", "PONG"));
    return new Response(null, { status: 101, webSocket: client });
  }

  private socketsFor(playerId: string): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws) => {
      const meta = ws.deserializeAttachment() as SocketAttachment | null;
      return meta && "playerId" in meta && meta.playerId === playerId;
    });
  }

  private readonly resolveDrawing = (originPlayerId: string): string => this.chainDrawings.get(originPlayerId) ?? "";

  private broadcastStateSync(): void {
    if (!this.gameState) return;
    for (const ws of this.ctx.getWebSockets()) {
      const meta = ws.deserializeAttachment() as SocketAttachment | null;
      if (!meta) continue;
      const forPlayerId = "playerId" in meta ? meta.playerId : "";
      send(ws, "STATE_SYNC", buildStateSync(this.gameState, forPlayerId, resolveMediaUrl, this.resolveDrawing));
    }
  }

  private async clearChainDrawings(): Promise<void> {
    if (this.chainDrawings.size === 0) return;
    const keys = [...this.chainDrawings.keys()].map((id) => `${DRAWING_PREFIX}${id}`);
    this.chainDrawings.clear();
    await this.ctx.storage.delete(keys);
  }

  private async persistAndSchedule(): Promise<void> {
    if (!this.gameState) return;
    await this.ctx.storage.put(STORAGE_KEY, this.gameState);
    const nextAlarm = computeNextAlarmTs(this.gameState);
    if (nextAlarm !== null) {
      await this.ctx.storage.setAlarm(nextAlarm);
    } else {
      await this.ctx.storage.deleteAlarm();
    }
  }

  private async dispatch(event: GameEvent, originSocket?: WebSocket): Promise<void> {
    if (!this.gameState) return;
    const prevPhase = this.gameState.phase;
    const { state, effects } = transition(this.gameState, event);
    this.gameState = state;

    for (const effect of effects) {
      if (effect.kind === "SEND_ANSWER_RECEIVED" && originSocket) {
        send(originSocket, "ANSWER_RECEIVED", {});
      } else if (effect.kind === "SEND_ERROR" && originSocket) {
        send(originSocket, "ERROR", { message: effect.message });
      } else if (effect.kind === "SET_CODE_EXPIRY") {
        await setRoomCodeExpiry(this.env.DB, state.roomCode, effect.expiresAt);
      } else if (effect.kind === "STORE_CHAIN_DRAWING") {
        this.chainDrawings.set(effect.originId, effect.dataUrl);
        await this.ctx.storage.put(`${DRAWING_PREFIX}${effect.originId}`, effect.dataUrl);
      } else if (effect.kind === "CLEAR_CHAIN_DRAWINGS") {
        await this.clearChainDrawings();
      } else if (effect.kind === "CLOSE_PLAYER_SOCKETS") {
        for (const socket of this.socketsFor(effect.playerId)) {
          try {
            socket.close(4003, effect.reason);
          } catch {
            /* already closed */
          }
        }
      } else if (effect.kind === "DESTROY_ROOM") {
        for (const ws of this.ctx.getWebSockets()) {
          try {
            ws.close(1000, "room closed");
          } catch {
            /* ignore */
          }
        }
        this.chainDrawings.clear();
        await this.ctx.storage.deleteAll();
        await this.ctx.storage.deleteAlarm();
        this.gameState = null;
        return;
      }
    }

    if (prevPhase !== state.phase) {
      for (const ws of this.ctx.getWebSockets()) {
        send(ws, "PHASE_CHANGE", { phase: state.phase });
      }
    }
    this.broadcastStateSync();
    await this.persistAndSchedule();
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string" || !this.gameState) return;

    const meta = ws.deserializeAttachment() as SocketAttachment | null;
    // Per socket, never a shared "anonymous" bucket: one noisy unidentified client would
    // otherwise exhaust the window and silently block everyone else's HELLO.
    const limiterKey = meta && "playerId" in meta ? meta.playerId : (meta?.socketId ?? "unattached");
    if (!this.messageLimiter.check(limiterKey, Date.now())) return;

    let raw: unknown;
    try {
      raw = JSON.parse(message);
    } catch {
      send(ws, "ERROR", { message: "malformed JSON" });
      return;
    }
    const parsed = parseClientMessage(raw);
    if (!parsed) {
      send(ws, "ERROR", { message: "invalid message" });
      return;
    }

    const now = Date.now();

    if (parsed.type === "HELLO") {
      if (parsed.roomCode !== this.gameState.roomCode) {
        send(ws, "ERROR", { message: "wrong room" });
        return;
      }
      const existing = this.gameState.players[parsed.playerId];
      if (existing && existing.playerToken !== parsed.playerToken) {
        send(ws, "ERROR", { message: "invalid token" });
        ws.close(4001, "invalid token");
        return;
      }
      // Double-tab detection: close any previous socket for this player.
      for (const other of this.socketsFor(parsed.playerId)) {
        if (other !== ws) other.close(4002, "replaced by a newer connection");
      }
      const playerToken = existing?.playerToken ?? crypto.randomUUID();
      const socketId = meta?.socketId ?? crypto.randomUUID();
      ws.serializeAttachment({ socketId, playerId: parsed.playerId } satisfies SocketAttachment);
      send(ws, "HELLO_OK", { playerToken });
      await this.dispatch(
        { kind: "PLAYER_JOIN", playerId: parsed.playerId, playerToken, roomCode: parsed.roomCode, now },
        ws,
      );
      return;
    }

    if (parsed.type === "OBSERVE") {
      if (parsed.roomCode !== this.gameState.roomCode) {
        send(ws, "ERROR", { message: "wrong room" });
        return;
      }
      ws.serializeAttachment({
        socketId: meta?.socketId ?? crypto.randomUUID(),
        observer: true,
      } satisfies SocketAttachment);
      send(ws, "STATE_SYNC", buildStateSync(this.gameState, "", resolveMediaUrl, this.resolveDrawing));
      return;
    }

    if (!meta || !("playerId" in meta)) {
      send(ws, "ERROR", { message: "send HELLO first" });
      return;
    }
    const playerId = meta.playerId;

    switch (parsed.type) {
      case "SET_PROFILE":
        await this.dispatch(
          { kind: "SET_PROFILE", playerId, nickname: sanitizeNickname(parsed.nickname), avatar: parsed.avatar },
          ws,
        );
        break;
      case "HOST_SETTINGS": {
        const settings: Partial<GameSettings> = {};
        for (const key of SETTING_KEYS) {
          const value = parsed[key];
          if (value !== undefined) Object.assign(settings, { [key]: value });
        }
        await this.dispatch({ kind: "HOST_SETTINGS", playerId, settings }, ws);
        break;
      }
      case "START_GAME": {
        const deck = await buildDeck(this.env.DB, this.gameState.settings, {
          // Either source can serve /media/:key. Checking only R2 here silently zeroed the
          // audio quota on an account without R2, so no audio question was ever drawn.
          mediaAvailable: this.env.MEDIA !== undefined || this.env.ASSETS !== undefined,
        });
        await this.dispatch({ kind: "START_GAME", playerId, now, deck }, ws);
        break;
      }
      case "SUBMIT_ANSWER":
        await this.dispatch(
          {
            kind: "SUBMIT_ANSWER",
            playerId,
            questionId: parsed.questionId,
            raw: sanitizeText(parsed.answer, 200),
            now,
          },
          ws,
        );
        break;
      case "SUBMIT_HOST_GRADE":
        await this.dispatch(
          {
            kind: "SUBMIT_HOST_GRADE",
            playerId,
            deckIndex: parsed.deckIndex,
            targetPlayerId: parsed.playerId,
            grade: parsed.grade,
          },
          ws,
        );
        break;
      case "HOST_REVIEW_GOTO":
        await this.dispatch({ kind: "HOST_REVIEW_GOTO", playerId, index: parsed.index, now }, ws);
        break;
      case "HOST_NEXT":
        await this.dispatch({ kind: "HOST_NEXT", playerId, now }, ws);
        break;
      case "HOST_KICK":
        await this.dispatch({ kind: "HOST_KICK", playerId, targetId: parsed.playerId, now }, ws);
        break;
      case "PLAY_AGAIN":
        await this.dispatch({ kind: "PLAY_AGAIN", playerId, now }, ws);
        break;
      case "SUBMIT_CHAIN_PROMPT":
        await this.dispatch({ kind: "SUBMIT_CHAIN_PROMPT", playerId, text: sanitizeText(parsed.text, 80), now }, ws);
        break;
      case "SUBMIT_CHAIN_DRAWING":
        if (!parsed.dataUrl.startsWith("data:image/")) {
          send(ws, "ERROR", { message: "invalid drawing" });
          break;
        }
        await this.dispatch({ kind: "SUBMIT_CHAIN_DRAWING", playerId, dataUrl: parsed.dataUrl, now }, ws);
        break;
      case "SUBMIT_CHAIN_GUESS":
        await this.dispatch({ kind: "SUBMIT_CHAIN_GUESS", playerId, text: sanitizeText(parsed.text, 80), now }, ws);
        break;
      case "SUBMIT_CHAIN_GRADE":
        await this.dispatch(
          { kind: "SUBMIT_CHAIN_GRADE", playerId, originPlayerId: parsed.originPlayerId, valid: parsed.valid, now },
          ws,
        );
        break;
      case "SUBMIT_BLUFF":
        await this.dispatch({ kind: "SUBMIT_BLUFF", playerId, text: sanitizeText(parsed.text, 80), now }, ws);
        break;
      case "SUBMIT_BLUFF_VOTE":
        await this.dispatch({ kind: "SUBMIT_BLUFF_VOTE", playerId, optionId: parsed.optionId, now }, ws);
        break;
      case "SUBMIT_DUEL_PREDICTION":
        await this.dispatch({ kind: "SUBMIT_DUEL_PREDICTION", playerId, targetId: parsed.playerId, now }, ws);
        break;
      case "SUBMIT_DUEL_ANSWER":
        await this.dispatch({ kind: "SUBMIT_DUEL_ANSWER", playerId, text: sanitizeText(parsed.text, 60), now }, ws);
        break;
      case "SUBMIT_BLUR_ANSWER":
        // Timed on arrival like the reflex tap, and for the same reason: the round pays for
        // being early, so the clock has to be one the client cannot touch.
        await this.dispatch({ kind: "SUBMIT_BLUR_ANSWER", playerId, text: sanitizeText(parsed.text, 60), now }, ws);
        break;
      case "SUBMIT_REFLEX_TAP":
        // `now` is taken here, on arrival, and never from the client: a self-reported
        // reaction time is a self-reported score.
        await this.dispatch({ kind: "SUBMIT_REFLEX_TAP", playerId, now }, ws);
        break;
    }
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    const meta = ws.deserializeAttachment() as SocketAttachment | null;
    if (!meta || !("playerId" in meta) || !this.gameState) return;
    // Ignore if this socket was already replaced by a newer one for the same player.
    if (this.socketsFor(meta.playerId).some((s) => s !== ws)) return;
    await this.dispatch({ kind: "PLAYER_DISCONNECT", playerId: meta.playerId, now: Date.now() });
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  override async alarm(): Promise<void> {
    if (!this.gameState) return;
    await this.dispatch({ kind: "ALARM_FIRED", now: Date.now() });
  }
}
