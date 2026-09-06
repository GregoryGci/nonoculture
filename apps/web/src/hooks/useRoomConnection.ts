import { useEffect, useRef, useState } from "react";
import type { ClientMessage, RoomStateSync } from "@quiproquo/shared";
import { RoomConnection, type ConnectionStatus } from "../lib/ws-client";
import { getOrCreatePlayerId } from "../lib/storage";

export interface RoomConnectionHandle {
  status: ConnectionStatus;
  state: RoomStateSync | null;
  playerId: string;
  send: (message: ClientMessage) => void;
  lastError: string | null;
}

export function useRoomConnection(roomCode: string): RoomConnectionHandle {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [state, setState] = useState<RoomStateSync | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
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
      onStateSync: setState,
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
  };
}
