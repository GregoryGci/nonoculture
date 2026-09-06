import { motion } from "motion/react";
import type { PlayerPublic } from "@quiproquo/shared";
import { Avatar } from "./Avatar";

const EASE = [0.16, 1, 0.3, 1] as const;
const HEIGHTS = [96, 140, 68]; // by slot: 2nd, 1st, 3rd

/** Columns grow from the floor, tallest last, so the winner lands after the others settle. */
export function Podium({ players }: { players: PlayerPublic[] }) {
  const ranked = [...players].sort((a, b) => b.score - a.score).slice(0, 3);
  const slots = [1, 0, 2].filter((i) => i < ranked.length); // 2nd, 1st, 3rd

  return (
    <div className="flex items-end justify-center gap-3">
      {slots.map((rankIndex, slot) => {
        const p = ranked[rankIndex];
        if (!p) return null;
        const first = rankIndex === 0;
        const delay = first ? 0.35 : 0.1 * slot;
        return (
          <div key={p.playerId} className="flex w-24 flex-col items-center">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE, delay: delay + 0.25 }}
              className="flex flex-col items-center gap-2"
            >
              <Avatar id={p.avatar} size={first ? 56 : 42} />
              <span className="max-w-full truncate text-sm font-medium">{p.nickname}</span>
              <span className="tabular text-sm" style={{ color: "var(--color-text-faint)" }}>
                {p.score}
              </span>
            </motion.div>

            <motion.div
              className="mt-3 w-full rounded-t-[var(--radius-control)]"
              style={{
                background: first ? "rgba(255,255,255,0.12)" : "var(--color-surface)",
                borderTop: `1px solid ${first ? "var(--color-border-strong)" : "var(--color-border)"}`,
              }}
              initial={{ height: 0 }}
              animate={{ height: HEIGHTS[slot] ?? 80 }}
              transition={{ duration: 0.75, ease: EASE, delay }}
            />
            <span className="tabular mt-2 text-xs" style={{ color: "var(--color-text-faint)" }}>
              {rankIndex + 1}
            </span>
          </div>
        );
      })}
    </div>
  );
}
