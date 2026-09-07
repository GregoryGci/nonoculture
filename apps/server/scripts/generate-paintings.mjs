/**
 * Builds the "art" image questions from paintings on Wikimedia Commons.
 *
 * Why paintings, out of everything with a picture: a licence probe over five candidate
 * families (paintings, portraits, coats of arms, monuments, animals) found paintings at 97%
 * public domain, against 85% for the others and a timeout for the rest. Old art is out of
 * copyright almost by definition, so almost nothing is lost to the licence filter — and
 * unlike flags, which were the only image family in the bank, a painting is not the same
 * question fifty times.
 *
 * One painting produces one question, never two, and which one depends on how famous it is:
 *
 *  - A painting everyone recognises is asked by title ("Quel est le titre de ce tableau ?").
 *    Nobody needs to be told La Joconde is a Leonardo.
 *  - A less famous painting by a famous painter is asked by author ("Qui a peint ce tableau ?").
 *    That one is about recognising a style, which is a different game and a better one.
 *
 * Usage:  node scripts/generate-paintings.mjs [--limit=<n>]
 * Output: apps/web/public/media/art-*.webp + seed/questions-paintings.json
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { downloadFile, fileNameOf, isFree, licenceOf, licencesFor, slugify, sparql } from "./lib/commons.mjs";

const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.slice("--limit=".length) ?? 120);

const MEDIA_DIR = join(import.meta.dirname, "..", "..", "web", "public", "media");
const OUT_JSON = join(import.meta.dirname, "..", "seed", "questions-paintings.json");

/** Above this many Wikipedia editions, the painting itself is the recognisable thing. */
const ICONIC_SITELINKS = 45;
/** Below this, the painter is not famous enough for "who painted this?" to be fair. */
const MIN_PAINTER_SITELINKS = 40;

const QUERY = `SELECT ?title ?painter ?img ?sl ?painterSl WHERE {
  ?w wdt:P31 wd:Q3305213; wdt:P18 ?img; wdt:P170 ?p; wikibase:sitelinks ?sl.
  ?p wikibase:sitelinks ?painterSl.
  FILTER(?sl > 15)
  ?w rdfs:label ?title. FILTER(lang(?title) = "fr")
  ?p rdfs:label ?painter. FILTER(lang(?painter) = "fr")
} ORDER BY DESC(?sl) LIMIT ${limit * 2}`;

const rows = (await sparql(QUERY))
  .map((r) => ({
    title: r.title.value,
    painter: r.painter.value,
    file: fileNameOf(r.img.value),
    sitelinks: Number(r.sl.value),
    painterSitelinks: Number(r.painterSl.value),
  }))
  // A title that is a bare inventory number or longer than a headline makes no question.
  .filter((r) => r.title.length <= 45 && !/^Q\d+$/.test(r.title) && !/^\d+$/.test(r.title));

// One entry per painting: SPARQL returns a row per label and some works list several painters.
const unique = [...new Map(rows.map((r) => [r.file, r])).values()].slice(0, limit);

mkdirSync(MEDIA_DIR, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), "nonoculture-art-"));
const licences = await licencesFor(unique.map((r) => r.file));

const questions = [];
const skipped = [];

for (const row of unique) {
  const licence = licenceOf(licences, row.file);
  if (!isFree(licence)) {
    skipped.push(`${row.title} (${licence})`);
    continue;
  }

  const iconic = row.sitelinks >= ICONIC_SITELINKS;
  if (!iconic && row.painterSitelinks < MIN_PAINTER_SITELINKS) {
    skipped.push(`${row.title} (ni l'œuvre ni le peintre assez connus)`);
    continue;
  }

  let bytes;
  try {
    bytes = await downloadFile(row.file, 640);
  } catch (err) {
    skipped.push(`${row.title} (${err.message})`);
    continue;
  }

  const key = `art-${slugify(row.title)}.webp`;
  const raw = join(tmp, `${slugify(row.title)}.img`);
  writeFileSync(raw, bytes);
  // Same spec as the rest of the media pipeline: WebP, capped width, quality 80.
  execFileSync(
    "ffmpeg",
    ["-y", "-i", raw, "-vf", "scale='min(640,iw)':-1", "-c:v", "libwebp", "-quality", "80", join(MEDIA_DIR, key)],
    { stdio: "pipe" },
  );

  questions.push({
    theme: "art",
    // Recognising a famous painting is easy; naming its painter from style is not.
    difficulty: iconic ? (row.sitelinks > 80 ? 1 : 2) : 3,
    type: "image",
    family: iconic ? "tableau-titre" : "tableau-peintre",
    prompt: iconic ? "Quel est le titre de ce tableau ?" : "Qui a peint ce tableau ?",
    media_key: key,
    answer: iconic ? row.title : row.painter,
    aliases: [],
    source: `Wikimedia Commons — ${row.file} (${licence})`,
  });

  const kb = Math.round(statSync(join(MEDIA_DIR, key)).size / 1024);
  console.log(`  ${(iconic ? "titre " : "peintre").padEnd(8)} ${row.title.slice(0, 40).padEnd(42)} ${kb} Ko`);
  await new Promise((r) => setTimeout(r, 250)); // polite with Commons
}

writeFileSync(OUT_JSON, JSON.stringify(questions, null, 2) + "\n", "utf-8");
const titres = questions.filter((q) => q.family === "tableau-titre").length;
console.log(`\n${questions.length} tableaux -> ${OUT_JSON} (${titres} par titre, ${questions.length - titres} par peintre)`);
if (skipped.length) console.log(`écartés : ${skipped.length}\n  ${skipped.slice(0, 20).join("\n  ")}`);
