import type { ChainResult } from "@quiproquo/shared";

export function ChainRevealSlideshow({ chains }: { chains: ChainResult[] }) {
  return (
    <div className="flex w-full flex-col gap-4">
      {chains.map((c) => (
        <div
          key={c.originPlayerId}
          className="flex flex-col gap-2 rounded-[var(--radius-card)] p-4 transition-all duration-300"
          style={{
            background: "var(--color-surface)",
            border: `1px solid ${c.matched ? "var(--color-accent)" : "var(--color-border)"}`,
          }}
        >
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            <strong>{c.originNickname}</strong> a donné : « {c.prompt || "…"} »
          </p>
          {c.drawingDataUrl && (
            <img src={c.drawingDataUrl} alt="" className="mx-auto max-h-48 rounded-[var(--radius-control)]" />
          )}
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            <strong>{c.drawerNickname}</strong> a dessiné ça, et <strong>{c.guesserNickname}</strong> a deviné :
          </p>
          <p className="text-center text-lg font-bold">« {c.guess || "…"} »</p>
          <p className="text-center font-semibold" style={{ color: c.matched ? "var(--color-accent)" : "var(--color-text-muted)" }}>
            {c.matched ? `Deviné ! +${c.points} pour les 3` : "Raté"}
          </p>
        </div>
      ))}
    </div>
  );
}
