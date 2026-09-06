import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useRoomConnection } from "../hooks/useRoomConnection";
import { ReconnectBanner } from "../components/ReconnectBanner";
import { PlayerList } from "../components/PlayerList";
import { ProfileForm } from "../components/ProfileForm";
import { HostSettings } from "../components/HostSettings";
import { Timer } from "../components/Timer";
import { AnswerForm } from "../components/AnswerForm";
import { HostReviewPanel } from "../components/HostReviewPanel";
import { Scoreboard } from "../components/Scoreboard";
import { Podium } from "../components/Podium";
import { ChainPromptForm } from "../components/ChainPromptForm";
import { DrawingCanvas } from "../components/DrawingCanvas";
import { ChainGuessForm } from "../components/ChainGuessForm";
import { ChainRevealSlideshow } from "../components/ChainRevealSlideshow";
import type { QuestionPublic } from "@quiproquo/shared";

export function Room() {
  const { code } = useParams<{ code: string }>();
  const { status, state, playerId, send, lastError } = useRoomConnection(code!);

  if (!state) {
    return (
      <Centered>
        <p style={{ color: "var(--color-text-muted)" }}>Connexion à la partie {code}…</p>
      </Centered>
    );
  }

  const you = state.players.find((p) => p.playerId === playerId);
  const isHost = you?.isHost ?? false;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-6 px-4 py-10">
      <ReconnectBanner status={status} />
      {lastError && (
        <p className="text-center text-sm" style={{ color: "var(--color-accent)" }}>
          {lastError}
        </p>
      )}

      {!you?.nickname && (
        <Centered>
          <ProfileForm onSubmit={(nickname, avatar) => send({ type: "SET_PROFILE", nickname, avatar })} />
        </Centered>
      )}

      {you?.nickname && (
        <div key={state.phase} className="phase-enter flex flex-col gap-6">
          {state.phase === "LOBBY" && (
            <>
              <RoomCodeHeader code={state.roomCode} />
              <PlayerList players={state.players} youId={playerId} />
              {isHost ? (
                <>
                  <HostSettings
                    settings={state.settings}
                    onChange={(settings) => send({ type: "HOST_SETTINGS", ...settings })}
                  />
                  <button onClick={() => send({ type: "START_GAME" })} className="btn btn-primary py-3 text-lg">
                    Lancer la partie
                  </button>
                </>
              ) : (
                <p className="text-center" style={{ color: "var(--color-text-muted)" }}>
                  En attente que l'hôte lance la partie…
                </p>
              )}
            </>
          )}

          {state.phase === "QUESTION" && state.currentQuestion && (
            <>
              <QuestionHeader
                index={state.questionIndex}
                total={state.questionTotal}
                deadline={state.phaseDeadlineTs}
              />
              <p className="text-center text-2xl font-semibold">{state.currentQuestion.prompt}</p>
              <QuestionMedia question={state.currentQuestion} />
              <AnswerForm
                key={state.currentQuestion.id}
                alreadyAnswered={state.youHaveAnswered}
                onSubmit={(answer) => send({ type: "SUBMIT_ANSWER", questionId: state.currentQuestion!.id, answer })}
              />
              <PlayerList players={state.players} youId={playerId} />
              <MediaPreloader media={state.nextQuestionMedia} />
            </>
          )}

          {state.phase === "CHAIN_PROMPT" && (
            <>
              <ChainHeader deadline={state.phaseDeadlineTs} />
              {state.chainTask ? (
                <ChainPromptForm
                  alreadySubmitted={state.chainTask.alreadySubmitted}
                  onSubmit={(text) => send({ type: "SUBMIT_CHAIN_PROMPT", text })}
                />
              ) : (
                <NotParticipating />
              )}
            </>
          )}

          {state.phase === "CHAIN_DRAW" && (
            <>
              <ChainHeader deadline={state.phaseDeadlineTs} />
              {state.chainTask ? (
                state.chainTask.alreadySubmitted ? (
                  <p className="text-center" style={{ color: "var(--color-text-muted)" }}>
                    Dessin envoyé, en attente des autres…
                  </p>
                ) : (
                  <>
                    <p className="text-center text-xl font-semibold">Dessine : « {state.chainTask.content} »</p>
                    <DrawingCanvas onSubmit={(dataUrl) => send({ type: "SUBMIT_CHAIN_DRAWING", dataUrl })} />
                  </>
                )
              ) : (
                <NotParticipating />
              )}
            </>
          )}

          {state.phase === "CHAIN_GUESS" && (
            <>
              <ChainHeader deadline={state.phaseDeadlineTs} />
              {state.chainTask ? (
                <ChainGuessForm
                  drawingDataUrl={state.chainTask.content ?? ""}
                  alreadySubmitted={state.chainTask.alreadySubmitted}
                  onSubmit={(text) => send({ type: "SUBMIT_CHAIN_GUESS", text })}
                />
              ) : (
                <NotParticipating />
              )}
            </>
          )}

          {state.phase === "CHAIN_REVEAL" && (
            <>
              <ChainHeader deadline={state.phaseDeadlineTs} />
              <ChainRevealSlideshow chains={state.chainReveal ?? []} />
              {isHost && (
                <button onClick={() => send({ type: "HOST_NEXT" })} className="btn btn-secondary">
                  Suivant
                </button>
              )}
            </>
          )}

          {state.phase === "HOST_REVIEW" && (
            <HostReviewPanel
              reviewQuestions={state.reviewQuestions ?? []}
              isHost={isHost}
              onGrade={(deckIndex, targetPlayerId, grade) =>
                send({ type: "SUBMIT_HOST_GRADE", deckIndex, playerId: targetPlayerId, grade })
              }
              onFinish={() => send({ type: "HOST_NEXT" })}
            />
          )}

          {state.phase === "FINISHED" && (
            <>
              <h2 className="font-mono text-center text-2xl font-bold">Partie terminée 🎉</h2>
              <Podium players={state.players} />
              <Scoreboard players={state.players} />
              {isHost && (
                <button onClick={() => send({ type: "PLAY_AGAIN" })} className="btn btn-primary py-3 text-lg">
                  Rejouer
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4">{children}</div>;
}

function RoomCodeHeader({ code }: { code: string }) {
  const link = `${location.origin}/join/${code}`;
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span
        className="tabular panel panel-notched px-8 py-4 text-5xl font-bold tracking-widest"
        style={{
          color: "var(--color-accent)",
          textShadow: "0 0 20px color-mix(in srgb, var(--color-accent) 60%, transparent)",
        }}
      >
        {code}
      </span>
      <button onClick={() => void navigator.clipboard.writeText(link)} className="btn btn-ghost text-sm">
        Copier le lien d'invitation
      </button>
    </div>
  );
}

/** Warms the browser cache for the next question's media while the current one is on screen. */
function MediaPreloader({ media }: { media: { type: string; url: string } | null }) {
  useEffect(() => {
    if (!media) return;
    if (media.type === "image") {
      const img = new Image();
      img.src = media.url;
    } else {
      const el = document.createElement(media.type === "video" ? "video" : "audio");
      el.preload = "auto";
      el.src = media.url;
    }
  }, [media]);
  return null;
}

function QuestionMedia({ question }: { question: QuestionPublic }) {
  if (!question.mediaUrl) return null;
  if (question.type === "image") {
    return <img src={question.mediaUrl} alt="" className="panel pop-in mx-auto max-h-64" />;
  }
  if (question.type === "audio") {
    return <audio src={question.mediaUrl} controls className="pop-in w-full" />;
  }
  if (question.type === "video") {
    return <video src={question.mediaUrl} controls className="panel pop-in mx-auto max-h-64" />;
  }
  return null;
}

function ChainHeader({ deadline }: { deadline: number | null }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: "var(--color-accent)" }}>📞 Téléphone dessiné</span>
      <Timer deadlineTs={deadline} />
    </div>
  );
}

function NotParticipating() {
  return (
    <p className="text-center" style={{ color: "var(--color-text-muted)" }}>
      Tu as rejoint pendant cette manche spéciale, tu reprendras à la suivante. Patiente…
    </p>
  );
}

function QuestionHeader({ index, total, deadline }: { index: number; total: number; deadline: number | null }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: "var(--color-text-muted)" }}>
        Question {index + 1}/{total}
      </span>
      <Timer deadlineTs={deadline} />
    </div>
  );
}
