import { AnimatePresence, motion } from "motion/react";
import type { PlayerPublic } from "@quiproquo/shared";
import { Avatar } from "./Avatar";

const EASE = [0.16, 1, 0.3, 1] as const;

export function Scoreboard({ players }: { players: PlayerPublic[] }) {
  const ranked = [...players].sort((a, b) => b.score - a.score);
  const max = Math.max(1, ...ranked.map((p) => p.score));

  return (
    <div className="flex flex-col gap-4">
      <AnimatePresence initial={false}>
        {ranked.map((p, i) => (
          <motion.div
            key={p.playerId}
            layout
            transition={{ duration: 0.5, ease: EASE }}
            className="flex flex-col gap-2"
          >
            <div className="flex items-center gap-3">
              <span className="tabular w-4 text-sm" style={{ color: "var(--color-text-faint)" }}>
                {i + 1}
              </span>
              <Avatar id={p.avatar} size={24} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{p.nickname}</span>
              <span className="tabular text-[15px] font-medium">{p.score}</span>
            </div>
            {/* Hairline bar rather than a chunky one: it reads as a measurement, not a game HUD. */}
            <div className="h-px w-full" style={{ background: "var(--color-border)" }}>
              <motion.div
                className="h-px"
                style={{ background: "var(--color-text)" }}
                initial={{ width: 0 }}
                animate={{ width: `${(p.score / max) * 100}%` }}
                transition={{ duration: 0.9, ease: EASE }}
              />
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
