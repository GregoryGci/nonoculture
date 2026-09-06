/**
 * Fetches short CC0 sound-effect clips from the Freesound API for audio trivia questions
 * (see docs/brief.md §9). Requires a free API key: create an account at freesound.org,
 * then apply for a key at https://freesound.org/apiv2/apply/ and pass it as FREESOUND_TOKEN.
 *
 * Usage: FREESOUND_TOKEN=xxxx node scripts/fetch-freesound.mjs
 * Output: scripts/../seed/downloads/*.mp3 + a manifest.json — feed the mp3s through
 * `pnpm media:add` and the manifest's answer/aliases into a questions JSON for `pnpm seed`.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const TOKEN = process.env.FREESOUND_TOKEN;
if (!TOKEN) {
  console.error("Set FREESOUND_TOKEN env var first (see file header for how to get one).");
  process.exit(1);
}

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "seed", "downloads");

// `preferId` pins an exact Freesound sound id, bypassing search — used where the generic
// text search returned a poor match (e.g. a synthesized "elephant" notification sound
// instead of a real recording) and a specific known-good id was picked by hand instead.
const TARGETS = [
  { query: "lion roar", require: ["lion"], theme: "animaux", answer: "un lion", aliases: ["lion"] },
  { query: "dog bark", require: ["dog", "bark"], theme: "animaux", answer: "un chien", aliases: ["chien"] },
  { query: "cow moo", require: ["cow", "moo"], theme: "animaux", answer: "une vache", aliases: ["vache"] },
  { query: "rooster crow", require: ["rooster", "cock", "crow"], theme: "animaux", answer: "un coq", aliases: ["coq"] },
  { query: "cat meow", require: ["cat", "meow"], theme: "animaux", answer: "un chat", aliases: ["chat"] },
  {
    query: "elephant trumpet",
    require: ["elephant"],
    preferId: 819668,
    theme: "animaux",
    answer: "un éléphant",
    aliases: ["éléphant", "elephant"],
  },
  { query: "duck quack", require: ["duck", "quack"], theme: "animaux", answer: "un canard", aliases: ["canard"] },
  { query: "horse neigh", require: ["horse", "neigh"], theme: "animaux", answer: "un cheval", aliases: ["cheval"] },
  {
    query: "sheep bleat",
    require: ["sheep", "bleat", "baa"],
    theme: "animaux",
    answer: "un mouton",
    aliases: ["mouton", "brebis"],
  },
  {
    query: "frying pan sizzle",
    require: ["fry", "frying", "sizzle", "pan"],
    theme: "cuisine",
    answer: "de la friture",
    aliases: ["friture", "poêle qui grésille", "grésillement"],
  },
  {
    query: "chopping vegetables",
    require: ["chop", "cutting", "knife", "cut"],
    preferId: 634119,
    theme: "cuisine",
    answer: "on découpe des légumes",
    aliases: ["découper des légumes", "couper des légumes", "découpe"],
  },
  {
    query: "water boiling bubbling pot",
    require: ["boil", "bubbl", "water"],
    theme: "cuisine",
    answer: "de l'eau qui bout",
    aliases: ["ébullition", "eau bouillante", "eau qui bout"],
  },
  {
    query: "blender kitchen",
    require: ["blend"],
    theme: "cuisine",
    answer: "un mixeur",
    aliases: ["blender", "mixeur électrique"],
  },
  {
    query: "kettle whistle",
    require: ["kettle"],
    theme: "cuisine",
    answer: "une bouilloire",
    aliases: ["bouilloire", "bouilloire qui siffle"],
  },
  {
    query: "popcorn popping",
    require: ["popcorn"],
    preferId: 91262,
    theme: "cuisine",
    answer: "du popcorn",
    aliases: ["pop-corn", "pop corn"],
  },
];

async function fetchById(id) {
  const url = `https://freesound.org/apiv2/sounds/${id}/?token=${TOKEN}&fields=id,name,previews,duration,license`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed for id ${id}: ${res.status}`);
  return res.json();
}

async function searchOne(query, requireKeywords) {
  const url = new URL("https://freesound.org/apiv2/search/text/");
  url.searchParams.set("query", query);
  url.searchParams.set("token", TOKEN);
  url.searchParams.set("fields", "id,name,previews,duration,license,tags,description");
  url.searchParams.set("sort", "rating_desc");
  url.searchParams.set("page_size", "30");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`search failed for "${query}": ${res.status} ${await res.text()}`);
  const data = await res.json();
  const cc0 = data.results.filter((r) => r.license.includes("publicdomain/zero"));
  const candidates = cc0.length > 0 ? cc0 : data.results;

  const matchesKeyword = (r) => {
    const haystack = `${r.name ?? ""} ${(r.tags ?? []).join(" ")} ${r.description ?? ""}`.toLowerCase();
    return requireKeywords.some((kw) => haystack.includes(kw));
  };
  const relevant = candidates.filter(matchesKeyword);

  const sorted = [...relevant].sort((a, b) => {
    const scoreA = a.duration >= 1 && a.duration <= 15 ? 0 : 1;
    const scoreB = b.duration >= 1 && b.duration <= 15 ? 0 : 1;
    return scoreA - scoreB || a.duration - b.duration;
  });
  return sorted[0] ?? null;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const manifest = [];
  for (const target of TARGETS) {
    const sound = target.preferId ? await fetchById(target.preferId) : await searchOne(target.query, target.require);
    if (!sound) {
      console.error(`NO RESULT for "${target.query}"`);
      continue;
    }
    const previewUrl = sound.previews["preview-hq-mp3"];
    const filename = `${target.theme}-${target.answer.replace(/[^a-z0-9]+/gi, "_")}.mp3`;
    const audioRes = await fetch(previewUrl);
    const buf = Buffer.from(await audioRes.arrayBuffer());
    await writeFile(join(OUT_DIR, filename), buf);
    console.log(
      `OK  ${target.query.padEnd(24)} -> "${sound.name}" (id=${sound.id}, ${sound.duration.toFixed(1)}s, ${sound.license}) -> ${filename}`,
    );
    manifest.push({
      ...target,
      freesoundId: sound.id,
      freesoundName: sound.name,
      license: sound.license,
      file: filename,
    });
  }
  await writeFile(join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`\nDone. ${manifest.length}/${TARGETS.length} sounds downloaded to ${OUT_DIR}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
