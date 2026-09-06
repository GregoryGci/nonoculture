import { motion } from "motion/react";
import type { ChainResult } from "@nonoculture/shared";

const EASE = [0.16, 1, 0.3, 1] as const;

/** Each chain reads top to bottom as prompt → drawing → guess, with the verdict last. */
export function ChainRevealSlideshow({ chains }: { chains: ChainResult[] }) {
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

          <p
            className="text-[13px] font-medium"
            style={{ color: c.matched ? "var(--color-success)" : "var(--color-text-faint)" }}
          >
            {c.matched ? `Trouvé · +${c.points} pour les trois` : "Perdu en route"}
          </p>
        </motion.article>
      ))}
    </div>
  );
}
