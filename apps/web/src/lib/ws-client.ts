import type { ClientMessage, RoomStateSync } from "@quiproquo/shared";
import { getOrCreatePlayerId, getPlayerToken, setPlayerToken } from "./storage";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "closed";

interface ServerEnvelope {
  type: string;
  payload: unknown;
}

const BACKOFF_STEPS_MS = [500, 1000, 2000, 4000, 10000];
const PING_INTERVAL_MS = 30_000;

export class RoomConnection {
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private closedByUser = false;
  readonly playerId = getOrCreatePlayerId();

  constructor(
    private readonly roomCode: string,
    private readonly onStatus: (status: ConnectionStatus) => void,
    private readonly onStateSync: (state: RoomStateSync) => void,
    private readonly onServerMessage: (type: string, payload: unknown) => void,
  ) {}

  connect(): void {
    this.closedByUser = false;
    this.onStatus(this.reconnectAttempt > 0 ? "reconnecting" : "connecting");
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${location.host}/api/rooms/${this.roomCode}/ws`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.addEventListener("open", () => {
      const token = getPlayerToken();
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
      let envelope: ServerEnvelope;
      try {
        envelope = JSON.parse(event.data);
      } catch {
        return;
      }
      if (envelope.type === "HELLO_OK") {
        const { playerToken } = envelope.payload as { playerToken: string };
        setPlayerToken(playerToken);
        this.reconnectAttempt = 0;
        this.onStatus("connected");
        return;
      }
      if (envelope.type === "STATE_SYNC") {
        this.onStateSync(envelope.payload as RoomStateSync);
      }
      this.onServerMessage(envelope.type, envelope.payload);
    });

    ws.addEventListener("close", () => {
      if (this.closedByUser) return;
      this.scheduleReconnect();
    });

    ws.addEventListener("error", () => {
      ws.close();
    });
  }

  private scheduleReconnect(): void {
    this.onStatus("reconnecting");
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
    this.onStatus("closed");
  }
}
