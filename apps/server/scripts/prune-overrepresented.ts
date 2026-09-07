/**
 * Enforces the per-answer cap on a database that has already been seeded.
 *
 * The generator caps how many questions of a family may share one answer, but seeding is
 * additive (`INSERT OR IGNORE`), so seeding a second, differently-sampled generation on top
 * of the first puts the concentration straight back: after one such pass "football" was the
 * answer to 41 questions again despite the file itself holding 15. A cap that only exists at
 * generation time is not a cap.
 *
 * Why it matters: at 77% "football" and 68% "États-Unis" — the state the bank was actually
 * in — a player who knows nothing scores by guessing the base rate, so the question was
 * never really asked.
 *
 * Dry run by default; pass --apply to delete. Deleted rows are always reproducible by
 * re-running the generators, so this is a safe thing to get wrong.
 *
 * Usage:
 *   pnpm --filter server questions:prune              # local, shows what it would remove
 *   pnpm --filter server questions:prune -- --apply
 *   pnpm --filter server questions:prune -- --remote --apply
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Must match MAX_PER_ANSWER in scripts/generate-questions.mjs. */
const MAX_PER_ANSWER = 15;

interface ExcessRow {
  id: number;
  family: string;
  answer: string;
}

/** wrangler prefixes its JSON with a byte-order mark on Windows, which JSON.parse rejects. */
const stripBom = (s: string): string => s.replace(/^[^[{]+/, "");

function d1(sql: string, remote: boolean, json: boolean): string {
  const target = remote ? ["--remote"] : ["--local", "--persist-to=.wrangler/state"];
  return execFileSync(
    "wrangler",
    ["d1", "execute", "quiproquo-db", ...target, ...(json ? ["--json"] : []), `--command=${JSON.stringify(sql)}`],
    { encoding: "utf-8", shell: true, stdio: ["inherit", "pipe", "inherit"] },
  );
}

function main(): void {
  const args = process.argv.slice(2);
  const remote = args.includes("--remote");
  const apply = args.includes("--apply");

  // The window function ranks each family/answer group by difficulty, so what gets dropped is
  // always the least well-known subject of an over-represented answer.
  const query =
    `SELECT id, family, answer FROM (` +
    `SELECT id, family, answer, ROW_NUMBER() OVER (PARTITION BY family, answer ORDER BY difficulty, id) rn ` +
    `FROM questions WHERE family IS NOT NULL AND answer_kind = 'text'` +
    `) WHERE rn > ${MAX_PER_ANSWER}`;

  const raw = stripBom(d1(query, remote, true));
  const parsed = JSON.parse(raw) as { results: ExcessRow[] }[];
  const rows = parsed[0]?.results ?? [];

  if (rows.length === 0) {
    console.log(
      `Aucune réponse ne dépasse ${MAX_PER_ANSWER} questions dans sa famille (${remote ? "remote" : "local"}).`,
    );
    return;
  }

  const tally = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.family} / ${row.answer}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  console.log(`${rows.length} questions au-dessus du plafond de ${MAX_PER_ANSWER} (${remote ? "remote" : "local"}) :`);
  for (const [key, n] of [...tally].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`  ${key.padEnd(40)} +${n}`);
  }

  if (!apply) {
    console.log("\nRien supprimé. Relance avec --apply pour appliquer.");
    return;
  }

  // Addressed by id rather than by a predicate: a broad DELETE on a live bank is one typo
  // away from emptying a family.
  const file = join(mkdtempSync(join(tmpdir(), "nonoculture-prune-")), "prune.sql");
  writeFileSync(file, rows.map((r) => `DELETE FROM questions WHERE id = ${Number(r.id)};`).join("\n") + "\n", "utf-8");
  const target = remote ? ["--remote"] : ["--local", "--persist-to=.wrangler/state"];
  execFileSync("wrangler", ["d1", "execute", "quiproquo-db", ...target, `--file=${file}`], {
    stdio: ["inherit", "ignore", "inherit"],
    shell: true,
  });
  console.log(`\n${rows.length} questions supprimées.`);
}

main();
