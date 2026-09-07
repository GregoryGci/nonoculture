import { useEffect, useRef, useState } from "react";
import type { ClientMessage, RoomStateSync } from "@nonoculture/shared";
import { RoomConnection, type ConnectionStatus } from "../lib/ws-client";
import { getOrCreatePlayerId } from "../lib/storage";

export interface RoomConnectionHandle {
  status: ConnectionStatus;
  state: RoomStateSync | null;
  playerId: string;
  send: (message: ClientMessage) => void;
  lastError: string | null;
  /**
   * Server clock minus browser clock, in milliseconds.
   *
   * Add it to `Date.now()` before comparing anything to a server timestamp. Skipping it is not
   * a rounding error: a two-second skew showed a fifteen-second question counting down from
   * seventeen, and made the "send what is typed just before time runs out" safety net fire
   * after the round had already closed, so nothing was ever sent.
   */
  clockOffset: number;
}

export function useRoomConnection(roomCode: string): RoomConnectionHandle {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [state, setState] = useState<RoomStateSync | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  // Adjusted during render rather than in the effect: setting it inside the effect body
  // costs an extra render pass on every mount (react-hooks/set-state-in-effect).
  const [identity, setIdentity] = useState(() => ({ roomCode, playerId: getOrCreatePlayerId(roomCode) }));
  if (identity.roomCode !== roomCode) {
    setIdentity({ roomCode, playerId: getOrCreatePlayerId(roomCode) });
  }
  const connectionRef = useRef<RoomConnection | null>(null);

  useEffect(() => {
    const connection = new RoomConnection(roomCode, {
      onStatus: setStatus,
      onStateSync: (sync) => {
        setState(sync);
        // Re-measured on every sync rather than once: a laptop waking from sleep can jump its
        // clock mid-game, and a stale offset is worse than none.
        setClockOffset(sync.serverNowTs - Date.now());
      },
      // The connection re-mints an identity if the room rejects our credentials, so the
      // "which player am I" answer has to follow it rather than be read once.
      onIdentity: (playerId) => setIdentity({ roomCode, playerId }),
      onServerMessage: (type, payload) => {
        if (type === "ERROR") {
          setLastError((payload as { message: string }).message);
        }
      },
    });
    connectionRef.current = connection;
    connection.connect();
    return () => connection.close();
  }, [roomCode]);

  return {
    status,
    state,
    playerId: identity.playerId,
    send: (message) => connectionRef.current?.send(message),
    lastError,
    clockOffset,
  };
}
