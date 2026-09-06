import type { PlayerPublic } from "@quiproquo/shared";
import { Avatar } from "./Avatar";

export function PlayerList({ players, youId }: { players: PlayerPublic[]; youId: string }) {
  const ranked = [...players].sort((a, b) => b.score - a.score);
  return (
    <ul className="flex flex-col gap-2">
      {ranked.map((p) => (
        <li
          key={p.playerId}
          className="panel panel-hover flex items-center gap-4 px-5 py-4 text-lg transition-opacity"
          style={{ opacity: p.connected ? 1 : 0.45 }}
        >
          <Avatar id={p.avatar} size={40} />
          <span className="flex-1 truncate font-medium">
            {p.nickname || "…"}
            {p.playerId === youId && <span style={{ color: "var(--color-text-muted)" }}> (toi)</span>}
            {p.isHost && <span style={{ color: "var(--color-accent)" }}> · hôte</span>}
          </span>
          {p.hasAnswered && <span style={{ color: "var(--color-accent)" }}>✓</span>}
          <span className="tabular font-semibold">{p.score}</span>
        </li>
      ))}
    </ul>
  );
}
