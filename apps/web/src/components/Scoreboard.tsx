import type { PlayerPublic } from "@quiproquo/shared";
import { Avatar } from "./Avatar";

export function Scoreboard({ players }: { players: PlayerPublic[] }) {
  const ranked = [...players].sort((a, b) => b.score - a.score);
  const max = Math.max(1, ...ranked.map((p) => p.score));

  return (
    <div className="flex flex-col gap-3">
      {ranked.map((p, i) => (
        <div key={p.playerId} className="flex items-center gap-3">
          <span className="w-6 shrink-0 text-center font-bold" style={{ color: "var(--color-text-muted)" }}>
            {i + 1}
          </span>
          <Avatar id={p.avatar} size={28} className="shrink-0" />
          <span className="w-28 shrink-0 truncate font-medium">{p.nickname}</span>
          <div className="h-3 flex-1 overflow-hidden rounded-full" style={{ background: "var(--color-border)" }}>
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${(p.score / max) * 100}%`,
                background: "var(--color-accent)",
                boxShadow: "0 0 10px color-mix(in srgb, var(--color-accent) 70%, transparent)",
              }}
            />
          </div>
          <span className="tabular w-10 shrink-0 text-right font-bold">{p.score}</span>
        </div>
      ))}
    </div>
  );
}
