import { useState } from "react";
import type { JudgePromptItem } from "@quiproquo/shared";

export function JudgeVotePanel({
  prompt,
  isOwnAnswer,
  onVote,
}: {
  prompt: JudgePromptItem;
  isOwnAnswer: boolean;
  onVote: (vote: "valid" | "invalid") => void;
}) {
  const [voted, setVoted] = useState(false);

  function vote(choice: "valid" | "invalid") {
    if (voted || isOwnAnswer) return;
    onVote(choice);
    setVoted(true);
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <p style={{ color: "var(--color-text-muted)" }}>La room vote : cette réponse est-elle valable ?</p>
      <p className="text-2xl font-bold">
        {prompt.nickname} : « {prompt.rawAnswer} »
      </p>
      {isOwnAnswer ? (
        <p style={{ color: "var(--color-text-muted)" }}>C'est ta réponse, tu ne peux pas voter dessus.</p>
      ) : (
        <div className="flex gap-3">
          <button onClick={() => vote("valid")} disabled={voted} className="btn btn-primary px-6">
            Valide
          </button>
          <button onClick={() => vote("invalid")} disabled={voted} className="btn btn-secondary px-6">
            Pas valide
          </button>
        </div>
      )}
      {voted && <p style={{ color: "var(--color-text-muted)" }}>Vote enregistré, en attente des autres…</p>}
    </div>
  );
}
