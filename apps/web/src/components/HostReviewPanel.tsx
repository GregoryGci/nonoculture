import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Grade, ReviewQuestion } from "@nonoculture/shared";

const GRADES: { grade: Grade; label: string }[] = [
  { grade: 0, label: "Nul" },
  { grade: 0.5, label: "Presque" },
  { grade: 1, label: "Bien" },
];

const EASE = [0.16, 1, 0.3, 1] as const;

/** Host-only. Everyone else waits on the podium, so there is no read-only mode here. */
export function HostReviewPanel({
  reviewQuestions,
  onGrade,
  onFinish,
}: {
  reviewQuestions: ReviewQuestion[];
  onGrade: (deckIndex: number, playerId: string, grade: Grade) => void;
  onFinish: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const total = reviewQuestions.length;
  const clampedIndex = Math.min(index, Math.max(0, total - 1));
  const q = reviewQuestions[clampedIndex];
  const isLast = clampedIndex === total - 1;

  function go(delta: number) {
    setDirection(delta);
    setIndex((i) => Math.max(0, Math.min(total - 1, i + delta)));
  }

  if (total === 0 || !q) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <p className="text-[17px]" style={{ color: "var(--color-text-muted)" }}>
          Aucune réponse à corriger.
        </p>
        <button onClick={onFinish} className="btn btn-primary h-14 w-full">
          Voir le podium
        </button>
      </div>
    );
  }

  const graded = q.answers.filter((a) => a.grade !== null).length;

  return (
    <div className="flex flex-col gap-6">
      <p className="eyebrow">
        Question {clampedIndex + 1} sur {total}
      </p>

      {/* Progress across the whole review, not just this question. */}
      <div className="h-px w-full" style={{ background: "var(--color-border)" }}>
        <motion.div
          className="h-px"
          style={{ background: "var(--color-text)" }}
          animate={{ width: `${((clampedIndex + 1) / total) * 100}%` }}
          transition={{ duration: 0.5, ease: EASE }}
        />
      </div>

      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <motion.div
          key={q.deckIndex}
          custom={direction}
          initial={{ opacity: 0, x: direction * 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction * -24 }}
          transition={{ duration: 0.42, ease: EASE }}
          className="flex flex-col gap-5"
        >
          <div>
            <h2 className="display text-[22px]">{q.prompt}</h2>
            <p className="mt-3 text-[15px]" style={{ color: "var(--color-text-muted)" }}>
              Réponse attendue&nbsp;
              <span style={{ color: "var(--color-text)" }}>{q.correctAnswer}</span>
            </p>
          </div>

          <hr className="divider" />

          {/* The common case by far: everyone got it. One tap beats N taps. */}
          <button
            onClick={() => q.answers.forEach((a) => onGrade(q.deckIndex, a.playerId, 1))}
            disabled={q.answers.every((a) => a.grade === 1)}
            className="btn btn-secondary h-11 w-full text-[13px]"
          >
            Tout accepter
          </button>

          <ul className="flex flex-col gap-4">
            {q.answers.map((a) => (
              <li key={a.playerId} className="flex flex-col gap-2.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px] font-medium" style={{ color: "var(--color-text-faint)" }}>
                    {a.nickname}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[17px]">{a.raw || "—"}</span>
                </div>

                <div className="flex gap-1.5">
                  {GRADES.map(({ grade, label }) => {
                    const on = a.grade === grade;
                    return (
                      <button
                        key={label}
                        onClick={() => onGrade(q.deckIndex, a.playerId, grade)}
                        aria-pressed={on}
                        className="h-9 flex-1 rounded-full text-[13px] font-medium transition-all duration-300"
                        style={{
                          background: on ? "var(--color-accent)" : "transparent",
                          color: on ? "var(--color-accent-contrast)" : "var(--color-text-muted)",
                          border: `1px solid ${on ? "var(--color-accent)" : "var(--color-border)"}`,
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center gap-2">
        <button onClick={() => go(-1)} disabled={clampedIndex === 0} className="btn btn-secondary flex-1">
          Précédente
        </button>
        {isLast ? (
          <button onClick={onFinish} className="btn btn-primary flex-1">
            Voir le podium
          </button>
        ) : (
          <button onClick={() => go(1)} className="btn btn-secondary flex-1">
            Suivante
          </button>
        )}
      </div>

      <p className="text-center text-[13px]" style={{ color: "var(--color-text-faint)" }}>
        {graded}/{q.answers.length} notées sur cette question
      </p>
    </div>
  );
}
