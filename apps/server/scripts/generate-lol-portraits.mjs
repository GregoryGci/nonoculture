/**
 * Builds the blurred-portrait questions from Riot's Data Dragon.
 *
 * Data Dragon is Riot's own public asset CDN — no key, no scraping, no rate limit worth
 * speaking of — so this is the one place champion art can be taken from without going
 * through a third party who does not own it. The art stays Riot's; this is fan content, and
 * the questions live under the opt-in "lol" theme, which nobody sees unless they ask for it.
 *
 * The loading art rather than the square icon: the icon is 120 px, and a picture that has to
 * survive being blurred to 34 px and then read at the end of the round needs the resolution.
 * Cropped to its top square, which on every champion is the head and shoulders — the part
 * you actually recognise, and the part a splash art buries under a background.
 *
 * Usage:  node scripts/generate-lol-portraits.mjs [--limit=<n>]
 * Output: apps/web/public/media/lol-portrait-*.webp + seed/questions-lol-portraits.json
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UA, json, slugify } from "./lib/commons.mjs";

const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.slice("--limit=".length) ?? 200);

const MEDIA_DIR = join(import.meta.dirname, "..", "..", "web", "public", "media");
const OUT_JSON = join(import.meta.dirname, "..", "seed", "questions-lol-portraits.json");

/**
 * Names whose spelling nobody agrees on, spelled out.
 *
 * `normalizeAnswer` turns punctuation into spaces, so "Kai'Sa" is stored as "kai sa" and a
 * player typing "kaisa" — which is how everyone types it — would be marked wrong. The
 * de-punctuated form is added for every champion automatically; this table is only for the
 * ones where the short name people actually say is a different word.
 */
const EXTRA_ALIASES = {
  "Nunu & Willump": ["Nunu", "Nunu et Willump"],
  "Dr. Mundo": ["Mundo"],
  "Renata Glasc": ["Renata"],
  "Aurelion Sol": ["Aurelion", "ASol"],
  "Master Yi": ["Yi"],
  "Jarvan IV": ["Jarvan", "Jarvan 4"],
  "Miss Fortune": ["MF"],
  "Twisted Fate": ["TF"],
  "Lee Sin": ["Lee"],
  "Xin Zhao": ["Xin"],
  "Tahm Kench": ["Tahm"],
  "Bel'Veth": ["Belveth"],
  Wukong: ["MonkeyKing"],
};

/** Ways to ask, so the bank's unique index on (prompt, answer) is not the limit here. */
const PROMPTS = ["Quel champion se cache derrière cette image ?", "Qui est ce champion ?"];

const versions = await json("https://ddragon.leagueoflegends.com/api/versions.json");
const version = versions[0];
const { data } = await json(`https://ddragon.leagueoflegends.com/cdn/${version}/data/fr_FR/champion.json`);
console.log(`Data Dragon ${version} — ${Object.keys(data).length} champions`);

mkdirSync(MEDIA_DIR, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), "nonoculture-lol-"));

// Release order: the champion key counts up from the 2009 roster, so it doubles as a rough
// "how long has everyone had to learn this face" — the only fame signal Data Dragon carries.
const champions = Object.values(data)
  .sort((a, b) => Number(a.key) - Number(b.key))
  .slice(0, limit);

const questions = [];
const skipped = [];

for (const [index, champion] of champions.entries()) {
  const key = `lol-portrait-${slugify(champion.id)}.webp`;
  const target = join(MEDIA_DIR, key);

  if (!existsSync(target)) {
    const url = `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${champion.id}_0.jpg`;
    let bytes;
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      bytes = Buffer.from(await res.arrayBuffer());
    } catch (err) {
      skipped.push(`${champion.name} (${err.message})`);
      continue;
    }
    const raw = join(tmp, `${champion.id}.jpg`);
    writeFileSync(raw, bytes);
    execFileSync(
      "ffmpeg",
      // Top square of the portrait, then the house spec: WebP, 512 px, quality 80.
      ["-y", "-i", raw, "-vf", "crop=iw:iw:0:0,scale=512:512", "-c:v", "libwebp", "-quality", "80", target],
      { stdio: "pipe" },
    );
  }

  const bare = champion.name.replace(/[^\p{L}\p{N}]/gu, "");
  const aliases = [...new Set([bare, champion.id, ...(EXTRA_ALIASES[champion.name] ?? [])])].filter(
    (a) => a.toLowerCase() !== champion.name.toLowerCase(),
  );

  questions.push({
    theme: "lol",
    // A blurred picture is its own difficulty curve; the roster order is the only tilt.
    difficulty: index < 60 ? 1 : index < 120 ? 2 : 3,
    type: "image",
    answer_kind: "blur",
    family: "lol-portrait",
    prompt: PROMPTS[index % PROMPTS.length],
    media_key: key,
    answer: champion.name,
    aliases,
    source: `Riot Games — Data Dragon ${version} (${champion.id}_0.jpg)`,
  });

  const kb = Math.round(statSync(target).size / 1024);
  console.log(`  ${champion.name.padEnd(18)} ${kb} Ko`);
}

writeFileSync(OUT_JSON, JSON.stringify(questions, null, 2) + "\n", "utf-8");
console.log(`\n${questions.length} portraits -> ${OUT_JSON}`);
if (skipped.length) console.log(`écartés : ${skipped.length}\n  ${skipped.join("\n  ")}`);
