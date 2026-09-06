import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import type { RoomStateSync } from "@quiproquo/shared";
import { Timer } from "../components/Timer";
import { Scoreboard } from "../components/Scoreboard";
import { Podium } from "../components/Podium";
import { Avatar } from "../components/Avatar";

const EASE = [0.16, 1, 0.3, 1] as const;

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
    ws.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (typeof event.data !== "string") return;
      const envelope = JSON.parse(event.data) as { type?: string; payload?: unknown };
      if (envelope.type === "STATE_SYNC") setState(envelope.payload as RoomStateSync);
    });
    return () => ws.close();
  }, [code]);

  if (!state) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="waiting text-lg font-medium">Connexion…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-12 py-10">
      <header className="flex items-center justify-between">
        <span className="eyebrow">
          {state.questionIndex >= 0 && state.questionTotal > 0
            ? `${state.questionIndex + 1} / ${state.questionTotal}`
            : "Quiproquo"}
        </span>
        <Timer deadlineTs={state.phaseDeadlineTs} total={state.settings.questionDurationSec} />
      </header>

      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          key={state.phase + String(state.questionIndex)}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -14 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="flex flex-1 flex-col items-center justify-center gap-12 text-center"
        >
          {state.phase === "LOBBY" && (
            <>
              <div className="flex flex-col items-center gap-6">
                <p className="eyebrow">Rejoignez sur votre téléphone</p>
                <p
                  className="tabular text-[clamp(6rem,20vw,11rem)] font-semibold leading-none"
                  style={{ letterSpacing: "0.06em" }}
                >
                  {state.roomCode}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
                {state.players.map((p) => (
                  <motion.div
                    key={p.playerId}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, ease: EASE }}
                    className="flex flex-col items-center gap-2"
                  >
                    <Avatar id={p.avatar} size={56} />
                    <span className="text-[15px] font-medium">{p.nickname || "…"}</span>
                  </motion.div>
                ))}
              </div>
            </>
          )}

          {state.phase === "QUESTION" && state.currentQuestion && (
            <>
              <h1 className="display max-w-3xl text-[clamp(2rem,5vw,3.5rem)]">{state.currentQuestion.prompt}</h1>
              <div className="flex flex-wrap items-center justify-center gap-6">
                {state.players.map((p) => (
                  <div
                    key={p.playerId}
                    className="flex flex-col items-center gap-2 transition-opacity duration-500"
                    style={{ opacity: p.hasAnswered ? 1 : 0.32 }}
                  >
                    <Avatar id={p.avatar} size={44} />
                    <span className="text-[13px]">{p.nickname}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {(state.phase === "CHAIN_PROMPT" || state.phase === "CHAIN_DRAW" || state.phase === "CHAIN_GUESS") && (
            <>
              <p className="eyebrow">Téléphone dessiné</p>
              <h1 className="display text-[clamp(2rem,5vw,3.5rem)]">Regardez vos téléphones</h1>
            </>
          )}

          {state.phase === "HOST_REVIEW" && (
            <>
              <p className="eyebrow">Correction</p>
              <h1 className="display text-[clamp(1.75rem,4vw,3rem)]">L’hôte corrige les réponses</h1>
              <div className="w-full max-w-xl text-left">
                <Scoreboard players={state.players} />
              </div>
            </>
          )}

          {state.phase === "FINISHED" && (
            <div className="w-full max-w-2xl">
              <p className="eyebrow mb-10">Résultat final</p>
              <Podium players={state.players} />
              <hr className="divider my-10" />
              <div className="text-left">
                <Scoreboard players={state.players} />
              </div>
            </div>
          )}
        </motion.main>
      </AnimatePresence>
    </div>
  );
}
