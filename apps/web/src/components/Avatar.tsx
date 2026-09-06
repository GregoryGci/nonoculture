import { useId } from "react";
import { avatarHue } from "../lib/avatars";

/**
 * A lit sphere. The light sits up and to the left on every avatar, so a row of them reads as
 * one set of objects under one lamp rather than twelve unrelated icons.
 */
export function Avatar({ id, size = 40, className }: { id: string; size?: number; className?: string }) {
  // Gradient ids must be unique per instance: the same avatar can appear several times on a
  // screen, and duplicate ids would make every copy resolve to the first one's gradient.
  const gradientId = useId();
  const hue = avatarHue(id);

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-hidden
      style={{ display: "block", flexShrink: 0 }}
    >
      <defs>
        <radialGradient id={gradientId} cx="35%" cy="28%" r="78%">
          <stop offset="0%" stopColor={`hsl(${hue} 90% 72%)`} />
          <stop offset="55%" stopColor={`hsl(${hue} 70% 42%)`} />
          <stop offset="100%" stopColor={`hsl(${hue + 20} 60% 14%)`} />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill={`url(#${gradientId})`} />
      <circle cx="50" cy="50" r="47.5" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
    </svg>
  );
}
