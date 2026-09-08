/**
 * Derives blurred-flag questions from the flag questions already in the bank.
 *
 * The blurred round needs a source outside the opt-in themes, or it only ever appears for
 * tables that ticked "League of Legends" — a whole game mode nobody else would meet. Flags
 * are the one image family in the bank whose answer is a proper noun a machine can check,
 * which is what this round needs: it scores itself, with no host ruling.
 *
 * No download: these reuse the WebP files `generate-flags.mjs` already produced. Only the
 * top of the list is taken — a flag reduced to a colour blob is a fair puzzle for a country
 * everyone can picture, and a coin flip for one they cannot.
 *
 * Usage:  node scripts/generate-flag-blur.mjs [--limit=<n>]
 * Output: seed/questions-flags-blur.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.slice("--limit=".length) ?? 50);

const SEED_DIR = join(import.meta.dirname, "..", "seed");
const SOURCE = join(SEED_DIR, "questions-flags.json");
const OUT_JSON = join(SEED_DIR, "questions-flags-blur.json");

/**
 * Names people type instead of the official one.
 *
 * The ordinary flag questions are graded by the host, who forgives "USA" without being asked.
 * This round grades itself, so every spelling it should accept has to be written down — and a
 * player who recognised the flag and typed "Angleterre" was not wrong about the picture.
 */
const ALIASES = {
  "États-Unis": ["USA", "Etats Unis", "Amérique", "United States"],
  "république populaire de Chine": ["Chine", "China"],
  "Royaume-Uni": ["UK", "Angleterre", "Grande-Bretagne", "Great Britain"],
  "Pays-Bas": ["Hollande", "Netherlands"],
  "Corée du Sud": ["Corée", "South Korea"],
  "Afrique du Sud": ["South Africa"],
  "Nouvelle-Zélande": ["New Zealand"],
  "Bosnie-Herzégovine": ["Bosnie"],
  "Arabie saoudite": ["Arabie"],
  "Macédoine du Nord": ["Macédoine"],
  "république démocratique du Congo": ["Congo", "RDC"],
  Tchéquie: ["République tchèque", "Rép. tchèque"],
  Biélorussie: ["Bélarus"],
  Vatican: ["Saint-Siège"],
  Irlande: ["Eire"],
};

/**
 * Two phrasings, and neither may be the sharp questions' own.
 *
 * The bank has a unique index on (prompt, answer), and every flag already sits there under
 * "Quel pays a ce drapeau ?". Reusing it would not raise an error — INSERT OR IGNORE would
 * drop all fifty rows and seeding would report success, which is how twenty-six paintings
 * once vanished.
 */
const PROMPTS = ["Ce drapeau se précise : quel pays ?", "Devine le pays avant que le drapeau soit net."];

const flags = JSON.parse(readFileSync(SOURCE, "utf-8")).slice(0, limit);

const questions = flags.map((flag, index) => ({
  theme: "drapeaux",
  // Harder than the same flag shown sharp, and it is graded strictly on top of that.
  difficulty: Math.min(3, flag.difficulty + 1),
  type: "image",
  answer_kind: "blur",
  family: "drapeau-flou",
  prompt: PROMPTS[index % PROMPTS.length],
  media_key: flag.media_key,
  answer: flag.answer,
  aliases: ALIASES[flag.answer] ?? [],
  source: flag.source,
}));

writeFileSync(OUT_JSON, JSON.stringify(questions, null, 2) + "\n", "utf-8");
console.log(`${questions.length} drapeaux flous -> ${OUT_JSON}`);
