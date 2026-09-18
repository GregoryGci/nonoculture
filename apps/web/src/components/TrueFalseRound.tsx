import { motion } from "motion/react";
import type { TrueFalseView } from "@nonoculture/shared";

const EASE = [0.16, 1, 0.3, 1] as const;

const CHOICES = [
  { value: "vrai", label: "VRAI", tint: "48,209,88" },
  { value: "faux", label: "FAUX", tint: "255,69,58" },
] as const;

/**
 * True or false: one statement, two buttons, ten seconds.
 *
 * The statement is the whole screen on purpose — the round only works if it is read in a
 * glance, and anything else competing for attention costs someone the bonus.
 */
export function TrueFalseRound({
  trueFalse,
  onAnswer,
}: {
  trueFalse: TrueFalseView;
  onAnswer: (value: "vrai" | "faux") => void;
}) {
  const locked = trueFalse.yourAnswer !== null || trueFalse.step === "reveal";

  if (trueFalse.step === "reveal") {
    return (
      <div className="flex flex-col gap-5">
        <p className="text-center text-[17px] font-medium">
          C&apos;était{" "}
          <span style={{ color: trueFalse.correctAnswer === "vrai" ? "var(--color-success)" : "var(--color-danger)" }}>
            {trueFalse.correctAnswer === "vrai" ? "VRAI" : "FAUX"}
          </span>
        </p>
        <ul className="flex flex-col gap-2">
          {(trueFalse.results ?? []).map((r, i) => (
            <motion.li
              key={r.nickname + String(i)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: EASE, delay: i * 0.06 }}
              className="panel flex items-baseline justify-between gap-4 px-5 py-4"
              {...(r.correct ? { style: { borderColor: "rgba(48,209,88,0.45)" } } : {})}
            >
              <span className="flex items-baseline gap-3">
                <span className="text-[17px] font-medium">{r.nickname}</span>
                <span className="text-[15px]" style={{ color: "var(--color-text-muted)" }}>
                  {r.answer ? r.answer.toUpperCase() : "—"}
                </span>
              </span>
              {r.points > 0 && (
                <span className="tabular text-[13px]" style={{ color: "var(--color-success)" }}>
                  +{r.points}
                </span>
              )}
            </motion.li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="panel px-5 py-6 text-center text-[19px] leading-snug">{trueFalse.statement}</p>

      <div className="flex gap-3">
        {CHOICES.map(({ value, label, tint }) => {
          const picked = trueFalse.yourAnswer === value;
          return (
            <button
              key={value}
              type="button"
              disabled={locked}
              onClick={() => onAnswer(value)}
              className="display flex-1 rounded-[var(--radius-card)] py-8 text-[clamp(1.4rem,6vw,2rem)] transition-colors duration-200"
              style={{
                background: picked ? `rgba(${tint},0.22)` : "var(--color-surface)",
                border: `1px solid ${picked ? `rgb(${tint})` : "var(--color-border)"}`,
                // Locked-in but not chosen stays readable: the room still sees both options.
                opacity: locked && !picked ? 0.4 : 1,
                cursor: locked ? "default" : "pointer",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <p className="text-center text-[13px]" style={{ color: "var(--color-text-muted)" }}>
        {locked
          ? `${trueFalse.answered} / ${trueFalse.total} ont répondu`
          : "Deux points si tu as raison, un de plus au premier."}
      </p>
    </div>
  );
}
