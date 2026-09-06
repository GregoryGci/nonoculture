import type { PlayerPublic } from "@quiproquo/shared";

export function PlayerList({ players, youId }: { players: PlayerPublic[]; youId: string }) {
  const ranked = [...players].sort((a, b) => b.score - a.score);
  return (
    <ul className="flex flex-col gap-2">
      {ranked.map((p) => (
        <li
          key={p.playerId}
          className="flex items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 transition-opacity"
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            opacity: p.connected ? 1 : 0.45,
          }}
        >
          <span className="text-xl" aria-hidden>
            {p.avatar || "🙂"}
          </span>
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
