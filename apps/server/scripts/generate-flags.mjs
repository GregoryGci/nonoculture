/**
 * Builds the "drapeaux" image questions: downloads country flags, compresses them into the
 * static media folder, and writes a seedable questions file.
 *
 * Every flag's licence is checked individually against Wikimedia Commons and anything that
 * is not public domain is dropped. Flags are usually PD as government insignia, but "usually"
 * is not a licence — earlier in this project a set of planet images looked equally safe and
 * turned out to be CC BY-SA.
 *
 * Usage:  node scripts/generate-flags.mjs [--limit=<n>]
 * Output: apps/web/public/media/flag-*.webp + seed/questions-flags.json
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const UA = "NonoCulture-quiz/1.0 (educational party game; contact via github.com/GregoryGci)";
const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.slice("--limit=".length) ?? 90);

const MEDIA_DIR = join(import.meta.dirname, "..", "..", "web", "public", "media");
const OUT_JSON = join(import.meta.dirname, "..", "seed", "questions-flags.json");

/** Only these count as "no obligation attached". Anything else is skipped, loudly. */
const FREE_LICENCES = [/public domain/i, /^cc0/i, /^pd/i];

async function json(url, attempts = 4) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (res.ok) return res.json();
    if (res.status !== 429 || attempt === attempts) throw new Error(`${res.status} on ${url.slice(0, 80)}`);
    const wait = attempt * 4000;
    console.log(`   ...429, pause ${wait / 1000}s`);
    await new Promise((r) => setTimeout(r, wait));
  }
  throw new Error("unreachable");
}

/**
 * Licences for many files at once. One request per flag got us rate-limited; the Commons API
 * takes up to 50 titles per call, which turns ninety requests into two.
 */
async function licencesFor(files) {
  const found = new Map();
  for (let i = 0; i < files.length; i += 50) {
    const batch = files.slice(i, i + 50);
    const data = await json(
      `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata` +
        `&titles=${encodeURIComponent(batch.map((f) => `File:${f}`).join("|"))}`,
    );
    for (const page of Object.values(data.query?.pages ?? {})) {
      const title = String(page.title ?? "").replace(/^File:/, "");
      found.set(title, page.imageinfo?.[0]?.extmetadata?.LicenseShortName?.value ?? "inconnue");
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  return found;
}

const query = `SELECT ?name ?flag ?sitelinks WHERE {
  ?country wdt:P31 wd:Q6256; wdt:P41 ?flag; wikibase:sitelinks ?sitelinks.
  ?country rdfs:label ?name. FILTER(lang(?name) = "fr")
} ORDER BY DESC(?sitelinks) LIMIT ${limit}`;

const results = (await json(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`)).results
  .bindings;

mkdirSync(MEDIA_DIR, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), "nonoculture-flags-"));
const questions = [];
const skipped = [];

// Ranked by reach, like the other generated families: the best-known flags are the easy ones.
results.forEach((row, index) => (row.rank = index));

const licences = await licencesFor(results.map((r) => decodeURIComponent(r.flag.value.split("/").pop())));

for (const row of results) {
  const country = row.name.value;
  const file = decodeURIComponent(row.flag.value.split("/").pop());

  // Commons normalises underscores to spaces in the title it echoes back.
  const licence = licences.get(file) ?? licences.get(file.replace(/_/g, " ")) ?? "inconnue";
  if (!FREE_LICENCES.some((re) => re.test(licence))) {
    skipped.push(`${country} (${licence})`);
    continue;
  }

  const res = await fetch(`https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=480`, {
    headers: { "User-Agent": UA },
    redirect: "follow",
  });
  if (!res.ok) {
    skipped.push(`${country} (téléchargement ${res.status})`);
    continue;
  }

  const slug = country
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const key = `flag-${slug}.webp`;
  const raw = join(tmp, `${slug}.png`);
  writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
  // Same spec as the rest of the media pipeline: WebP, capped width, quality 80.
  execFileSync(
    "ffmpeg",
    ["-y", "-i", raw, "-vf", "scale='min(480,iw)':-1", "-c:v", "libwebp", "-quality", "80", join(MEDIA_DIR, key)],
    { stdio: "pipe" },
  );

  const third = Math.ceil(results.length / 3);
  questions.push({
    theme: "drapeaux",
    difficulty: row.rank < third ? 1 : row.rank < third * 2 ? 2 : 3,
    type: "image",
    prompt: "Quel pays a ce drapeau ?",
    media_key: key,
    answer: country,
    aliases: [],
    source: `Wikimedia Commons — ${file} (${licence})`,
  });
  const kb = Math.round(statSync(join(MEDIA_DIR, key)).size / 1024);
  console.log(`  ${country.padEnd(24)} ${key.padEnd(34)} ${kb} Ko`);
  await new Promise((r) => setTimeout(r, 250)); // polite with Commons
}

writeFileSync(OUT_JSON, JSON.stringify(questions, null, 2) + "\n", "utf-8");
console.log(`\n${questions.length} drapeaux -> ${OUT_JSON}`);
if (skipped.length) console.log(`écartés (licence ou téléchargement) : ${skipped.length}\n  ${skipped.join("\n  ")}`);
