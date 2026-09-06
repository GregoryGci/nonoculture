/**
 * Avatars are generated on the fly by DiceBear's public "adventurer" style API
 * (https://api.dicebear.com) — illustrated cartoon faces, no external asset to
 * host ourselves. `id` doubles as the seed, so it's stable per avatar forever.
 *
 * Kept out of Avatar.tsx so that file only exports a component: mixing data and
 * components in one module breaks React Fast Refresh (react-refresh/only-export-components).
 */
export interface AvatarSpec {
  id: string;
  label: string;
}

export const AVATARS: AvatarSpec[] = [
  { id: "neko", label: "Neko" },
  { id: "volt", label: "Volt" },
  { id: "glitch", label: "Glitch" },
  { id: "raven", label: "Raven" },
  { id: "nova", label: "Nova" },
  { id: "byte", label: "Byte" },
  { id: "ember", label: "Ember" },
  { id: "frost", label: "Frost" },
  { id: "chrome", label: "Chrome" },
  { id: "pixel", label: "Pixel" },
  { id: "hex", label: "Hex" },
  { id: "cipher", label: "Cipher" },
];

const byId = new Map(AVATARS.map((a) => [a.id, a]));

export function avatarSpec(id: string): AvatarSpec | undefined {
  return byId.get(id);
}

export function avatarUrl(id: string): string {
  return `https://api.dicebear.com/10.x/adventurer/svg?seed=${encodeURIComponent(id)}&backgroundType=gradientLinear&backgroundColor=0d1220,1e2740`;
}
