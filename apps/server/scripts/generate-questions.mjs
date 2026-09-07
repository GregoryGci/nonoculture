/**
 * Generates trivia questions from Wikidata.
 *
 * Wikidata's data is CC0, so unlike every open trivia bank (Open Trivia DB is CC BY-SA,
 * The Trivia API is CC BY-NC) this carries no attribution or share-alike obligation, and
 * French labels come straight from the source rather than through a translation.
 *
 * Usage:  node scripts/generate-questions.mjs [--out=<file>] [--limit=<n per family>]
 * Output: seed/questions-wikidata.json, ready for `pnpm seed`.
 *
 * Two things make the output usable rather than merely voluminous:
 *  - Difficulty is derived from how many Wikipedia editions cover the subject, ranked
 *    within its own family: something in the top third of its family is common knowledge.
 *  - Subjects with several valid answers (Bolivia has two capitals) keep the first as the
 *    answer and the rest as accepted aliases, instead of being silently half-wrong.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const ENDPOINT = "https://query.wikidata.org/sparql";
const UA = "NonoCulture-quiz/1.0 (educational party game; contact via github.com/GregoryGci)";

const args = process.argv.slice(2);
const outArg = args.find((a) => a.startsWith("--out="))?.slice("--out=".length);
const limitArg = Number(args.find((a) => a.startsWith("--limit="))?.slice("--limit=".length) ?? 400);

/**
 * Notability → difficulty, by rank inside its own family rather than by absolute
 * thresholds. Hand-picked cutoffs were badly wrong: every sovereign state has a similar
 * number of Wikipedia editions, so a fixed bar filed Avarua under "easy". Ranking within
 * the family is self-calibrating and needs no tuning when a family is added.
 */
function assignDifficulties(entries) {
  const sorted = [...entries].sort((a, b) => b.sitelinks - a.sitelinks);
  const third = Math.ceil(sorted.length / 3);
  sorted.forEach((entry, i) => {
    entry.difficulty = i < third ? 1 : i < third * 2 ? 2 : 3;
  });
}

const FAMILIES = [
  {
    id: "capitale",
    theme: "geo",
    // Asked in reverse: "capitale de la Bolivie" would need an article per country, while
    // "a pour capitale Tokyo" reads correctly for every one of them.
    prompt: (subject) => `Quel pays a pour capitale ${subject} ?`,
    // Ranked on the capital's own notability: the country's says nothing about how hard
    // the question is, since every sovereign state scores about the same.
    query: `SELECT ?subject ?answer ?sitelinks WHERE {
      ?c wdt:P31 wd:Q6256; wdt:P36 ?cap.
      ?cap wikibase:sitelinks ?sitelinks.
      FILTER(?sitelinks > 30)
      ?c rdfs:label ?answer. FILTER(lang(?answer) = "fr")
      ?cap rdfs:label ?subject. FILTER(lang(?subject) = "fr")
    }`,
  },
  {
    id: "element",
    theme: "sciences",
    prompt: (subject) => `Quel élément chimique a pour symbole ${subject} ?`,
    // Three-letter symbols (Ubu, Uue) are systematic placeholders for elements that have
    // never been synthesised — unanswerable, and they crowd out the real ones.
    reject: ({ subject }) => subject.length > 2,
    query: `SELECT ?subject ?answer ?sitelinks WHERE {
      ?e wdt:P31 wd:Q11344; wdt:P246 ?subject; wikibase:sitelinks ?sitelinks.
      ?e rdfs:label ?answer. FILTER(lang(?answer) = "fr")
    }`,
  },
  {
    id: "realisateur",
    theme: "cinema",
    prompt: (subject) => `Qui a réalisé le film « ${subject} » ?`,
    query: `SELECT ?subject ?answer ?sitelinks WHERE {
      ?f wdt:P31 wd:Q11424; wdt:P57 ?d; wikibase:sitelinks ?sitelinks.
      FILTER(?sitelinks > 40)
      ?f rdfs:label ?subject. FILTER(lang(?subject) = "fr")
      ?d rdfs:label ?answer. FILTER(lang(?answer) = "fr")
    }`,
  },
  {
    id: "auteur",
    theme: "litterature",
    prompt: (subject) => `Qui a écrit « ${subject} » ?`,
    query: `SELECT ?subject ?answer ?sitelinks WHERE {
      ?b wdt:P31 wd:Q7725634; wdt:P50 ?a; wikibase:sitelinks ?sitelinks.
      FILTER(?sitelinks > 30)
      ?b rdfs:label ?subject. FILTER(lang(?subject) = "fr")
      ?a rdfs:label ?answer. FILTER(lang(?answer) = "fr")
    }`,
  },
  {
    id: "peintre",
    theme: "histoire",
    prompt: (subject) => `Qui a peint « ${subject} » ?`,
    query: `SELECT ?subject ?answer ?sitelinks WHERE {
      ?p wdt:P31 wd:Q3305213; wdt:P170 ?a; wikibase:sitelinks ?sitelinks.
      FILTER(?sitelinks > 25)
      ?p rdfs:label ?subject. FILTER(lang(?subject) = "fr")
      ?a rdfs:label ?answer. FILTER(lang(?answer) = "fr")
    }`,
  },
  {
    id: "nationalite",
    theme: "geo",
    prompt: (subject) => `De quelle nationalité est ${subject} ?`,
    query: `SELECT ?subject ?answer ?sitelinks WHERE {
      ?h wdt:P31 wd:Q5; wdt:P27 ?c; wikibase:sitelinks ?sitelinks.
      FILTER(?sitelinks > 90)
      ?h rdfs:label ?subject. FILTER(lang(?subject) = "fr")
      ?c rdfs:label ?answer. FILTER(lang(?answer) = "fr")
    }`,
  },
  {
    id: "monnaie",
    theme: "geo",
    prompt: (subject) => `Dans quel pays paie-t-on en ${subject} ?`,
    query: `SELECT ?subject ?answer ?sitelinks WHERE {
      ?c wdt:P31 wd:Q6256; wdt:P38 ?cur; wikibase:sitelinks ?sitelinks.
      FILTER(?sitelinks > 90)
      ?c rdfs:label ?answer. FILTER(lang(?answer) = "fr")
      ?cur rdfs:label ?subject. FILTER(lang(?subject) = "fr")
    }`,
  },
  {
    id: "interprete",
    theme: "musique",
    prompt: (subject) => `Qui interprète « ${subject} » ?`,
    query: `SELECT ?subject ?answer ?sitelinks WHERE {
      ?s wdt:P31 wd:Q7366; wdt:P175 ?a; wikibase:sitelinks ?sitelinks.
      FILTER(?sitelinks > 20)
      ?s rdfs:label ?subject. FILTER(lang(?subject) = "fr")
      ?a rdfs:label ?answer. FILTER(lang(?answer) = "fr")
    }`,
  },
  {
    id: "album",
    theme: "musique",
    prompt: (subject) => `Quel artiste a sorti l'album « ${subject} » ?`,
    query: `SELECT ?subject ?answer ?sitelinks WHERE {
      ?al wdt:P31 wd:Q482994; wdt:P175 ?a; wikibase:sitelinks ?sitelinks.
      FILTER(?sitelinks > 20)
      ?al rdfs:label ?subject. FILTER(lang(?subject) = "fr")
      ?a rdfs:label ?answer. FILTER(lang(?answer) = "fr")
    }`,
  },
  {
    id: "groupe-membre",
    theme: "musique",
    prompt: (subject) => `De quel groupe ${subject} fait-il ou faisait-il partie ?`,
    query: `SELECT ?subject ?answer ?sitelinks WHERE {
      ?h wdt:P31 wd:Q5; wdt:P463 ?b. ?b wdt:P31 wd:Q215380.
      ?h wikibase:sitelinks ?sitelinks. FILTER(?sitelinks > 60)
      ?h rdfs:label ?subject. FILTER(lang(?subject) = "fr")
      ?b rdfs:label ?answer. FILTER(lang(?answer) = "fr")
    }`,
  },
  {
    id: "annee-film",
    theme: "cinema",
    answerKind: "number",
    prompt: (subject) => `En quelle année est sorti « ${subject} » ?`,
    query: `SELECT ?subject ?answer ?sitelinks WHERE {
      ?f wdt:P31 wd:Q11424; wdt:P577 ?d; wikibase:sitelinks ?sitelinks.
      FILTER(?sitelinks > 60)
      BIND(STR(YEAR(?d)) AS ?answer)
      ?f rdfs:label ?subject. FILTER(lang(?subject) = "fr")
    }`,
  },
  {
    id: "annee-naissance",
    theme: "histoire",
    answerKind: "number",
    // Heavy: at 400 the endpoint times out and returns truncated JSON.
    limit: 200,
    prompt: (subject) => `En quelle année est né ${subject} ?`,
    query: `SELECT ?subject ?answer ?sitelinks WHERE {
      ?h wdt:P31 wd:Q5; wdt:P569 ?d; wikibase:sitelinks ?sitelinks.
      FILTER(?sitelinks > 150)
      BIND(STR(YEAR(?d)) AS ?answer)
      ?h rdfs:label ?subject. FILTER(lang(?subject) = "fr")
    }`,
  },
  {
    id: "numero-atomique",
    theme: "sciences",
    answerKind: "number",
    prompt: (subject) => `Quel est le numéro atomique de l'élément ${subject} ?`,
    query: `SELECT ?subject ?answer ?sitelinks WHERE {
      ?e wdt:P31 wd:Q11344; wdt:P1086 ?n; wikibase:sitelinks ?sitelinks.
      BIND(STR(?n) AS ?answer)
      ?e rdfs:label ?subject. FILTER(lang(?subject) = "fr")
    }`,
  },
  {
    id: "altitude",
    theme: "geo",
    answerKind: "number",
    prompt: (subject) => `Quelle est l'altitude du ${subject}, en mètres ?`,
    query: `SELECT ?subject ?answer ?sitelinks WHERE {
      ?m wdt:P31 wd:Q8502; wdt:P2044 ?h; wikibase:sitelinks ?sitelinks.
      FILTER(?sitelinks > 45)
      BIND(STR(xsd:integer(?h)) AS ?answer)
      ?m rdfs:label ?subject. FILTER(lang(?subject) = "fr")
    }`,
  },
  {
    id: "club-ville",
    theme: "sport",
    prompt: (subject) => `Dans quelle ville joue le club ${subject} ?`,
    query: `SELECT ?subject ?answer ?sitelinks WHERE {
      ?c wdt:P31 wd:Q476028; wdt:P159 ?v; wikibase:sitelinks ?sitelinks.
      FILTER(?sitelinks > 45)
      ?c rdfs:label ?subject. FILTER(lang(?subject) = "fr")
      ?v rdfs:label ?answer. FILTER(lang(?answer) = "fr")
    }`,
  },
  {
    id: "epreuve-sport",
    theme: "sport",
    prompt: (subject) => `À quel sport se rattache l'épreuve « ${subject} » ?`,
    query: `SELECT ?subject ?answer ?sitelinks WHERE {
      ?e wdt:P31/wdt:P279* wd:Q13406554; wdt:P641 ?s; wikibase:sitelinks ?sitelinks.
      FILTER(?sitelinks > 35)
      ?e rdfs:label ?subject. FILTER(lang(?subject) = "fr")
      ?s rdfs:label ?answer. FILTER(lang(?answer) = "fr")
    }`,
    limit: 250,
  },
  {
    id: "sport",
    theme: "sport",
    prompt: (subject) => `Quel sport pratique ${subject} ?`,
    // P641 is set on plenty of people who merely competed once — it produced
    // "Quel sport pratique Buzz Aldrin ?". Require the occupation to actually be a sport.
    query: `SELECT ?subject ?answer ?sitelinks WHERE {
      ?h wdt:P31 wd:Q5; wdt:P106/wdt:P279* wd:Q2066131; wdt:P641 ?s; wikibase:sitelinks ?sitelinks.
      FILTER(?sitelinks > 55)
      ?h rdfs:label ?subject. FILTER(lang(?subject) = "fr")
      ?s rdfs:label ?answer. FILTER(lang(?answer) = "fr")
    }`,
  },
];

/**
 * A public endpoint under load drops connections and rate-limits; the heavier queries
 * (property paths) are the first to go. Retries with a widening pause, and a failed family
 * is reported and skipped rather than losing the families that already succeeded.
 */
async function sparql(query, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(`${ENDPOINT}?format=json&query=${encodeURIComponent(query)}`, {
        headers: { "User-Agent": UA, Accept: "application/sparql-results+json" },
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return json.results.bindings.map((b) => ({
        subject: b.subject.value,
        answer: b.answer.value,
        sitelinks: Number(b.sitelinks.value),
      }));
    } catch (err) {
      if (attempt === attempts) throw err;
      const wait = attempt * 5000;
      console.log(`   ...échec (${err.message}), nouvelle tentative dans ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  return [];
}

/** Rejects rows a player could never reasonably answer, or that read as noise. */
function usable({ subject, answer }) {
  if (!subject || !answer) return false;
  if (/^Q\d+$/.test(subject) || /^Q\d+$/.test(answer)) return false; // no French label
  if (subject.length > 70 || answer.length > 60) return false;
  if (subject.toLowerCase() === answer.toLowerCase()) return false;
  // Disambiguation pages and list articles make terrible questions.
  if (/\((homonymie|série|album)\)|^Liste /i.test(subject)) return false;
  return true;
}

const questions = [];
for (const family of FAMILIES) {
  let rows;
  try {
    rows = await sparql(`${family.query} LIMIT ${family.limit ?? limitArg}`);
  } catch (err) {
    console.log(`${family.id.padEnd(12)} ABANDONNÉ (${err.message})`);
    continue;
  }

  // One subject can carry several valid answers. Keep them together so the extra ones
  // become accepted aliases rather than marking a correct player wrong.
  const bySubject = new Map();
  for (const row of rows) {
    if (!usable(row)) continue;
    if (family.reject?.(row)) continue;
    const entry = bySubject.get(row.subject) ?? { sitelinks: row.sitelinks, answers: [] };
    if (!entry.answers.includes(row.answer)) entry.answers.push(row.answer);
    entry.sitelinks = Math.max(entry.sitelinks, row.sitelinks);
    bySubject.set(row.subject, entry);
  }

  const entries = [...bySubject]
    // More than a couple of valid answers means the question is genuinely ambiguous.
    .filter(([, { answers }]) => answers.length <= 3)
    .map(([subject, { sitelinks, answers }]) => ({ subject, sitelinks, answers }));
  assignDifficulties(entries);

  for (const { subject, answers, difficulty } of entries) {
    questions.push({
      theme: family.theme,
      difficulty,
      type: "text",
      prompt: family.prompt(subject),
      answer: answers[0],
      aliases: answers.slice(1),
      source: `Wikidata (CC0) — ${family.id}`,
      family: family.id,
      answer_kind: family.answerKind ?? "text",
    });
  }
  const kept = entries.length;
  console.log(`${family.id.padEnd(12)} ${String(kept).padStart(4)} questions (${family.theme})`);
  await new Promise((r) => setTimeout(r, 900)); // stay polite with a public endpoint
}

const out = outArg ?? join(import.meta.dirname, "..", "seed", "questions-wikidata.json");
writeFileSync(out, JSON.stringify(questions, null, 2) + "\n", "utf-8");

const byDifficulty = questions.reduce((acc, q) => ((acc[q.difficulty] = (acc[q.difficulty] ?? 0) + 1), acc), {});
console.log(`\n${questions.length} questions -> ${out}`);
console.log(`facile ${byDifficulty[1] ?? 0} / moyen ${byDifficulty[2] ?? 0} / expert ${byDifficulty[3] ?? 0}`);
