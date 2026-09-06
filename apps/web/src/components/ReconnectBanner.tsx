import type { ConnectionStatus } from "../lib/ws-client";

export function ReconnectBanner({ status }: { status: ConnectionStatus }) {
  if (status !== "reconnecting") return null;
  return (
    <div
      className="font-mono fixed inset-x-0 top-0 z-50 py-2 text-center text-sm font-medium"
      style={{
        background: "var(--color-surface)",
        color: "var(--color-accent)",
        borderBottom: "1px solid var(--color-accent)",
        boxShadow: "0 0 16px -4px var(--color-accent)",
      }}
      role="status"
    >
      ⟲ Reconnexion…
    </div>
  );
}
