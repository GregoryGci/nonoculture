/**
 * The player avatars, in two sets.
 *
 * The first twelve are illustrated character heads from DiceBear's "lorelei" style (CC0, no
 * attribution), generated once into apps/web/public/avatars/*.svg by
 * apps/server/scripts/generate-avatars.mjs and committed — the app ships finished files rather
 * than calling a third party's HTTP API at render time.
 *
 * The last twelve are caricature portraits supplied for this project, cut out of a single
 * sheet by scripts/crop-avatars (see DECISIONS.md). They are .webp rather than .svg, which is
 * why every entry now carries its own extension instead of the loader assuming one.
 */
export interface AvatarSpec {
  id: string;
  label: string;
  /** File extension under /avatars. The two sets do not share a format. */
  ext: "svg" | "webp";
}

export const AVATARS: AvatarSpec[] = [
  { id: "kuro", label: "Kuro", ext: "svg" },
  { id: "aoi", label: "Aoi", ext: "svg" },
  { id: "sora", label: "Sora", ext: "svg" },
  { id: "mizu", label: "Mizu", ext: "svg" },
  { id: "hoshi", label: "Hoshi", ext: "svg" },
  { id: "yuki", label: "Yuki", ext: "svg" },
  { id: "kaze", label: "Kaze", ext: "svg" },
  { id: "tsuki", label: "Tsuki", ext: "svg" },
  { id: "hana", label: "Hana", ext: "svg" },
  { id: "akari", label: "Akari", ext: "svg" },
  { id: "rin", label: "Rin", ext: "svg" },
  { id: "kage", label: "Kage", ext: "svg" },
  { id: "giscard", label: "Giscard d'Estaing", ext: "webp" },
  { id: "mitterrand", label: "Mitterrand", ext: "webp" },
  { id: "chirac", label: "Chirac", ext: "webp" },
  { id: "sarkozy", label: "Sarkozy", ext: "webp" },
  { id: "hollande", label: "Hollande", ext: "webp" },
  { id: "macron", label: "Macron", ext: "webp" },
  { id: "staline", label: "Staline", ext: "webp" },
  { id: "mao", label: "Mao Zedong", ext: "webp" },
  { id: "saddam", label: "Saddam Hussein", ext: "webp" },
  { id: "kadhafi", label: "Kadhafi", ext: "webp" },
  { id: "polpot", label: "Pol Pot", ext: "webp" },
  { id: "hitler", label: "Hitler", ext: "webp" },
];

const byId = new Map(AVATARS.map((a) => [a.id, a]));

export function avatarSpec(id: string): AvatarSpec | undefined {
  return byId.get(id);
}

/** Players carrying an id from an older set still need a face rather than a hole. */
export function avatarSrc(id: string): string {
  const known = byId.get(id);
  if (known) return `/avatars/${id}.${known.ext}`;
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const fallback = AVATARS[(h >>> 0) % AVATARS.length]!;
  return `/avatars/${fallback.id}.${fallback.ext}`;
}
