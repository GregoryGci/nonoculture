import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
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
import type { QuestionPublic } from "@nonoculture/shared";

const EASE = [0.16, 1, 0.3, 1] as const;

export function Room() {
  const { code } = useParams<{ code: string }>();
  const { status, state, playerId, send, lastError } = useRoomConnection(code!);

  if (!state) {
    return (
      <Shell>
        <p className="waiting text-center text-[15px] font-medium">Connexion à la partie {code}…</p>
      </Shell>
    );
  }

  const you = state.players.find((p) => p.playerId === playerId);
  const isHost = you?.isHost ?? false;

  if (!you?.nickname) {
    return (
      <Shell>
        <ReconnectBanner status={status} />
        <ProfileForm onSubmit={(nickname, avatar) => send({ type: "SET_PROFILE", nickname, avatar })} />
      </Shell>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-5 py-8">
      <ReconnectBanner status={status} />

      <Header state={state} />

      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          key={state.phase + (state.phase === "QUESTION" ? String(state.questionIndex) : "")}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.42, ease: EASE }}
          className="flex flex-1 flex-col justify-center gap-8 py-8"
        >
          {state.phase === "LOBBY" && (
            <>
              <RoomCode code={state.roomCode} />
              <PlayerList players={state.players} youId={playerId} />
              {isHost ? (
                <div className="flex flex-col gap-4">
                  <HostSettings
                    settings={state.settings}
                    connectedPlayers={state.players.filter((p) => p.connected).length}
                    onChange={(settings) => send({ type: "HOST_SETTINGS", ...settings })}
                  />
                  <button onClick={() => send({ type: "START_GAME" })} className="btn btn-primary h-14 text-base">
                    Lancer la partie
                  </button>
                </div>
              ) : (
                <p className="waiting text-center text-[15px] font-medium">En attente de l’hôte…</p>
              )}
            </>
          )}

          {state.phase === "QUESTION" && state.currentQuestion && (
            <>
              <h1 className="display text-center text-[clamp(1.5rem,6vw,2.25rem)]">{state.currentQuestion.prompt}</h1>
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
            <ChainStep title="Écris une idée">
              {state.chainTask ? (
                <ChainPromptForm
                  alreadySubmitted={state.chainTask.alreadySubmitted}
                  onSubmit={(text) => send({ type: "SUBMIT_CHAIN_PROMPT", text })}
                />
              ) : (
                <NotParticipating />
              )}
            </ChainStep>
          )}

          {state.phase === "CHAIN_DRAW" && (
            <ChainStep title={state.chainTask?.content ? `Dessine : ${state.chainTask.content}` : "Dessine"}>
              {state.chainTask ? (
                state.chainTask.alreadySubmitted ? (
                  <p className="waiting py-6 text-center text-[15px] font-medium">En attente des autres…</p>
                ) : (
                  <DrawingCanvas onSubmit={(dataUrl) => send({ type: "SUBMIT_CHAIN_DRAWING", dataUrl })} />
                )
              ) : (
                <NotParticipating />
              )}
            </ChainStep>
          )}

          {state.phase === "CHAIN_GUESS" && (
            <ChainStep title="Devine le dessin">
              {state.chainTask ? (
                <ChainGuessForm
                  drawingDataUrl={state.chainTask.content ?? ""}
                  alreadySubmitted={state.chainTask.alreadySubmitted}
                  onSubmit={(text) => send({ type: "SUBMIT_CHAIN_GUESS", text })}
                />
              ) : (
                <NotParticipating />
              )}
            </ChainStep>
          )}

          {state.phase === "CHAIN_REVEAL" && (
            <ChainStep title="Ce qui s’est passé">
              <ChainRevealSlideshow chains={state.chainReveal ?? []} />
              {isHost && (
                <button onClick={() => send({ type: "HOST_NEXT" })} className="btn btn-primary mt-2 h-14 w-full">
                  Continuer
                </button>
              )}
            </ChainStep>
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
              <Podium players={state.players} />
              <hr className="divider" />
              <Scoreboard players={state.players} />
              {isHost && (
                <button onClick={() => send({ type: "PLAY_AGAIN" })} className="btn btn-primary h-14 text-base">
                  Rejouer
                </button>
              )}
            </>
          )}
        </motion.main>
      </AnimatePresence>

      <AnimatePresence>
        {lastError && (
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="pb-2 text-center text-[13px]"
            style={{ color: "var(--color-danger)" }}
            role="status"
          >
            {lastError}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col items-center justify-center px-5 py-8">
      {children}
    </div>
  );
}

/** Persistent top bar: where you are in the deck, and how long is left. */
function Header({ state }: { state: NonNullable<ReturnType<typeof useRoomConnection>["state"]> }) {
  // Past the last slot the deck index keeps counting (it becomes the HOST_REVIEW marker),
  // so "16 / 15" is reachable unless the counter is bounded to the playing phases.
  const playing = state.phase !== "LOBBY" && state.phase !== "HOST_REVIEW" && state.phase !== "FINISHED";
  const inDeck = playing && state.questionIndex >= 0 && state.questionTotal > 0;
  const position = inDeck ? Math.min(state.questionIndex + 1, state.questionTotal) : 0;
  const progress =
    state.phase === "FINISHED" || state.phase === "HOST_REVIEW" ? 1 : position / (state.questionTotal || 1);

  const label = inDeck
    ? `${position} / ${state.questionTotal}`
    : state.phase === "HOST_REVIEW"
      ? "Correction"
      : state.phase === "FINISHED"
        ? "Terminé"
        : `Salon ${state.roomCode}`;

  return (
    <header className="flex flex-col gap-3">
      <div className="flex h-11 items-center justify-between">
        <span className="eyebrow">{label}</span>
        <Timer deadlineTs={state.phaseDeadlineTs} total={state.settings.questionDurationSec} />
      </div>
      <div className="h-px w-full" style={{ background: "var(--color-border)" }}>
        <motion.div
          className="h-px"
          style={{ background: "var(--color-text)" }}
          animate={{ width: `${progress * 100}%` }}
          transition={{ duration: 0.6, ease: EASE }}
        />
      </div>
    </header>
  );
}

function RoomCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const link = `${location.origin}/join/${code}`;

  function copy() {
    void navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="flex flex-col items-center gap-5">
      <p className="eyebrow">Code de la partie</p>
      <p className="tabular text-[clamp(3.5rem,18vw,5.5rem)] font-semibold" style={{ letterSpacing: "0.08em" }}>
        {code}
      </p>
      <button onClick={copy} className="btn btn-secondary h-10 text-[13px]">
        {copied ? "Lien copié" : "Copier le lien d’invitation"}
      </button>
    </div>
  );
}

function ChainStep({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="eyebrow">Téléphone dessiné</p>
        <h1 className="display text-[clamp(1.35rem,5.5vw,2rem)]">{title}</h1>
      </div>
      {children}
    </div>
  );
}

function NotParticipating() {
  return (
    <p className="py-8 text-center text-[15px] leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
      Tu as rejoint pendant cette manche. Tu reprends à la suivante.
    </p>
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
  const frame = "rounded-[var(--radius-card)] mx-auto";
  if (question.type === "image") {
    return (
      <img
        src={question.mediaUrl}
        alt=""
        className={`${frame} pop-in max-h-72`}
        style={{ border: "1px solid var(--color-border)" }}
      />
    );
  }
  if (question.type === "audio") {
    return <audio src={question.mediaUrl} controls autoPlay className="pop-in w-full" />;
  }
  if (question.type === "video") {
    return (
      <video
        src={question.mediaUrl}
        controls
        className={`${frame} pop-in max-h-72`}
        style={{ border: "1px solid var(--color-border)" }}
      />
    );
  }
  return null;
}
