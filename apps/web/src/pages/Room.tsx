import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useRoomConnection } from "../hooks/useRoomConnection";
import { ReconnectBanner } from "../components/ReconnectBanner";
import { PlayerList } from "../components/PlayerList";
import { ProfileForm } from "../components/ProfileForm";
import { HostSettings } from "../components/HostSettings";
import { Timer } from "../components/Timer";
import { AnswerForm } from "../components/AnswerForm";
import { RevealList } from "../components/RevealList";
import { JudgeVotePanel } from "../components/JudgeVotePanel";
import { Scoreboard } from "../components/Scoreboard";
import { Podium } from "../components/Podium";
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
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-4 py-8">
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

      {you?.nickname && state.phase === "LOBBY" && (
        <>
          <RoomCodeHeader code={state.roomCode} />
          <PlayerList players={state.players} youId={playerId} />
          {isHost ? (
            <>
              <HostSettings settings={state.settings} onChange={(settings) => send({ type: "HOST_SETTINGS", ...settings })} />
              <button
                onClick={() => send({ type: "START_GAME" })}
                className="min-h-11 rounded-[var(--radius-card)] py-3 text-lg font-bold"
                style={{ background: "var(--color-accent)", color: "var(--color-accent-contrast)" }}
              >
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

      {you?.nickname && state.phase === "QUESTION" && state.currentQuestion && (
        <>
          <QuestionHeader index={state.questionIndex} total={state.questionTotal} deadline={state.phaseDeadlineTs} />
          <p className="text-center text-xl font-semibold">{state.currentQuestion.prompt}</p>
          <QuestionMedia question={state.currentQuestion} />
          <AnswerForm
            alreadyAnswered={state.youHaveAnswered}
            onSubmit={(answer) => send({ type: "SUBMIT_ANSWER", questionId: state.currentQuestion!.id, answer })}
          />
          <PlayerList players={state.players} youId={playerId} />
        </>
      )}

      {you?.nickname && state.phase === "REVEAL" && (
        <>
          <QuestionHeader index={state.questionIndex} total={state.questionTotal} deadline={state.phaseDeadlineTs} />
          <RevealList
            answers={state.revealedAnswers ?? []}
            correctAnswer={state.revealedCorrectAnswer}
            explanation={state.revealedExplanation}
          />
        </>
      )}

      {you?.nickname && state.phase === "JUDGING" && (
        <>
          <QuestionHeader index={state.questionIndex} total={state.questionTotal} deadline={state.phaseDeadlineTs} />
          {state.judgePrompt && (
            <JudgeVotePanel
              prompt={state.judgePrompt}
              isOwnAnswer={state.judgePrompt.playerId === playerId}
              onVote={(vote) => send({ type: "CAST_JUDGE_VOTE", answerId: state.judgePrompt!.answerId, vote })}
            />
          )}
        </>
      )}

      {you?.nickname && state.phase === "SCOREBOARD" && (
        <>
          <QuestionHeader index={state.questionIndex} total={state.questionTotal} deadline={state.phaseDeadlineTs} />
          <Scoreboard players={state.players} />
          <MediaPreloader media={state.nextQuestionMedia} />
          {isHost && (
            <button
              onClick={() => send({ type: "HOST_NEXT" })}
              className="min-h-11 rounded-[var(--radius-control)] font-semibold"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
            >
              Suivant
            </button>
          )}
        </>
      )}

      {you?.nickname && state.phase === "FINISHED" && (
        <>
          <h2 className="text-center text-2xl font-extrabold">Partie terminée 🎉</h2>
          <Podium players={state.players} />
          <Scoreboard players={state.players} />
          {isHost && (
            <button
              onClick={() => send({ type: "PLAY_AGAIN" })}
              className="min-h-11 rounded-[var(--radius-card)] py-3 text-lg font-bold"
              style={{ background: "var(--color-accent)", color: "var(--color-accent-contrast)" }}
            >
              Rejouer
            </button>
          )}
        </>
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
    <div className="flex flex-col items-center gap-2 text-center">
      <span className="tabular text-5xl font-extrabold tracking-widest">{code}</span>
      <button
        onClick={() => navigator.clipboard.writeText(link)}
        className="min-h-11 rounded-[var(--radius-control)] px-4 text-sm font-medium"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        Copier le lien d'invitation
      </button>
    </div>
  );
}

/** Warms the browser cache for the next question's media during SCOREBOARD, so QUESTION never waits on it. */
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
  }, [media?.url]);
  return null;
}

function QuestionMedia({ question }: { question: QuestionPublic }) {
  if (!question.mediaUrl) return null;
  const style = { background: "var(--color-surface)", border: "1px solid var(--color-border)" };
  if (question.type === "image") {
    return <img src={question.mediaUrl} alt="" className="mx-auto max-h-64 rounded-[var(--radius-card)]" style={style} />;
  }
  if (question.type === "audio") {
    return <audio src={question.mediaUrl} controls className="w-full" />;
  }
  if (question.type === "video") {
    return (
      <video
        src={question.mediaUrl}
        controls
        className="mx-auto max-h-64 rounded-[var(--radius-card)]"
        style={style}
      />
    );
  }
  return null;
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
