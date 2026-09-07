/**
 * Builds the "blasons" image questions: national coats of arms.
 *
 * Chosen after a licence probe over five candidate image families, because it is the only one
 * left that works. What the probe found, on 50 candidates each:
 *
 *   blasons     86% public domain     monuments    0%
 *   instruments 29%                   plats       12%
 *
 * Modern photographs on Commons are overwhelmingly CC BY-SA, which is a share-alike licence
 * this project will not take on — so "devine ce monument / ce plat" is not buildable from a
 * free source, however good a round it would make. Film posters and game covers are worse
 * still: those are simply under copyright, and no filter makes them usable.
 *
 * National insignia, like flags, are usually published as public domain, and the same per-file
 * check as the flags generator throws out the ones that are not.
 *
 * Usage:  node scripts/generate-blasons.mjs [--limit=<n>]
 * Output: apps/web/public/media/blason-*.webp + seed/questions-blasons.json
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { downloadFile, fileNameOf, isFree, licenceOf, licencesFor, slugify, sparql } from "./lib/commons.mjs";

const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.slice("--limit=".length) ?? 90);

const MEDIA_DIR = join(import.meta.dirname, "..", "..", "web", "public", "media");
const OUT_JSON = join(import.meta.dirname, "..", "seed", "questions-blasons.json");

const QUERY = `SELECT ?name ?img ?sl WHERE {
  ?c wdt:P31 wd:Q6256; wdt:P94 ?img; wikibase:sitelinks ?sl.
  ?c rdfs:label ?name. FILTER(lang(?name) = "fr")
} ORDER BY DESC(?sl) LIMIT ${limit * 2}`;

const rows = (await sparql(QUERY))
  .map((r) => ({ name: r.name.value, file: fileNameOf(r.img.value), sitelinks: Number(r.sl.value) }))
  .filter((r) => !/^Q\d+$/.test(r.name));

// One entry per country: SPARQL returns a row per label variant.
const unique = [...new Map(rows.map((r) => [r.name, r])).values()].slice(0, limit);

mkdirSync(MEDIA_DIR, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), "nonoculture-blason-"));
const licences = await licencesFor(unique.map((r) => r.file));

const questions = [];
const skipped = [];

unique.forEach((row, index) => (row.rank = index));

for (const row of unique) {
  const licence = licenceOf(licences, row.file);
  if (!isFree(licence)) {
    skipped.push(`${row.name} (${licence})`);
    continue;
  }

  const key = `blason-${slugify(row.name)}.webp`;
  const target = join(MEDIA_DIR, key);
  if (!existsSync(target)) {
    let bytes;
    try {
      bytes = await downloadFile(row.file, 480);
    } catch (err) {
      skipped.push(`${row.name} (${err.message})`);
      continue;
    }
    const raw = join(tmp, `${slugify(row.name)}.img`);
    writeFileSync(raw, bytes);
    execFileSync(
      "ffmpeg",
      ["-y", "-i", raw, "-vf", "scale='min(480,iw)':-1", "-c:v", "libwebp", "-quality", "80", target],
      { stdio: "pipe" },
    );
    await new Promise((r) => setTimeout(r, 1000)); // Commons throttles bursts of image requests
  }

  // Ranked by reach, like every other generated family: the best-known countries are easiest.
  const third = Math.ceil(unique.length / 3);
  questions.push({
    theme: "blasons",
    difficulty: row.rank < third ? 1 : row.rank < third * 2 ? 2 : 3,
    type: "image",
    family: "blason-pays",
    prompt: "De quel pays sont ces armoiries ?",
    media_key: key,
    answer: row.name,
    aliases: [],
    source: `Wikimedia Commons — ${row.file} (${licence})`,
  });
  const kb = Math.round(statSync(target).size / 1024);
  console.log(`  ${row.name.slice(0, 34).padEnd(36)} ${kb} Ko`);
}

writeFileSync(OUT_JSON, JSON.stringify(questions, null, 2) + "\n", "utf-8");
console.log(`\n${questions.length} blasons -> ${OUT_JSON}`);
if (skipped.length) console.log(`écartés : ${skipped.length}\n  ${skipped.slice(0, 12).join("\n  ")}`);
