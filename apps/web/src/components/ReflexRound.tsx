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
                <span
                  className="tabular text-[17px]"
                  style={{ color: r.falseStart ? "var(--color-danger)" : "var(--color-text)" }}
                >
                  {r.falseStart ? "faux départ" : r.ms === null ? "—" : `${r.ms} ms`}
                </span>
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
  const burnt = reflex.falseStart;
  const done = reflex.youTapped;

  const label = burnt
    ? "Trop tôt !"
    : done
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
        disabled={done}
        aria-label={green ? "Tape maintenant" : "Ne tape pas encore"}
        className="flex w-full items-center justify-center rounded-[var(--radius-card)] transition-colors duration-100"
        style={{
          minHeight: "clamp(220px, 42vh, 380px)",
          background: burnt
            ? "rgba(255,69,58,0.18)"
            : green
              ? "var(--color-success)"
              : done
                ? "var(--color-surface-2)"
                : "var(--color-surface)",
          border: `1px solid ${burnt ? "var(--color-danger)" : green ? "var(--color-success)" : "var(--color-border)"}`,
          cursor: done ? "default" : "pointer",
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
        {burnt
          ? "Tu as tapé avant le vert : pas de points cette manche."
          : done
            ? "En attente des autres…"
            : "Le premier à taper quand l'écran passe au vert gagne. Partir trop tôt élimine."}
      </p>
    </div>
  );
}
