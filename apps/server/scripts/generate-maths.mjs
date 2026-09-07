/**
 * Builds the "maths" theme: short arithmetic anyone can do in their head, scored on speed.
 *
 * The point is not to be hard. A maths question is settled by `answer_kind = "math"` — exact
 * answer, fastest correct one takes the round — so the interesting variable is how quickly
 * you get there, not whether you can. Anything that takes real working out kills the race.
 *
 * No network: unlike every other generator here, the source of truth is arithmetic.
 *
 * Usage:  node scripts/generate-maths.mjs [--limit=<n>]
 * Output: seed/questions-maths.json
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.slice("--limit=".length) ?? 400);
const OUT = join(import.meta.dirname, "..", "seed", "questions-maths.json");

const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

/**
 * Each family is a phrasing plus a way of drawing one instance of it.
 *
 * `family` matters as much here as anywhere else in the bank: without it the deck's
 * round-robin has nothing to spread across and a maths run is fifteen multiplications.
 * Difficulty is how long the mental step takes, not how advanced the maths is.
 */
const FAMILIES = [
  {
    id: "addition",
    difficulty: 1,
    make: () => {
      const a = rand(12, 89);
      const b = rand(12, 89);
      return [`${a} + ${b} = ?`, a + b];
    },
  },
  {
    id: "soustraction",
    difficulty: 1,
    make: () => {
      const a = rand(30, 150);
      const b = rand(11, a - 1);
      return [`${a} − ${b} = ?`, a - b];
    },
  },
  {
    id: "multiplication",
    difficulty: 2,
    make: () => {
      const a = rand(3, 19);
      const b = rand(3, 12);
      return [`${a} × ${b} = ?`, a * b];
    },
  },
  {
    id: "division",
    difficulty: 2,
    // Built from the product so it always divides exactly — a decimal answer would be a
    // typing race rather than a mental one.
    make: () => {
      const b = rand(3, 12);
      const q = rand(3, 15);
      return [`${b * q} ÷ ${b} = ?`, q];
    },
  },
  {
    id: "carre",
    difficulty: 2,
    make: () => {
      const n = rand(4, 25);
      return [`${n}² = ?`, n * n];
    },
  },
  {
    id: "cube",
    difficulty: 3,
    make: () => {
      const n = rand(2, 12);
      return [`${n}³ = ?`, n ** 3];
    },
  },
  {
    id: "puissance-de-deux",
    difficulty: 2,
    make: () => {
      const n = rand(3, 14);
      return [`2^${n} = ?`, 2 ** n];
    },
  },
  {
    id: "puissance",
    difficulty: 3,
    make: () => {
      const base = rand(3, 7);
      const exp = rand(2, 4);
      return [`${base}^${exp} = ?`, base ** exp];
    },
  },
  {
    id: "racine",
    difficulty: 2,
    make: () => {
      const n = rand(4, 25);
      return [`La racine carrée de ${n * n} ?`, n];
    },
  },
  {
    id: "pourcentage",
    difficulty: 2,
    // Percentages that land on a whole number: 15% of 240, never 17% of 33.
    make: () => {
      const pct = [10, 20, 25, 50, 75, 5, 15][rand(0, 6)];
      const base = rand(2, 20) * 20;
      return [`${pct} % de ${base} = ?`, (base * pct) / 100];
    },
  },
  {
    id: "priorites",
    difficulty: 3,
    // The classic trap: whoever adds before multiplying gets it wrong, fast.
    make: () => {
      const a = rand(2, 12);
      const b = rand(2, 9);
      const c = rand(2, 9);
      return [`${a} + ${b} × ${c} = ?`, a + b * c];
    },
  },
  {
    id: "complement",
    difficulty: 1,
    make: () => {
      const n = rand(11, 99);
      return [`Combien manque-t-il à ${n} pour atteindre 100 ?`, 100 - n];
    },
  },
  {
    id: "douzaines",
    difficulty: 2,
    make: () => {
      const n = rand(3, 15);
      return [`Combien d'unités dans ${n} douzaines ?`, n * 12];
    },
  },
  {
    id: "somme-suite",
    difficulty: 3,
    make: () => {
      const n = rand(5, 20);
      return [`La somme de tous les entiers de 1 à ${n} ?`, (n * (n + 1)) / 2];
    },
  },
];

const questions = [];
const seen = new Set();
let attempts = 0;

// Draws round-robin across families so the file itself is balanced, rather than relying on
// the deck to rescue an unbalanced one.
while (questions.length < limit && attempts < limit * 40) {
  for (const family of FAMILIES) {
    if (questions.length >= limit) break;
    attempts++;
    const [prompt, answer] = family.make();
    // The bank's unique index is on (prompt, answer); duplicates here would seed as one row
    // and the file would silently overstate itself.
    if (seen.has(prompt)) continue;
    seen.add(prompt);
    questions.push({
      theme: "maths",
      difficulty: family.difficulty,
      type: "text",
      family: `maths-${family.id}`,
      answer_kind: "math",
      prompt,
      answer: String(answer),
      aliases: [],
      source: "Généré (arithmétique)",
    });
  }
}

writeFileSync(OUT, JSON.stringify(questions, null, 2) + "\n", "utf-8");
const perFamily = {};
for (const q of questions) perFamily[q.family] = (perFamily[q.family] ?? 0) + 1;
console.log(`${questions.length} questions maths -> ${OUT}`);
for (const [family, n] of Object.entries(perFamily)) console.log(`  ${family.padEnd(24)} ${n}`);
console.log(
  `\nexemples : ${questions
    .slice(0, 5)
    .map((q) => `${q.prompt} ${q.answer}`)
    .join("  |  ")}`,
);
