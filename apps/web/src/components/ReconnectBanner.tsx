import type { ConnectionStatus } from "../lib/ws-client";

const BANNERS: Partial<Record<ConnectionStatus, { text: string; color: string }>> = {
  reconnecting: { text: "⟲ Reconnexion…", color: "var(--color-accent)" },
  rejected: { text: "⨯ Déconnecté de cette partie", color: "var(--color-accent-2)" },
};

export function ReconnectBanner({ status }: { status: ConnectionStatus }) {
  const banner = BANNERS[status];
  if (!banner) return null;
  return (
    <div
      className="font-mono fixed inset-x-0 top-0 z-50 py-2 text-center text-sm font-medium"
      style={{
        background: "var(--color-surface)",
        color: banner.color,
        borderBottom: `1px solid ${banner.color}`,
        boxShadow: `0 0 16px -4px ${banner.color}`,
      }}
      role="status"
    >
      {banner.text}
    </div>
  );
}
