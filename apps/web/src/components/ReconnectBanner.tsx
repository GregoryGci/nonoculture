import { AnimatePresence, motion } from "motion/react";
import type { ConnectionStatus } from "../lib/ws-client";

const BANNERS: Partial<Record<ConnectionStatus, { text: string; color: string }>> = {
  reconnecting: { text: "Reconnexion…", color: "var(--color-text-muted)" },
  rejected: { text: "Déconnecté de cette partie", color: "var(--color-danger)" },
};

export function ReconnectBanner({ status }: { status: ConnectionStatus }) {
  const banner = BANNERS[status];
  return (
    <AnimatePresence>
      {banner && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 py-3 text-[13px] font-medium"
          style={{
            background: "rgba(0,0,0,0.72)",
            backdropFilter: "blur(20px)",
            borderBottom: "1px solid var(--color-border)",
            color: banner.color,
          }}
          role="status"
        >
          <span className="inline-block size-1.5 rounded-full" style={{ background: "currentColor" }} aria-hidden />
          {banner.text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
