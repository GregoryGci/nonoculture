import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import type { RoomStateSync } from "@quiproquo/shared";
import { Timer } from "../components/Timer";
import { Scoreboard } from "../components/Scoreboard";
import { Podium } from "../components/Podium";

/** Read-only "TV screen" view: connects as an observer, never joins as a player. */
export function HostScreen() {
  const { code } = useParams<{ code: string }>();
  const [state, setState] = useState<RoomStateSync | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${location.host}/api/rooms/${code}/ws`);
    wsRef.current = ws;
    ws.addEventListener("open", () => ws.send(JSON.stringify({ type: "OBSERVE", roomCode: code })));
    ws.addEventListener("message", (event) => {
      const envelope = JSON.parse(event.data) as { type: string; payload: unknown };
      if (envelope.type === "STATE_SYNC") setState(envelope.payload as RoomStateSync);
    });
    return () => ws.close();
  }, [code]);

  if (!state) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p style={{ color: "var(--color-text-muted)" }}>Connexion…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-4xl flex-col items-center justify-center gap-10 px-10 py-10 text-center">
      {state.phase === "LOBBY" && (
        <>
          <span
            className="tabular panel panel-notched px-12 py-6 text-8xl font-bold tracking-widest"
            style={{ color: "var(--color-accent)", textShadow: "0 0 40px color-mix(in srgb, var(--color-accent) 70%, transparent)" }}
          >
            {state.roomCode}
          </span>
          <p className="font-mono text-2xl" style={{ color: "var(--color-text-muted)" }}>
            Rejoignez sur votre téléphone
          </p>
        </>
      )}

      {state.phase === "QUESTION" && state.currentQuestion && (
        <>
          <div className="flex w-full items-center justify-between text-xl" style={{ color: "var(--color-text-muted)" }}>
            <span>
              Question {state.questionIndex + 1}/{state.questionTotal}
            </span>
            <Timer deadlineTs={state.phaseDeadlineTs} />
          </div>
          <p className="text-4xl font-bold">{state.currentQuestion.prompt}</p>
        </>
      )}

      {(state.phase === "REVEAL" || state.phase === "JUDGING") && state.revealedCorrectAnswer && (
        <p className="text-4xl font-bold">
          Réponse : <span style={{ color: "var(--color-accent)" }}>{state.revealedCorrectAnswer}</span>
        </p>
      )}

      {(state.phase === "SCOREBOARD" || state.phase === "FINISHED") && (
        <div className="w-full max-w-2xl">
          {state.phase === "FINISHED" && <Podium players={state.players} />}
          <Scoreboard players={state.players} />
        </div>
      )}
    </div>
  );
}
