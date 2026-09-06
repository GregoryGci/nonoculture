import type { Grade, ReviewQuestion } from "@quiproquo/shared";

const GRADE_LABELS: { grade: Grade; label: string }[] = [
  { grade: 0, label: "Nul" },
  { grade: 0.5, label: "Presque" },
  { grade: 1, label: "Good" },
];

export function HostReviewPanel({
  reviewQuestions,
  isHost,
  onGrade,
  onFinish,
}: {
  reviewQuestions: ReviewQuestion[];
  isHost: boolean;
  onGrade: (deckIndex: number, playerId: string, grade: Grade) => void;
  onFinish: () => void;
}) {
  const totalAnswers = reviewQuestions.reduce((n, q) => n + q.answers.length, 0);
  const gradedAnswers = reviewQuestions.reduce((n, q) => n + q.answers.filter((a) => a.grade !== null).length, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-xl font-bold">Correction</h2>
        <span className="tabular" style={{ color: "var(--color-text-muted)" }}>
          {gradedAnswers}/{totalAnswers} notées
        </span>
      </div>

      {reviewQuestions.length === 0 && (
        <p className="text-center" style={{ color: "var(--color-text-muted)" }}>
          Personne n'a répondu à aucune question à corriger.
        </p>
      )}

      <div className="flex max-h-[55vh] flex-col gap-4 overflow-y-auto pr-1">
        {reviewQuestions.map((q) => (
          <div key={q.deckIndex} className="panel flex flex-col gap-3">
            <p className="font-semibold">{q.prompt}</p>
            <p style={{ color: "var(--color-text-muted)" }}>
              Réponse attendue :{" "}
              <strong style={{ color: "var(--color-accent)" }}>{q.correctAnswer}</strong>
            </p>
            <ul className="flex flex-col gap-2">
              {q.answers.map((a) => (
                <li key={a.playerId} className="flex flex-wrap items-center gap-3">
                  <span className="flex-1 truncate">
                    <strong>{a.nickname}</strong> : « {a.raw || "…"} »
                  </span>
                  {isHost ? (
                    <div className="flex gap-1.5">
                      {GRADE_LABELS.map(({ grade, label }) => (
                        <button
                          key={label}
                          onClick={() => onGrade(q.deckIndex, a.playerId, grade)}
                          className={`btn ${a.grade === grade ? "btn-primary" : "btn-secondary"} px-3 text-sm`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="tabular font-semibold" style={{ color: "var(--color-text-muted)" }}>
                      {a.grade === null ? "en attente…" : a.grade}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {isHost ? (
        <button onClick={onFinish} className="btn btn-primary py-3 text-lg">
          Voir le podium
        </button>
      ) : (
        <p className="text-center" style={{ color: "var(--color-text-muted)" }}>
          L'hôte corrige les réponses…
        </p>
      )}
    </div>
  );
}
