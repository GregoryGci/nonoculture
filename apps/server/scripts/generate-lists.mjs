/**
 * Generates the "citez…" list questions the duel round runs on.
 *
 * A duel is self-scored: it counts how many valid items each contestant names, so the
 * question has to carry its whole set of accepted answers rather than a single one. That set
 * lives in `aliases`, which the answer matcher already treats as accepted spellings — no
 * schema change needed, only answer_kind = "list" to mark how it is judged.
 *
 * Usage:  node scripts/generate-lists.mjs
 * Output: seed/questions-lists.json
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const ENDPOINT = "https://query.wikidata.org/sparql";
const UA = "NonoCulture-quiz/1.0 (educational party game; contact via github.com/GregoryGci)";

/** Enough to make a race, few enough that nobody clears it in 45 seconds. */
const MIN_ITEMS = 6;
const MAX_ITEMS = 40;

const FAMILIES = [
  {
    id: "films-realisateur",
    theme: "cinema",
    prompt: (subject) => `Citez des films réalisés par ${subject}`,
    query: `SELECT ?subject (GROUP_CONCAT(DISTINCT ?item; separator="||") AS ?items) (SAMPLE(?sl) AS ?sitelinks) WHERE {
      ?f wdt:P31 wd:Q11424; wdt:P57 ?d.
      ?d wikibase:sitelinks ?sl. FILTER(?sl > 70)
      ?d rdfs:label ?subject. FILTER(lang(?subject) = "fr")
      ?f rdfs:label ?item. FILTER(lang(?item) = "fr")
    } GROUP BY ?subject`,
  },
  {
    id: "livres-auteur",
    theme: "litterature",
    prompt: (subject) => `Citez des livres écrits par ${subject}`,
    query: `SELECT ?subject (GROUP_CONCAT(DISTINCT ?item; separator="||") AS ?items) (SAMPLE(?sl) AS ?sitelinks) WHERE {
      ?b wdt:P31 wd:Q7725634; wdt:P50 ?a.
      ?a wikibase:sitelinks ?sl. FILTER(?sl > 60)
      ?a rdfs:label ?subject. FILTER(lang(?subject) = "fr")
      ?b rdfs:label ?item. FILTER(lang(?item) = "fr")
    } GROUP BY ?subject`,
  },
  {
    id: "pays-continent",
    theme: "geo",
    prompt: (subject) => `Citez des pays situés en ${subject}`,
    query: `SELECT ?subject (GROUP_CONCAT(DISTINCT ?item; separator="||") AS ?items) (SAMPLE(?sl) AS ?sitelinks) WHERE {
      ?c wdt:P31 wd:Q6256; wdt:P30 ?cont.
      ?cont wikibase:sitelinks ?sl.
      ?cont rdfs:label ?subject. FILTER(lang(?subject) = "fr")
      ?c rdfs:label ?item. FILTER(lang(?item) = "fr")
    } GROUP BY ?subject`,
  },
  {
    id: "albums-artiste",
    theme: "musique",
    prompt: (subject) => `Citez des albums de ${subject}`,
    query: `SELECT ?subject (GROUP_CONCAT(DISTINCT ?item; separator="||") AS ?items) (SAMPLE(?sl) AS ?sitelinks) WHERE {
      ?al wdt:P31 wd:Q482994; wdt:P175 ?a.
      ?a wikibase:sitelinks ?sl. FILTER(?sl > 60)
      ?a rdfs:label ?subject. FILTER(lang(?subject) = "fr")
      ?al rdfs:label ?item. FILTER(lang(?item) = "fr")
    } GROUP BY ?subject`,
  },
];

async function sparql(query, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(`${ENDPOINT}?format=json&query=${encodeURIComponent(query)}`, {
        headers: { "User-Agent": UA, Accept: "application/sparql-results+json" },
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()).results.bindings;
    } catch (err) {
      if (attempt === attempts) throw err;
      console.log(`   ...échec (${err.message}), nouvelle tentative`);
      await new Promise((r) => setTimeout(r, attempt * 6000));
    }
  }
  return [];
}

const questions = [];
for (const family of FAMILIES) {
  let rows;
  try {
    rows = await sparql(`${family.query} LIMIT 400`);
  } catch (err) {
    console.log(`${family.id.padEnd(20)} ABANDONNÉ (${err.message})`);
    continue;
  }

  const entries = [];
  for (const row of rows) {
    const subject = row.subject?.value ?? "";
    const items = [...new Set((row.items?.value ?? "").split("||").filter(Boolean))]
      // Long titles are unguessable and clutter the reveal.
      .filter((i) => i.length <= 60 && !/^Q\d+$/.test(i))
      .slice(0, MAX_ITEMS);
    if (!subject || /^Q\d+$/.test(subject) || items.length < MIN_ITEMS) continue;
    entries.push({ subject, items, sitelinks: Number(row.sitelinks?.value ?? 0) });
  }

  // Same ranking as the other generators: better-known subjects are the easier duels.
  entries.sort((a, b) => b.sitelinks - a.sitelinks);
  const third = Math.ceil(entries.length / 3);
  entries.forEach(({ subject, items }, i) => {
    questions.push({
      theme: family.theme,
      difficulty: i < third ? 1 : i < third * 2 ? 2 : 3,
      type: "text",
      answer_kind: "list",
      family: family.id,
      prompt: family.prompt(subject),
      // answer + aliases together are the accepted set the duel counts hits against.
      answer: items[0],
      aliases: items.slice(1),
      source: `Wikidata (CC0) — ${family.id}`,
    });
  });
  console.log(`${family.id.padEnd(20)} ${String(entries.length).padStart(4)} listes (${family.theme})`);
  await new Promise((r) => setTimeout(r, 1200));
}

const out = join(import.meta.dirname, "..", "seed", "questions-lists.json");
writeFileSync(out, JSON.stringify(questions, null, 2) + "\n", "utf-8");
const avg = questions.length
  ? Math.round(questions.reduce((n, q) => n + q.aliases.length + 1, 0) / questions.length)
  : 0;
console.log(`\n${questions.length} questions liste -> ${out} (${avg} réponses acceptées en moyenne)`);
