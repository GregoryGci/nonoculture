/**
 * Original, hand-specified SVG avatar set — no external images, no copyrighted art.
 * Built entirely from simple, robust primitives (circles/ellipses/short curves) so the
 * result stays clean at small sizes instead of risking a mangled hand-authored path.
 */
interface AvatarSpec {
  id: string;
  label: string;
  skin: string;
  hair: string;
  hairShape: "round" | "spiky" | "twin" | "mohawk" | "side";
  eye: string;
  mouth: "smile" | "smirk" | "open" | "wink" | "cat" | "tongue";
  accent?: string;
}

const NEON = { cyan: "#2de2ff", magenta: "#ff2e9a", lime: "#9dff2e", amber: "#ffb02e", violet: "#a06bff" };

export const AVATARS: AvatarSpec[] = [
  { id: "neko", label: "Neko", skin: "#f2c9a1", hair: "#2b2340", hairShape: "twin", eye: "#2de2ff", mouth: "cat", accent: NEON.cyan },
  { id: "volt", label: "Volt", skin: "#e7b38b", hair: "#ffb02e", hairShape: "spiky", eye: "#1a1a1a", mouth: "smirk", accent: NEON.amber },
  { id: "glitch", label: "Glitch", skin: "#d7a9c9", hair: "#ff2e9a", hairShape: "mohawk", eye: "#9dff2e", mouth: "open", accent: NEON.magenta },
  { id: "raven", label: "Raven", skin: "#c98f6b", hair: "#151522", hairShape: "side", eye: "#a06bff", mouth: "smile", accent: NEON.violet },
  { id: "nova", label: "Nova", skin: "#f4d9b0", hair: "#a06bff", hairShape: "round", eye: "#2de2ff", mouth: "wink", accent: NEON.cyan },
  { id: "byte", label: "Byte", skin: "#8a6a52", hair: "#2de2ff", hairShape: "spiky", eye: "#ffffff", mouth: "smile", accent: NEON.lime },
  { id: "ember", label: "Ember", skin: "#e2a672", hair: "#ff5a3c", hairShape: "twin", eye: "#ffb02e", mouth: "tongue", accent: NEON.magenta },
  { id: "frost", label: "Frost", skin: "#eef2f8", hair: "#dfe9ff", hairShape: "round", eye: "#2de2ff", mouth: "smirk", accent: NEON.cyan },
  { id: "chrome", label: "Chrome", skin: "#b9c2cf", hair: "#4c5670", hairShape: "mohawk", eye: "#ff2e9a", mouth: "smile", accent: NEON.magenta },
  { id: "pixel", label: "Pixel", skin: "#f2c9a1", hair: "#9dff2e", hairShape: "side", eye: "#151522", mouth: "cat", accent: NEON.lime },
  { id: "hex", label: "Hex", skin: "#a97455", hair: "#151522", hairShape: "round", eye: "#ff2e9a", mouth: "open", accent: NEON.violet },
  { id: "cipher", label: "Cipher", skin: "#e7b38b", hair: "#2b2340", hairShape: "spiky", eye: "#9dff2e", mouth: "wink", accent: NEON.cyan },
];

const byId = new Map(AVATARS.map((a) => [a.id, a]));

function Hair({ shape, color }: { shape: AvatarSpec["hairShape"]; color: string }) {
  switch (shape) {
    case "round":
      return <ellipse cx="50" cy="36" rx="37" ry="27" fill={color} />;
    case "spiky":
      return (
        <>
          <ellipse cx="50" cy="38" rx="36" ry="24" fill={color} />
          <polygon points="18,28 24,4 30,30" fill={color} />
          <polygon points="38,20 44,0 50,22" fill={color} />
          <polygon points="58,20 64,0 70,22" fill={color} />
          <polygon points="70,28 78,6 82,32" fill={color} />
        </>
      );
    case "twin":
      return (
        <>
          <ellipse cx="50" cy="34" rx="34" ry="22" fill={color} />
          <ellipse cx="11" cy="56" rx="9" ry="22" fill={color} />
          <ellipse cx="89" cy="56" rx="9" ry="22" fill={color} />
        </>
      );
    case "mohawk":
      return <rect x="41" y="2" width="18" height="34" rx="9" fill={color} />;
    case "side":
      return <ellipse cx="38" cy="36" rx="40" ry="26" fill={color} />;
  }
}

function Mouth({ shape }: { shape: AvatarSpec["mouth"] }) {
  switch (shape) {
    case "smile":
      return <path d="M40,72 Q50,80 60,72" stroke="#151522" strokeWidth="3" strokeLinecap="round" fill="none" />;
    case "smirk":
      return <path d="M40,74 Q56,81 63,69" stroke="#151522" strokeWidth="3" strokeLinecap="round" fill="none" />;
    case "open":
      return <ellipse cx="50" cy="75" rx="6" ry="8" fill="#151522" />;
    case "wink":
      return <path d="M40,72 Q50,80 60,72" stroke="#151522" strokeWidth="3" strokeLinecap="round" fill="none" />;
    case "cat":
      return (
        <path
          d="M42,73 Q47,80 50,73 Q53,80 58,73"
          stroke="#151522"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      );
    case "tongue":
      return (
        <>
          <path d="M38,71 Q50,80 62,71" stroke="#151522" strokeWidth="3" strokeLinecap="round" fill="none" />
          <ellipse cx="50" cy="78" rx="6" ry="7" fill={NEON.magenta} />
        </>
      );
  }
}

function Eye({ cx, color, closed }: { cx: number; color: string; closed?: boolean }) {
  if (closed) {
    return <path d={`M${cx - 8},52 Q${cx},59 ${cx + 8},52`} stroke="#151522" strokeWidth="3" strokeLinecap="round" fill="none" />;
  }
  return (
    <>
      <ellipse cx={cx} cy="53" rx="8" ry="10" fill="#fff" />
      <circle cx={cx} cy="55" r="4.5" fill={color} />
    </>
  );
}

export function Avatar({ id, size = 40, className }: { id: string; size?: number; className?: string }) {
  const spec = byId.get(id);
  if (!spec) {
    // Fallback for legacy/emoji avatars from before this set existed.
    return (
      <span className={className} style={{ fontSize: size * 0.8, lineHeight: 1 }} aria-hidden>
        {id || "🙂"}
      </span>
    );
  }
  const isWink = spec.mouth === "wink";
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} role="img" aria-label={spec.label}>
      <circle cx="50" cy="54" r="40" fill={spec.skin} />
      <Hair shape={spec.hairShape} color={spec.hair} />
      <Eye cx={36} color={spec.eye} closed={isWink} />
      <Eye cx={64} color={spec.eye} />
      <Mouth shape={spec.mouth} />
      {spec.accent && <line x1="26" y1="60" x2="32" y2="68" stroke={spec.accent} strokeWidth="2.5" strokeLinecap="round" />}
    </svg>
  );
}
