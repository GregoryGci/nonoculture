/**
 * Generates the twelve player avatars as static SVG files, once, at authoring time.
 *
 * Style: DiceBear "lorelei" (CC0 — no attribution required), rendered locally through the
 * npm package rather than the public HTTP API, so the app ships the finished files and never
 * depends on a third party being reachable. Re-run only to change the set:
 *   node apps/server/scripts/generate-avatars.mjs
 */
import { createAvatar } from "@dicebear/core";
import { lorelei } from "@dicebear/collection";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Seed + a cold, desaturated backdrop per avatar, so a row of them stays inside the
// interface palette instead of bringing DiceBear's default bright pastels along.
const AVATARS = [
  { id: "kuro", seed: "Aneko", bg: "16202e" },
  { id: "aoi", seed: "Ryusei", bg: "17293c" },
  { id: "sora", seed: "Hikari", bg: "163043" },
  { id: "mizu", seed: "Kaito", bg: "153742" },
  { id: "hoshi", seed: "Nagisa", bg: "1b2b45" },
  { id: "yuki", seed: "Shiori", bg: "202741" },
  { id: "kaze", seed: "Renji", bg: "26243f" },
  { id: "tsuki", seed: "Mikan", bg: "2b2340" },
  { id: "hana", seed: "Yuzuki", bg: "31223d" },
  { id: "akari", seed: "Sakura", bg: "38213a" },
  { id: "rin", seed: "Tsubaki", bg: "3d2036" },
  { id: "kage", seed: "Kurosawa", bg: "412031" },
];

const outDir = join(import.meta.dirname, "..", "..", "web", "public", "avatars");
mkdirSync(outDir, { recursive: true });

for (const { id, seed, bg } of AVATARS) {
  const svg = createAvatar(lorelei, {
    seed,
    size: 128,
    radius: 50, // circular crop, so every avatar is a disc like the rest of the UI
    backgroundColor: [bg],
  }).toString();
  writeFileSync(join(outDir, `${id}.svg`), svg, "utf-8");
  console.log("wrote", `${id}.svg`);
}
console.log(`\n${AVATARS.length} avatars generated in apps/web/public/avatars/`);
