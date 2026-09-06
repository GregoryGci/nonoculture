import type { PlayerPublic } from "@quiproquo/shared";
import { Avatar } from "./Avatar";

const MEDAL = ["🥇", "🥈", "🥉"];

export function Podium({ players }: { players: PlayerPublic[] }) {
  const ranked = [...players].sort((a, b) => b.score - a.score).slice(0, 3);
  const order = [1, 0, 2].filter((i) => i < ranked.length); // 2nd, 1st, 3rd for a classic podium layout
  const heights = ["h-24", "h-32", "h-16"];

  return (
    <div className="flex items-end justify-center gap-3">
      {order.map((rankIndex, slot) => {
        const p = ranked[rankIndex];
        if (!p) return null;
        const first = rankIndex === 0;
        return (
          <div key={p.playerId} className="pop-in flex flex-col items-center gap-1">
            <Avatar id={p.avatar} size={first ? 56 : 44} />
            <span className="text-xl">{MEDAL[rankIndex]}</span>
            <span className="font-semibold">{p.nickname}</span>
            <span className="tabular text-sm" style={{ color: "var(--color-text-muted)" }}>
              {p.score} pts
            </span>
            <div
              className={`panel w-20 rounded-t-[var(--radius-control)] ${heights[slot]}`}
              style={first ? { borderColor: "var(--color-accent)", boxShadow: "0 0 20px -4px var(--color-accent)" } : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}
