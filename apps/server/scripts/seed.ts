import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface SeedQuestion {
  theme: string;
  difficulty: 1 | 2 | 3;
  type?: "text" | "image" | "audio" | "video";
  prompt: string;
  media_key?: string | null;
  answer: string;
  aliases: string[];
  explanation?: string | null;
  source?: string | null;
  verified?: 0 | 1;
  /** Which generator template produced it; lets the deck spread across templates. */
  family?: string | null;
  /** How the answer is judged: by the host, by proximity, or by counting list hits. */
  answer_kind?: "text" | "number" | "list";
}

function parseCsv(content: string): SeedQuestion[] {
  const [header, ...rows] = content.trim().split(/\r?\n/);
  const columns = header!.split(",").map((c) => c.trim());
  return rows
    .filter((r) => r.trim().length > 0)
    .map((row) => {
      // naive CSV split good enough for our own exports; fields must not contain unescaped commas.
      const cells = row.split(",");
      const record: Record<string, string> = {};
      columns.forEach((col, i) => (record[col] = (cells[i] ?? "").trim()));
      return {
        theme: record.theme!,
        difficulty: Number(record.difficulty) as 1 | 2 | 3,
        type: (record.type as SeedQuestion["type"]) || "text",
        prompt: record.prompt!,
        media_key: record.media_key || null,
        answer: record.answer!,
        aliases: record.aliases ? (JSON.parse(record.aliases) as string[]) : [],
        explanation: record.explanation || null,
        source: record.source || null,
        verified: record.verified === "0" ? 0 : 1,
      };
    });
}

function sqlString(value: string | null | undefined): string {
  if (value === null || value === undefined) return "NULL";
  return `'${value.replace(/'/g, "''")}'`;
}

function toInsertStatements(questions: SeedQuestion[]): string {
  return questions
    .map((q) => {
      const cols = [
        "theme",
        "difficulty",
        "type",
        "prompt",
        "media_key",
        "answer",
        "aliases",
        "explanation",
        "source",
        "verified",
        "family",
        "answer_kind",
      ];
      const values = [
        sqlString(q.theme),
        q.difficulty,
        sqlString(q.type ?? "text"),
        sqlString(q.prompt),
        sqlString(q.media_key ?? null),
        sqlString(q.answer),
        sqlString(JSON.stringify(q.aliases ?? [])),
        sqlString(q.explanation ?? null),
        sqlString(q.source ?? null),
        q.verified ?? 1,
        sqlString(q.family ?? null),
        sqlString(q.answer_kind ?? "text"),
      ];
      // OR IGNORE + the unique (prompt, answer) index from migration 0002 makes re-seeding
      // a no-op instead of duplicating the whole bank.
      return `INSERT OR IGNORE INTO questions (${cols.join(", ")}) VALUES (${values.join(", ")});`;
    })
    .join("\n");
}

function main() {
  const args = process.argv.slice(2);
  const remote = args.includes("--remote");
  const fileArg = args.find((a) => !a.startsWith("--"));
  const filePath = fileArg ?? join(import.meta.dirname, "..", "seed", "questions.json");

  const content = readFileSync(filePath, "utf-8");
  const questions: SeedQuestion[] = filePath.endsWith(".csv")
    ? parseCsv(content)
    : (JSON.parse(content) as SeedQuestion[]);
  if (!Array.isArray(questions)) {
    throw new Error(`${filePath} should contain a JSON array of questions`);
  }

  console.log(`Seeding ${questions.length} questions from ${filePath} (${remote ? "remote" : "local"})...`);

  const tmpDir = mkdtempSync(join(tmpdir(), "nonoculture-seed-"));
  // Same --persist-to as `pnpm dev` and `db:migrate:local`, so all three agree on which
  // local Miniflare database they're talking to.
  const target = remote ? ["--remote"] : ["--local", "--persist-to=.wrangler/state"];

  // Sent in batches: a single file of several thousand statements makes the local Miniflare
  // D1 fall over, and the remote one is happier with bounded requests too.
  const BATCH = 400;
  for (let start = 0; start < questions.length; start += BATCH) {
    const slice = questions.slice(start, start + BATCH);
    const sqlFile = join(tmpDir, `seed-${start}.sql`);
    writeFileSync(sqlFile, toInsertStatements(slice), "utf-8");
    console.log(`  ${start + slice.length}/${questions.length}...`);
    execFileSync("wrangler", ["d1", "execute", "quiproquo-db", ...target, `--file=${sqlFile}`], {
      stdio: ["inherit", "ignore", "inherit"],
      shell: true,
    });
  }

  console.log("Done.");
}

main();
