import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { DuelView } from "@nonoculture/shared";
import { useDeadlineFlush } from "../hooks/useDeadlineFlush";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * The duel: two contestants race to name as many valid items as they can, spectators call
 * the winner beforehand. Self-scored — the question carries its own set of accepted answers,
 * so nothing here waits on the host.
 */
export function DuelRound({
  duel,
  deadlineTs,
  clockOffset,
  onPredict,
  onAnswer,
}: {
  duel: DuelView;
  deadlineTs: number | null;
  clockOffset: number;
  onPredict: (playerId: string) => void;
  onAnswer: (text: string) => void;
}) {
  const [value, setValue] = useState("");

  // The item half-typed when the buzzer goes still counts.
  useDeadlineFlush({
    deadlineTs,
    clockOffset,
    value,
    locked: duel.step !== "answer" || !duel.youAreContestant,
    onFlush: (text) => {
      onAnswer(text);
      setValue("");
    },
  });

  if (duel.step === "predict") {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-center text-[15px] leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
          {duel.youAreContestant
            ? "Prépare-toi. Les autres parient sur toi."
            : "Qui va en citer le plus ? Tu marques si tu vois juste."}
        </p>
        {!duel.youAreContestant && (
          <div className="flex gap-3">
            {duel.contestants.map((c) => {
              const picked = duel.yourPrediction === c.playerId;
              return (
                <button
                  key={c.playerId}
                  disabled={duel.yourPrediction !== null}
                  onClick={() => onPredict(c.playerId)}
                  className="panel flex-1 px-4 py-6 text-center text-[17px] font-medium transition-all duration-300"
                  style={
                    picked
                      ? { borderColor: "var(--color-border-strong)", background: "var(--color-surface-2)" }
                      : undefined
                  }
                >
                  {c.nickname}
                </button>
              );
            })}
          </div>
        )}
        {(duel.yourPrediction || duel.youAreContestant) && (
          <p className="waiting text-center text-[13px] font-medium">Le duel commence…</p>
        )}
      </div>
    );
  }

  if (duel.step === "answer") {
    if (!duel.youAreContestant) {
      // Spectators used to get two numbers going up, which is not a duel you can watch.
      // Every attempt lands here as it is typed, misses included — those are the good part.
      return (
        <div className="flex flex-col gap-5">
          <p className="waiting text-center text-[15px] font-medium">Duel en cours…</p>
          <div className="grid grid-cols-2 gap-3">
            {duel.contestants.map((c) => (
              <div key={c.playerId} className="panel flex min-w-0 flex-col gap-3 p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-[15px] font-medium">{c.nickname}</span>
                  <motion.span
                    key={c.found}
                    initial={{ scale: 1.35, opacity: 0.4 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.35, ease: EASE }}
                    className="tabular text-[22px] font-semibold"
                  >
                    {c.found}
                  </motion.span>
                </div>
                <ul className="flex flex-col-reverse gap-1.5">
                  <AnimatePresence initial={false}>
                    {c.attempts.map((a, i) => (
                      <motion.li
                        key={`${i}-${a.text}`}
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, ease: EASE }}
                        className="truncate text-[13px]"
                        style={{
                          color: a.hit ? "var(--color-success)" : "var(--color-text-faint)",
                          textDecoration: a.hit ? "none" : "line-through",
                        }}
                      >
                        {a.text}
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!value.trim()) return;
            onAnswer(value.trim());
            setValue(""); // one item per submit: keep typing, the round is a race
          }}
          className="flex gap-2"
        >
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={60}
            placeholder="Une réponse, puis Entrée…"
            aria-label="Un élément de ta liste"
            className="input-cyber h-14 flex-1 rounded-[var(--radius-control)] px-5"
          />
          <button type="submit" disabled={!value.trim()} className="btn btn-primary h-14 px-6">
            Ajouter
          </button>
        </form>

        <div className="flex items-baseline justify-between">
          <span className="eyebrow">Trouvés</span>
          <span className="tabular text-[17px] font-medium">
            {duel.yourFound.length} / {duel.acceptedTotal}
          </span>
        </div>
        <ul className="flex flex-wrap gap-2">
          <AnimatePresence initial={false}>
            {duel.yourFound.map((item) => (
              <motion.li
                key={item}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35, ease: EASE }}
                className="rounded-full px-3 py-1.5 text-[13px]"
                style={{ background: "var(--color-surface-2)", color: "var(--color-success)" }}
              >
                {item}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {(duel.reveal ?? []).map((r) => (
        <div
          key={r.nickname}
          className="panel flex flex-col gap-3 p-5"
          style={r.winner ? { borderColor: "rgba(48,209,88,0.45)" } : undefined}
        >
          <div className="flex items-baseline justify-between">
            <span className="text-[17px] font-medium">{r.nickname}</span>
            <span
              className="tabular text-[15px]"
              style={{ color: r.winner ? "var(--color-success)" : "var(--color-text-faint)" }}
            >
              {r.found.length} {r.winner ? "· gagne" : ""}
            </span>
          </div>
          {r.found.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {r.found.map((item) => (
                <span
                  key={item}
                  className="rounded-full px-3 py-1 text-[13px]"
                  style={{ background: "var(--color-surface-2)", color: "var(--color-text-muted)" }}
                >
                  {item}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
