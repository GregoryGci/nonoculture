import { motion } from "motion/react";
import type { ChainResult } from "@nonoculture/shared";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Each chain reads top to bottom as prompt → drawing → guess, with the verdict last.
 *
 * The verdict is the host's to give. The text matcher fills it in first, because it is right
 * most of the time, but it cannot rule on a drawing: "chat à bicyclette" for "un chat qui fait
 * du vélo" is obviously the same idea to everyone in the room and not a string match. Everyone
 * sees the ruling change live; only the host can change it.
 */
export function ChainRevealSlideshow({
  chains,
  canGrade,
  onGrade,
}: {
  chains: ChainResult[];
  canGrade: boolean;
  onGrade: (originPlayerId: string, valid: boolean) => void;
}) {
  return (
    <div className="flex w-full flex-col gap-4">
      {chains.map((c, i) => (
        <motion.article
          key={c.originPlayerId}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE, delay: i * 0.12 }}
          className="panel flex flex-col gap-4 p-5"
          {...(c.matched ? { style: { borderColor: "rgba(48,209,88,0.4)" } } : {})}
        >
          <div>
            <p className="eyebrow">{c.originNickname} a écrit</p>
            <p className="mt-1.5 text-[17px] font-medium">{c.prompt || "—"}</p>
          </div>

          {c.drawingDataUrl && (
            <img
              src={c.drawingDataUrl}
              alt=""
              className="mx-auto max-h-52 rounded-[var(--radius-control)]"
              style={{ border: "1px solid var(--color-border)" }}
            />
          )}

          <div>
            <p className="eyebrow">
              {c.drawerNickname} a dessiné · {c.guesserNickname} a deviné
            </p>
            <p className="mt-1.5 text-[17px] font-medium">{c.guess || "—"}</p>
          </div>

          <hr className="divider" />

          {canGrade ? (
            <div className="flex items-center gap-2">
              {[
                { valid: false, label: "Perdu" },
                { valid: true, label: `Trouvé · +${c.points}` },
              ].map(({ valid, label }) => {
                const on = c.matched === valid;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => onGrade(c.originPlayerId, valid)}
                    aria-pressed={on}
                    className="h-10 flex-1 rounded-full text-[13px] font-medium transition-all duration-300"
                    style={{
                      background: on ? (valid ? "var(--color-success)" : "var(--color-surface-2)") : "transparent",
                      color: on && valid ? "#04140a" : on ? "var(--color-text)" : "var(--color-text-muted)",
                      border: `1px solid ${on ? "transparent" : "var(--color-border)"}`,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ) : (
            <p
              className="text-[13px] font-medium"
              style={{ color: c.matched ? "var(--color-success)" : "var(--color-text-faint)" }}
            >
              {c.matched ? `Trouvé · +${c.points} pour les trois` : "Perdu en route"}
            </p>
          )}
        </motion.article>
      ))}
    </div>
  );
}
