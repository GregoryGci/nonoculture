import { avatarSpec, avatarUrl } from "../lib/avatars";

export function Avatar({ id, size = 40, className }: { id: string; size?: number; className?: string }) {
  const spec = avatarSpec(id);
  if (!spec) {
    // Fallback for legacy/emoji avatars from before this set existed.
    return (
      <span className={className} style={{ fontSize: size * 0.8, lineHeight: 1 }} aria-hidden>
        {id || "🙂"}
      </span>
    );
  }
  return (
    <img
      src={avatarUrl(id)}
      width={size}
      height={size}
      alt={spec.label}
      className={className}
      style={{ borderRadius: "999px", width: size, height: size }}
    />
  );
}
