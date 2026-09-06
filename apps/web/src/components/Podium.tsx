import { motion } from "motion/react";
import type { PlayerPublic } from "@quiproquo/shared";
import { Avatar } from "./Avatar";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Results, not a podium.
 *
 * Literal stacked blocks fought the rest of the interface — heavy grey masses, and the full
 * ranking sits right underneath them anyway. The winner is stated once, large, and the two
 * runners-up sit quietly below in a single row. Hierarchy comes from size and space.
 */
export function Podium({ players }: { players: PlayerPublic[] }) {
  const ranked = [...players].sort((a, b) => b.score - a.score);
  const [winner, ...rest] = ranked;
  const runnersUp = rest.slice(0, 2);
  if (!winner) return null;

  return (
    <div className="flex flex-col items-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: EASE, delay: 0.1 }}
        className="flex flex-col items-center"
      >
        <Avatar id={winner.avatar} size={96} />
        <p className="display mt-5 text-[clamp(1.75rem,8vw,2.5rem)]">{winner.nickname}</p>
        <p className="tabular mt-1 text-[15px]" style={{ color: "var(--color-text-muted)" }}>
          {winner.score} {winner.score <= 1 ? "point" : "points"}
        </p>
      </motion.div>

      {runnersUp.length > 0 && (
        <div className="mt-10 flex w-full items-start justify-center gap-10">
          {runnersUp.map((p, i) => (
            <motion.div
              key={p.playerId}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE, delay: 0.45 + i * 0.1 }}
              className="flex flex-col items-center"
            >
              <Avatar id={p.avatar} size={44} />
              <p className="mt-3 max-w-[9rem] truncate text-[15px] font-medium">{p.nickname}</p>
              <p className="tabular mt-0.5 text-[13px]" style={{ color: "var(--color-text-faint)" }}>
                {p.score}
              </p>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
