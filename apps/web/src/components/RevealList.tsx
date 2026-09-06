import type { RevealedAnswer } from "@quiproquo/shared";

export function RevealList({
  answers,
  correctAnswer,
  explanation,
}: {
  answers: RevealedAnswer[];
  correctAnswer: string | null;
  explanation: string | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      {correctAnswer && (
        <p className="text-lg">
          Bonne réponse :{" "}
          <span className="font-bold" style={{ color: "var(--color-accent)" }}>
            {correctAnswer}
          </span>
        </p>
      )}
      {explanation && <p style={{ color: "var(--color-text-muted)" }}>{explanation}</p>}
      <ul className="flex flex-col gap-2">
        {answers.map((a) => (
          <li
            key={a.playerId}
            className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] px-3 py-2 transition-all duration-200"
            style={{
              background: "var(--color-surface)",
              border: `1px solid ${a.accepted === true ? "var(--color-accent)" : "var(--color-border)"}`,
            }}
          >
            <span className="truncate font-medium">{a.nickname}</span>
            <span className="flex-1 truncate text-center" style={{ color: "var(--color-text-muted)" }}>
              {a.rawAnswer || "(pas de réponse)"}
            </span>
            <span className="tabular font-semibold">
              {a.accepted === null ? "en délibération…" : a.accepted ? `+${a.points}` : "0"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
