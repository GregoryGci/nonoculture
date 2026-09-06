/**
 * The twelve player avatars: illustrated character heads, DiceBear's "lorelei" style (CC0,
 * no attribution required).
 *
 * They are generated once into apps/web/public/avatars/*.svg by
 * apps/server/scripts/generate-avatars.mjs and committed, so the app ships finished files.
 * The previous version called DiceBear's public HTTP API at render time, which made a
 * self-contained project depend on a third party staying up.
 */
export interface AvatarSpec {
  id: string;
  label: string;
}

export const AVATARS: AvatarSpec[] = [
  { id: "kuro", label: "Kuro" },
  { id: "aoi", label: "Aoi" },
  { id: "sora", label: "Sora" },
  { id: "mizu", label: "Mizu" },
  { id: "hoshi", label: "Hoshi" },
  { id: "yuki", label: "Yuki" },
  { id: "kaze", label: "Kaze" },
  { id: "tsuki", label: "Tsuki" },
  { id: "hana", label: "Hana" },
  { id: "akari", label: "Akari" },
  { id: "rin", label: "Rin" },
  { id: "kage", label: "Kage" },
];

const byId = new Map(AVATARS.map((a) => [a.id, a]));

export function avatarSpec(id: string): AvatarSpec | undefined {
  return byId.get(id);
}

/** Players carrying an id from an older set still need a face rather than a hole. */
export function avatarSrc(id: string): string {
  if (byId.has(id)) return `/avatars/${id}.svg`;
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `/avatars/${AVATARS[(h >>> 0) % AVATARS.length]!.id}.svg`;
}
