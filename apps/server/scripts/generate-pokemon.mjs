/**
 * Builds the factual half of the Pokémon theme from PokeAPI's own data dump.
 *
 * Everything here is a lookup, never a recollection: French names, types, national dex numbers
 * and species titles all come from the CSV files PokeAPI publishes, fetched once each. The
 * hand-written file (questions-pokemon.json) carries the lore and the expert questions; this
 * one carries what a table would otherwise get subtly wrong at volume — a type changed since
 * 2013, a number off by one.
 *
 * Four families:
 *  - portraits for the blurred round, generations 1 and 2 (official artwork);
 *  - "quel est le numéro de X ?", scored closest-wins, generation 1 only — a number is only a
 *    fair guess when there are 151 of them, not a thousand;
 *  - "de quel type est X ?", generation 1, graded by the host;
 *  - "quel Pokémon est surnommé « Pokémon Souris » ?", only for titles no other species shares.
 *
 * Types are the current ones, which is not always what a 1998 player remembers — Mélofée is
 * Fée, not Normal. Those questions are graded by the host, who can be generous.
 *
 * Usage:  node scripts/generate-pokemon.mjs
 * Output: apps/web/public/media/pokemon-*.webp + seed/questions-pokemon-data.json
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { answerLeaksIntoPrompt } from "./lib/answer-leak.mjs";
import { UA } from "./lib/commons.mjs";

const MEDIA_DIR = join(import.meta.dirname, "..", "..", "web", "public", "media");
const OUT_JSON = join(import.meta.dirname, "..", "seed", "questions-pokemon-data.json");
const CSV = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv";
const ARTWORK = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork";
const FRENCH = "5";

/** Names every player has met, whatever their generation — the easy tier of the blurred round. */
const ICONIC = new Set([
  1, 4, 6, 7, 9, 25, 39, 52, 54, 94, 129, 130, 131, 133, 143, 150, 151, 152, 155, 158, 175, 249, 250,
]);

async function csv(name) {
  const res = await fetch(`${CSV}/${name}.csv`, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${name}.csv : HTTP ${res.status}`);
  const [header, ...lines] = (await res.text()).trim().split(/\r?\n/);
  const keys = header.split(",");
  // No field in the columns used here contains a comma, so a plain split is exact.
  return lines.map((line) => Object.fromEntries(line.split(",").map((v, i) => [keys[i], v])));
}

const [names, species, pokemonTypes, typeNames] = await Promise.all([
  csv("pokemon_species_names"),
  csv("pokemon_species"),
  csv("pokemon_types"),
  csv("type_names"),
]);

const nameOf = new Map();
const genusOf = new Map();
for (const row of names) {
  if (row.local_language_id !== FRENCH) continue;
  nameOf.set(Number(row.pokemon_species_id), row.name);
  if (row.genus) genusOf.set(Number(row.pokemon_species_id), row.genus);
}
const typeLabel = new Map(typeNames.filter((r) => r.local_language_id === FRENCH).map((r) => [r.type_id, r.name]));
// pokemon_id equals species id for every default form below 10000, which is all this uses.
const typesOf = new Map();
for (const row of pokemonTypes) {
  const id = Number(row.pokemon_id);
  if (id > 251) continue;
  const list = typesOf.get(id) ?? [];
  list[Number(row.slot) - 1] = typeLabel.get(row.type_id);
  typesOf.set(id, list);
}
const generationOf = new Map(species.map((s) => [Number(s.id), Number(s.generation_id)]));

const dex = [...nameOf.keys()].filter((id) => id <= 251).sort((a, b) => a - b);
console.log(`${dex.length} Pokémon des générations 1 et 2`);

/** "de Salamèche" but "d'Aspicot" — a generated sentence that trips on elision reads as generated. */
const de = (name) => (/^[aeiouyéèêâîôûh]/i.test(name) ? `d'${name}` : `de ${name}`);

/**
 * Spellings the blurred round must accept, since it grades itself.
 *
 * `normalizeAnswer` turns punctuation into spaces, so "Ho-Oh" is stored as "ho oh" and the
 * "hooh" everyone types would miss. The de-punctuated form covers most of it; the table covers
 * the names people simply say differently.
 */
const EXTRA_ALIASES = {
  "M. Mime": ["Mr. Mime", "Mr Mime", "Monsieur Mime"],
  "Nidoran♀": ["Nidoran"],
  "Nidoran♂": ["Nidoran"],
};
const aliasesFor = (name) =>
  [...new Set([name.replace(/[^\p{L}\p{N}]/gu, ""), ...(EXTRA_ALIASES[name] ?? [])])].filter(
    (a) => a.length > 0 && a.toLowerCase() !== name.toLowerCase(),
  );

const questions = [];
const leaked = [];
const push = (q) => {
  // Spectrum is a Spectre type, Papilusion is the "Pokémon Papillon": names are built from
  // what they describe, so a fair share of generated prompts would read their answer aloud.
  if (q.answer_kind !== "blur" && q.answer_kind !== "number" && answerLeaksIntoPrompt(q.prompt, q.answer)) {
    leaked.push(`${q.prompt} -> ${q.answer}`);
    return;
  }
  questions.push({ theme: "pokemon", ...q, source: "PokeAPI (données publiques)" });
};

// --- Portraits for the blurred round --------------------------------------------------------
mkdirSync(MEDIA_DIR, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), "nonoculture-pokemon-"));
const skipped = [];
for (const id of dex) {
  const key = `pokemon-${String(id).padStart(3, "0")}.webp`;
  const target = join(MEDIA_DIR, key);
  if (!existsSync(target)) {
    const res = await fetch(`${ARTWORK}/${id}.png`, { headers: { "User-Agent": UA } });
    if (!res.ok) {
      skipped.push(`${nameOf.get(id)} (HTTP ${res.status})`);
      continue;
    }
    const raw = join(tmp, `${id}.png`);
    writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
    // Transparent artwork, flattened onto nothing: the round's own dark panel shows through.
    execFileSync("ffmpeg", ["-y", "-i", raw, "-vf", "scale=512:512", "-c:v", "libwebp", "-quality", "80", target], {
      stdio: "pipe",
    });
  }
  push({
    difficulty: ICONIC.has(id) ? 1 : generationOf.get(id) === 1 ? 2 : 3,
    type: "image",
    answer_kind: "blur",
    family: "pokemon-portrait",
    prompt: id % 2 === 0 ? "Quel est ce Pokémon ?" : "Qui se cache derrière ce Pokémon flou ?",
    media_key: key,
    answer: nameOf.get(id),
    aliases: aliasesFor(nameOf.get(id)),
  });
}
const kb = Math.round(
  dex.reduce((n, id) => {
    const f = join(MEDIA_DIR, `pokemon-${String(id).padStart(3, "0")}.webp`);
    return n + (existsSync(f) ? statSync(f).size : 0);
  }, 0) / 1024,
);
console.log(`  portraits : ${kb} Ko au total`);

// --- Generation 1 facts ---------------------------------------------------------------------
const gen1 = dex.filter((id) => id <= 151);
for (const id of gen1) {
  const name = nameOf.get(id);
  push({
    difficulty: ICONIC.has(id) ? 2 : 3,
    type: "text",
    answer_kind: "number",
    family: "pokedex-numero",
    prompt: `Quel est le numéro ${de(name)} dans le Pokédex national ?`,
    answer: String(id),
    aliases: [],
  });

  const types = typesOf.get(id) ?? [];
  if (types.length > 0) {
    push({
      difficulty: ICONIC.has(id) ? 1 : 2,
      type: "text",
      family: types.length > 1 ? "pokemon-double-type" : "pokemon-type",
      prompt: types.length > 1 ? `Quels sont les deux types ${de(name)} ?` : `De quel type est ${name} ?`,
      answer: types.join(" / "),
      aliases: types.length > 1 ? [types.join(" et "), [...types].reverse().join(" / ")] : [],
    });
  }
}

// --- Species titles, only where a title names exactly one Pokémon ---------------------------
const byGenus = new Map();
for (const id of dex) {
  const genus = genusOf.get(id);
  if (!genus) continue;
  byGenus.set(genus, [...(byGenus.get(genus) ?? []), id]);
}
for (const [genus, ids] of byGenus) {
  if (ids.length !== 1) continue;
  const id = ids[0];
  const name = nameOf.get(id);
  // "Pokémon Souris" is fair for Pikachu; for a species nobody can place, it is a lottery.
  if (!ICONIC.has(id) && generationOf.get(id) !== 1) continue;
  // A title that contains the name answers itself.
  if (genus.toLowerCase().includes(name.toLowerCase())) continue;
  push({
    difficulty: ICONIC.has(id) ? 2 : 3,
    type: "text",
    family: "pokemon-categorie",
    prompt: `Quel Pokémon de première ou deuxième génération est surnommé « ${genus} » ?`,
    answer: name,
    aliases: [],
  });
}

writeFileSync(OUT_JSON, JSON.stringify(questions, null, 2) + "\n", "utf-8");
const count = (f) => questions.filter((q) => q.family === f).length;
console.log(
  `\n${questions.length} questions -> ${OUT_JSON}\n` +
    `  portraits ${count("pokemon-portrait")}, numéros ${count("pokedex-numero")}, ` +
    `types ${count("pokemon-type") + count("pokemon-double-type")}, catégories ${count("pokemon-categorie")}`,
);
if (leaked.length) console.log(`réponse dans l'énoncé, écartées : ${leaked.length}`);
if (skipped.length) console.log(`écartés : ${skipped.join(", ")}`);
