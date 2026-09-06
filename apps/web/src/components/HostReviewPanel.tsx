import { useState } from "react";
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
  const [index, setIndex] = useState(0);
  const total = reviewQuestions.length;
  const clampedIndex = Math.min(index, Math.max(0, total - 1));
  const q = reviewQuestions[clampedIndex];
  const isLast = clampedIndex === total - 1;
  const gradedHere = q ? q.answers.filter((a) => a.grade !== null).length : 0;

  if (total === 0) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <h2 className="font-mono text-xl font-bold">Correction</h2>
        <p style={{ color: "var(--color-text-muted)" }}>Personne n'a répondu à aucune question à corriger.</p>
        {isHost && (
          <button onClick={onFinish} className="btn btn-primary py-3 text-lg">
            Voir le podium
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-xl font-bold">Correction</h2>
        <span className="tabular" style={{ color: "var(--color-text-muted)" }}>
          Question {clampedIndex + 1}/{total} · {gradedHere}/{q!.answers.length} notées
        </span>
      </div>

      <div key={q!.deckIndex} className="panel pop-in flex flex-col gap-4">
        <p className="text-lg font-semibold">{q!.prompt}</p>
        <p style={{ color: "var(--color-text-muted)" }}>
          Réponse attendue : <strong style={{ color: "var(--color-accent)" }}>{q!.correctAnswer}</strong>
        </p>
        <ul className="flex flex-col gap-3">
          {q!.answers.map((a) => (
            <li key={a.playerId} className="flex flex-wrap items-center gap-3">
              <span className="flex-1 truncate">
                <strong>{a.nickname}</strong> : « {a.raw || "…"} »
              </span>
              {isHost ? (
                <div className="flex gap-1.5">
                  {GRADE_LABELS.map(({ grade, label }) => (
                    <button
                      key={label}
                      onClick={() => onGrade(q!.deckIndex, a.playerId, grade)}
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

      <div className="flex gap-2">
        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={clampedIndex === 0}
          className="btn btn-secondary flex-1"
        >
          ◀ Précédente
        </button>
        {isLast ? (
          isHost ? (
            <button onClick={onFinish} className="btn btn-primary flex-1">
              Voir le podium
            </button>
          ) : (
            <span
              className="flex flex-1 items-center justify-center text-center"
              style={{ color: "var(--color-text-muted)" }}
            >
              L'hôte va lancer le podium…
            </span>
          )
        ) : (
          <button onClick={() => setIndex((i) => Math.min(total - 1, i + 1))} className="btn btn-secondary flex-1">
            Suivante ▶
          </button>
        )}
      </div>
    </div>
  );
}
