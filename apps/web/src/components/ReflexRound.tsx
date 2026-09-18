import { motion } from "motion/react";
import type { ReflexView } from "@nonoculture/shared";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * The reflex round: wait for green, then tap.
 *
 * The client is a dumb terminal here on purpose. It never knows when the green is coming —
 * the server withholds it — and it never times anything: the tap is timed on arrival at the
 * Durable Object. A reaction time measured by the competitor is not a reaction time.
 */
export function ReflexRound({ reflex, onTap }: { reflex: ReflexView; onTap: () => void }) {
  if (reflex.step === "reveal") {
    return (
      <div className="flex flex-col gap-4">
        <ul className="flex flex-col gap-2">
          {(reflex.results ?? []).map((r, i) => (
            <motion.li
              key={r.nickname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: EASE, delay: i * 0.06 }}
              className="panel flex items-baseline justify-between gap-4 px-5 py-4"
              {...(r.points > 0 ? { style: { borderColor: "rgba(48,209,88,0.45)" } } : {})}
            >
              <span className="text-[17px] font-medium">{r.nickname}</span>
              <span className="flex items-baseline gap-3">
                <span className="tabular text-[17px]">{r.ms === null ? "—" : `${r.ms} ms`}</span>
                {r.points > 0 && (
                  <span className="tabular text-[13px]" style={{ color: "var(--color-success)" }}>
                    +{r.points}
                  </span>
                )}
              </span>
            </motion.li>
          ))}
        </ul>
        <p className="text-center text-[13px]" style={{ color: "var(--color-text-faint)" }}>
          Temps mesurés côté serveur, trajet réseau compris.
        </p>
      </div>
    );
  }

  const green = reflex.step === "go";
  const done = reflex.youTapped;
  // Inert until the green. Tapping early used to eliminate the player, which punished anyone
  // whose click crossed the switch a few milliseconds too soon — latency, not impatience.
  const armed = green && !done;

  const label = done
    ? reflex.yourMs !== null
      ? `${reflex.yourMs} ms`
      : "Enregistré"
    : green
      ? "MAINTENANT"
      : "Attends le vert…";

  return (
    <div className="flex flex-col gap-5">
      <button
        type="button"
        onClick={onTap}
        disabled={!armed}
        aria-label={green ? "Tape maintenant" : "Ne tape pas encore"}
        // No colour transition at all: a hundred-millisecond fade is a hundred milliseconds
        // where the screen is neither red nor green, and that ambiguity is the round.
        className="flex w-full items-center justify-center rounded-[var(--radius-card)]"
        style={{
          minHeight: "clamp(220px, 42vh, 380px)",
          background: green ? "var(--color-success)" : done ? "var(--color-surface-2)" : "var(--color-surface)",
          border: `1px solid ${green ? "var(--color-success)" : "var(--color-border)"}`,
          cursor: armed ? "pointer" : "default",
          // The red screen must not even look clickable.
          pointerEvents: armed ? "auto" : "none",
        }}
      >
        <span
          className="display text-[clamp(1.6rem,7vw,2.6rem)]"
          style={{ color: green && !done ? "var(--color-accent-contrast)" : "var(--color-text)" }}
        >
          {label}
        </span>
      </button>

      <p className="text-center text-[15px]" style={{ color: "var(--color-text-muted)" }}>
        {done
          ? "En attente des autres…"
          : "Le premier à taper quand l'écran passe au vert gagne. Avant le vert, le bouton ne répond pas."}
      </p>
    </div>
  );
}
