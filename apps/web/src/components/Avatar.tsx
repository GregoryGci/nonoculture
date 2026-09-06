import { avatarSrc } from "../lib/avatars";

export function Avatar({ id, size = 40, className }: { id: string; size?: number; className?: string }) {
  return (
    <img
      src={avatarSrc(id)}
      width={size}
      height={size}
      alt=""
      aria-hidden
      className={className}
      style={{ display: "block", flexShrink: 0, width: size, height: size, borderRadius: "50%" }}
    />
  );
}
