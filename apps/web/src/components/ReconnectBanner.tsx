import type { ConnectionStatus } from "../lib/ws-client";

export function ReconnectBanner({ status }: { status: ConnectionStatus }) {
  if (status !== "reconnecting") return null;
  return (
    <div
      className="fixed inset-x-0 top-0 z-50 py-2 text-center text-sm font-medium transition-opacity"
      style={{ background: "var(--color-surface)", color: "var(--color-text-muted)", borderBottom: "1px solid var(--color-border)" }}
      role="status"
    >
      Reconnexion…
    </div>
  );
}
