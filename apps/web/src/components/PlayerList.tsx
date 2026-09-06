import { AnimatePresence, motion } from "motion/react";
import type { PlayerPublic } from "@nonoculture/shared";
import { Avatar } from "./Avatar";

/**
 * The roster, ranked. Rows animate to their new position rather than jumping, so a score
 * change during the host review reads as movement instead of a re-render.
 */
export function PlayerList({ players, youId }: { players: PlayerPublic[]; youId: string }) {
  const ranked = [...players].sort((a, b) => b.score - a.score);

  return (
    <ul className="flex flex-col gap-px overflow-hidden rounded-[var(--radius-card)]">
      <AnimatePresence initial={false}>
        {ranked.map((p) => (
          <motion.li
            key={p.playerId}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: p.connected ? 1 : 0.38, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-4 px-4 py-3"
            style={{ background: "var(--color-surface)" }}
          >
            <Avatar id={p.avatar} size={36} className="shrink-0" />

            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium">{p.nickname || "…"}</span>
              {p.playerId === youId && (
                <span className="ml-1.5 text-sm" style={{ color: "var(--color-text-faint)" }}>
                  toi
                </span>
              )}
              {p.isHost && (
                <span className="eyebrow ml-2" style={{ fontSize: 10 }}>
                  Hôte
                </span>
              )}
            </span>

            {p.hasAnswered && (
              <motion.span
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="text-sm"
                style={{ color: "var(--color-success)" }}
                aria-label="a répondu"
              >
                ✓
              </motion.span>
            )}

            <span className="tabular w-8 shrink-0 text-right font-medium">{p.score}</span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
