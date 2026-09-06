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
  const connectionRef = useRef<RoomConnection | null>(null);

  useEffect(() => {
    const connection = new RoomConnection(
      roomCode,
      setStatus,
      setState,
      (type, payload) => {
        if (type === "ERROR") {
          setLastError((payload as { message: string }).message);
        }
      },
    );
    connectionRef.current = connection;
    connection.connect();
    return () => connection.close();
  }, [roomCode]);

  return {
    status,
    state,
    playerId: getOrCreatePlayerId(),
    send: (message) => connectionRef.current?.send(message),
    lastError,
  };
}
