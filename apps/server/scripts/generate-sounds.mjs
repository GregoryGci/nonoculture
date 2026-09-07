/**
 * Builds sound questions from Wikimedia recordings, without needing anyone's API key.
 *
 * The fifteen sounds already in the bank came from Freesound, which requires a personal token
 * — so the bank could only grow when someone was around to supply one. Wikidata's P51 ("audio
 * recording") points at Commons files instead, which are open to anyone and go through the
 * same per-file licence check as the flags and the paintings.
 *
 * Commons rate-limits bursts hard, so metadata is batched fifty titles at a time and the
 * downloads are spaced out. A run takes a few minutes and is meant to.
 *
 * Usage:  node scripts/generate-sounds.mjs [--limit=<n per family>]
 * Output: apps/web/public/media/son-*.mp3 + seed/questions-sons.json
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { downloadFile, fileNameOf, isFree, licenceOf, licencesFor, slugify, sparql } from "./lib/commons.mjs";

const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.slice("--limit=".length) ?? 60);

const MEDIA_DIR = join(import.meta.dirname, "..", "..", "web", "public", "media");
const OUT_JSON = join(import.meta.dirname, "..", "seed", "questions-sons.json");

/** Long enough to recognise, short enough that nobody waits. */
const CLIP_SECONDS = 12;

const FAMILIES = [
  {
    id: "son-animal",
    theme: "animaux",
    prompt: "Quel animal entend-on ?",
    query: `SELECT ?name ?audio ?sl WHERE {
      ?t wdt:P31 wd:Q16521; wdt:P51 ?audio; wikibase:sitelinks ?sl.
      FILTER(?sl > 25)
      ?t wdt:P1843 ?name. FILTER(lang(?name) = "fr")
    } ORDER BY DESC(?sl)`,
  },
  {
    id: "son-instrument",
    theme: "musique",
    prompt: "Quel instrument de musique entend-on ?",
    query: `SELECT ?name ?audio ?sl WHERE {
      ?i wdt:P31/wdt:P279* wd:Q34379; wdt:P51 ?audio; wikibase:sitelinks ?sl.
      ?i rdfs:label ?name. FILTER(lang(?name) = "fr")
    } ORDER BY DESC(?sl)`,
  },
  {
    id: "son-hymne",
    theme: "geo",
    prompt: "De quel pays est cet hymne national ?",
    query: `SELECT ?name ?audio ?sl WHERE {
      ?c wdt:P31 wd:Q6256; wdt:P85 ?a; wikibase:sitelinks ?sl.
      ?a wdt:P51 ?audio.
      ?c rdfs:label ?name. FILTER(lang(?name) = "fr")
    } ORDER BY DESC(?sl)`,
  },
];

mkdirSync(MEDIA_DIR, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), "nonoculture-sons-"));
const questions = [];

for (const family of FAMILIES) {
  let rows;
  try {
    rows = await sparql(`${family.query} LIMIT ${limit * 3}`);
  } catch (err) {
    console.log(`${family.id.padEnd(16)} ABANDONNÉ (${err.message})`);
    continue;
  }

  // Grouped by *recording*, not by name. Wikidata lists every French vernacular name a species
  // has, so the wolf arrived four times — "loup", "loup commun", "loup gris", "loup vulgaire" —
  // as four questions playing the identical clip. One question each, the shortest name as the
  // answer and the rest accepted as aliases, which is also fairer to whoever answers.
  const byRecording = new Map();
  for (const row of rows) {
    const name = row.name.value;
    if (/^Q\d+$/.test(name) || name.length > 40) continue;
    const entry = byRecording.get(row.audio.value) ?? { audio: row.audio, names: [] };
    if (!entry.names.includes(name)) entry.names.push(name);
    byRecording.set(row.audio.value, entry);
  }
  const unique = [...byRecording.values()]
    .map(({ audio, names }) => {
      const sorted = [...names].sort((a, b) => a.length - b.length);
      return { audio, name: sorted[0], aliases: sorted.slice(1) };
    })
    .slice(0, limit);
  if (unique.length === 0) {
    console.log(`${family.id.padEnd(16)} 0 candidat`);
    continue;
  }

  const files = unique.map((r) => fileNameOf(r.audio.value));
  const licences = await licencesFor(files);

  let kept = 0;
  const skipped = [];
  for (const row of unique) {
    const name = row.name;
    const file = fileNameOf(row.audio.value);
    const licence = licenceOf(licences, file);
    if (!isFree(licence)) {
      skipped.push(`${name} (${licence})`);
      continue;
    }

    const key = `${family.id}-${slugify(name)}.mp3`;
    const target = join(MEDIA_DIR, key);
    if (!existsSync(target)) {
      let bytes;
      try {
        bytes = await downloadFile(file, 0);
      } catch (err) {
        skipped.push(`${name} (${err.message})`);
        continue;
      }
      const raw = join(tmp, file.replace(/[^\w.-]/g, "_"));
      writeFileSync(raw, bytes);
      try {
        // Mono 96 kbps: these are recognition clips, not listening material.
        execFileSync(
          "ffmpeg",
          ["-y", "-i", raw, "-t", String(CLIP_SECONDS), "-ac", "1", "-b:a", "96k", "-c:a", "libmp3lame", target],
          { stdio: "pipe" },
        );
      } catch {
        skipped.push(`${name} (transcodage impossible)`);
        continue;
      }
      await new Promise((r) => setTimeout(r, 900));
    }

    questions.push({
      theme: family.theme,
      difficulty: kept < limit / 3 ? 1 : kept < (limit * 2) / 3 ? 2 : 3,
      type: "audio",
      family: family.id,
      prompt: family.prompt,
      media_key: key,
      answer: name,
      aliases: row.aliases,
      source: `Wikimedia Commons — ${file} (${licence})`,
    });
    kept++;
    const kb = Math.round(statSync(target).size / 1024);
    console.log(`  ${family.id.padEnd(16)} ${name.slice(0, 30).padEnd(32)} ${kb} Ko`);
  }
  console.log(`${family.id.padEnd(16)} ${kept} gardés, ${skipped.length} écartés`);
}

writeFileSync(OUT_JSON, JSON.stringify(questions, null, 2) + "\n", "utf-8");
console.log(`\n${questions.length} questions son -> ${OUT_JSON}`);
