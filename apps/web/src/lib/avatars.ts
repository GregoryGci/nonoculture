/**
 * Avatars are drawn locally as SVG spheres — a cold radial gradient per identity.
 *
 * They replace the illustrated cartoon faces that were fetched from DiceBear's public API:
 * those clashed with the interface, and they made a self-contained project depend on a third
 * party being up. Hues are fixed rather than hashed so the twelve stay evenly spread and
 * visibly distinct in the picker, and they stay inside the cold half of the wheel so nothing
 * fights the monochrome palette.
 */
export interface AvatarSpec {
  id: string;
  label: string;
  hue: number;
}

export const AVATARS: AvatarSpec[] = [
  { id: "neko", label: "Cyan", hue: 188 },
  { id: "volt", label: "Azur", hue: 200 },
  { id: "glitch", label: "Ciel", hue: 210 },
  { id: "raven", label: "Océan", hue: 219 },
  { id: "nova", label: "Cobalt", hue: 228 },
  { id: "byte", label: "Outremer", hue: 237 },
  { id: "ember", label: "Indigo", hue: 246 },
  { id: "frost", label: "Iris", hue: 255 },
  { id: "chrome", label: "Violet", hue: 266 },
  { id: "pixel", label: "Améthyste", hue: 277 },
  { id: "hex", label: "Orchidée", hue: 288 },
  { id: "cipher", label: "Magenta", hue: 300 },
];

const byId = new Map(AVATARS.map((a) => [a.id, a]));

export function avatarSpec(id: string): AvatarSpec | undefined {
  return byId.get(id);
}

/** Legacy ids (and empty ones) still need a colour rather than a hole in the layout. */
export function avatarHue(id: string): number {
  const known = byId.get(id);
  if (known) return known.hue;
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return 188 + ((h >>> 0) % 112);
}
