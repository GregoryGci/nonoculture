import { useState } from "react";
import { motion } from "motion/react";
import type { BluffView } from "@nonoculture/shared";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * The bluff round: invent an answer, then pick the real one out of the pile.
 *
 * Authorship never reaches the client before the reveal — the server withholds it — so the
 * only way to spot the real answer is to actually know it.
 */
export function BluffRound({
  bluff,
  onWrite,
  onVote,
}: {
  bluff: BluffView;
  onWrite: (text: string) => void;
  onVote: (optionId: string) => void;
}) {
  const [value, setValue] = useState("");

  if (bluff.step === "write") {
    if (bluff.submitted) {
      return <p className="waiting py-8 text-center text-[15px] font-medium">En attente des autres…</p>;
    }
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onWrite(value.trim());
        }}
        className="flex flex-col gap-5"
      >
        <p className="text-center text-[15px] leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
          Invente une réponse crédible. Tu marques à chaque joueur qui tombe dans le panneau.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={80}
            placeholder="Une réponse plausible…"
            aria-label="Ta fausse réponse"
            className="input-cyber h-14 flex-1 rounded-[var(--radius-control)] px-5"
          />
          <button type="submit" disabled={!value.trim()} className="btn btn-primary h-14">
            Valider
          </button>
        </div>
      </form>
    );
  }

  if (bluff.step === "vote") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-center text-[15px]" style={{ color: "var(--color-text-muted)" }}>
          {bluff.yourVote ? "Vote enregistré." : "Laquelle est la vraie ?"}
        </p>
        <div className="flex flex-col gap-2">
          {bluff.options.map((o, i) => {
            const picked = bluff.yourVote === o.id;
            return (
              <motion.button
                key={o.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: EASE, delay: i * 0.05 }}
                disabled={bluff.yourVote !== null}
                onClick={() => onVote(o.id)}
                className="panel px-5 py-4 text-left text-[17px] transition-all duration-300"
                {...(picked
                  ? { style: { borderColor: "var(--color-border-strong)", background: "var(--color-surface-2)" } }
                  : {})}
              >
                {o.text}
              </motion.button>
            );
          })}
        </div>
        {bluff.yourVote && <p className="waiting text-center text-[13px] font-medium">En attente des autres…</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        {bluff.options.map((o) => (
          <div
            key={o.id}
            className="panel flex items-baseline justify-between gap-4 px-5 py-4"
            style={o.isReal ? { borderColor: "rgba(48,209,88,0.45)" } : undefined}
          >
            <span className="text-[17px]">{o.text}</span>
            <span
              className="shrink-0 text-[13px]"
              style={{ color: o.isReal ? "var(--color-success)" : "var(--color-text-faint)" }}
            >
              {o.isReal ? "la vraie" : (o.authorNickname ?? "")}
            </span>
          </div>
        ))}
      </div>

      {bluff.results && bluff.results.length > 0 && (
        <>
          <hr className="divider" />
          <ul className="flex flex-col gap-2">
            {bluff.results.map((r, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 text-[15px]">
                <span className="font-medium">{r.nickname}</span>
                <span className="min-w-0 flex-1 truncate text-right" style={{ color: "var(--color-text-muted)" }}>
                  {r.votedText}
                </span>
                <span style={{ color: r.correct ? "var(--color-success)" : "var(--color-text-faint)" }}>
                  {r.correct ? "✓" : "✗"}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
