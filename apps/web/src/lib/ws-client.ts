import type { ClientMessage, RoomStateSync } from "@quiproquo/shared";
import { getOrCreatePlayerId, getPlayerToken, migrateLegacyKeys, resetRoomIdentity, setPlayerToken } from "./storage";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "closed" | "rejected";

interface ServerEnvelope {
  type: string;
  payload: unknown;
}

/** WebSocket payloads are untyped by construction; narrow before touching anything. */
function parseEnvelope(data: unknown): ServerEnvelope | null {
  if (typeof data !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { type, payload } = parsed as { type?: unknown; payload?: unknown };
    return typeof type === "string" ? { type, payload } : null;
  } catch {
    return null;
  }
}

const BACKOFF_STEPS_MS = [500, 1000, 2000, 4000, 10000];
const PING_INTERVAL_MS = 30_000;

/** The DO closes with 4001 when our token doesn't match the player id we claim, and with
 *  4002 when another tab took the seat. */
const TOKEN_REJECTED = 4001;
const REPLACED_BY_NEWER_TAB = 4002;
const KICKED = 4003;

export type CloseAction = "ignore" | "retry" | "reset-identity" | "give-up";

/**
 * What to do about a socket the server closed on us.
 *
 * Reconnecting blindly is what makes these codes dangerous: on 4002 the older tab would
 * reconnect, kick the newer one, which would kick it back — two tabs ping-ponging forever;
 * on 4001 we would re-send the exact credentials that were just refused, forever. So a
 * takeover or a kick ends this connection, and a refused token is retried exactly once,
 * with a fresh identity.
 */
export function decideOnClose(
  code: number,
  { closedByUser, identityAlreadyReset }: { closedByUser: boolean; identityAlreadyReset: boolean },
): CloseAction {
  if (closedByUser) return "ignore";
  if (code === REPLACED_BY_NEWER_TAB || code === KICKED) return "give-up";
  if (code === TOKEN_REJECTED) return identityAlreadyReset ? "give-up" : "reset-identity";
  return "retry";
}

const GIVE_UP_MESSAGES: Record<number, string> = {
  [REPLACED_BY_NEWER_TAB]: "Cette partie est ouverte dans un autre onglet — c'est lui qui joue.",
  [KICKED]: "L'hôte t'a retiré de la partie.",
  [TOKEN_REJECTED]: "Impossible de rejoindre cette partie avec cette identité.",
};

export interface ConnectionCallbacks {
  onStatus: (status: ConnectionStatus) => void;
  onStateSync: (state: RoomStateSync) => void;
  onServerMessage: (type: string, payload: unknown) => void;
  onIdentity: (playerId: string) => void;
}

export class RoomConnection {
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private closedByUser = false;
  /** A stale token is recoverable exactly once, by joining as a new player. */
  private identityReset = false;
  playerId: string;

  constructor(
    private readonly roomCode: string,
    private readonly callbacks: ConnectionCallbacks,
  ) {
    migrateLegacyKeys();
    this.playerId = getOrCreatePlayerId(roomCode);
  }

  connect(): void {
    this.closedByUser = false;
    this.callbacks.onStatus(this.reconnectAttempt > 0 ? "reconnecting" : "connecting");
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${location.host}/api/rooms/${this.roomCode}/ws`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.addEventListener("open", () => {
      const token = getPlayerToken(this.roomCode);
      this.send({
        type: "HELLO",
        playerId: this.playerId,
        roomCode: this.roomCode,
        ...(token ? { playerToken: token } : {}),
      });
      if (this.pingInterval) clearInterval(this.pingInterval);
      // Plain-text "PING"/"PONG", answered by the DO's free WebSocket auto-response
      // (ctx.setWebSocketAutoResponse) without waking it from hibernation.
      this.pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send("PING");
      }, PING_INTERVAL_MS);
    });

    ws.addEventListener("message", (event) => {
      if (event.data === "PONG") return;
      const envelope = parseEnvelope(event.data);
      if (!envelope) return;
      if (envelope.type === "HELLO_OK") {
        const { playerToken } = envelope.payload as { playerToken: string };
        setPlayerToken(this.roomCode, playerToken);
        this.reconnectAttempt = 0;
        this.callbacks.onStatus("connected");
        return;
      }
      if (envelope.type === "STATE_SYNC") {
        this.callbacks.onStateSync(envelope.payload as RoomStateSync);
      }
      this.callbacks.onServerMessage(envelope.type, envelope.payload);
    });

    ws.addEventListener("close", (event) => {
      if (this.pingInterval) clearInterval(this.pingInterval);
      switch (
        decideOnClose(event.code, {
          closedByUser: this.closedByUser,
          identityAlreadyReset: this.identityReset,
        })
      ) {
        case "ignore":
          return;
        case "give-up":
          this.stopWith(GIVE_UP_MESSAGES[event.code] ?? "Déconnecté de cette partie.");
          return;
        case "reset-identity":
          // Our credentials are unusable for this room; take a fresh seat rather than
          // re-offering the ones that were just refused.
          this.identityReset = true;
          resetRoomIdentity(this.roomCode);
          this.playerId = getOrCreatePlayerId(this.roomCode);
          this.callbacks.onIdentity(this.playerId);
          this.scheduleReconnect();
          return;
        case "retry":
          this.scheduleReconnect();
          return;
      }
    });

    ws.addEventListener("error", () => {
      ws.close();
    });
  }

  private stopWith(message: string): void {
    this.closedByUser = true;
    this.callbacks.onServerMessage("ERROR", { message });
    this.callbacks.onStatus("rejected");
  }

  private scheduleReconnect(): void {
    this.callbacks.onStatus("reconnecting");
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const step = Math.min(this.reconnectAttempt, BACKOFF_STEPS_MS.length - 1);
    const base = BACKOFF_STEPS_MS[step]!;
    const jitter = base * 0.2 * Math.random();
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => this.connect(), base + jitter);
  }

  send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  close(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.ws?.close();
    this.callbacks.onStatus("closed");
  }
}
