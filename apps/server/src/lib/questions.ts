import type { GameSettings } from "@quiproquo/shared";
import type { InternalQuestion } from "../room/types.js";

interface QuestionRow {
  id: number;
  theme: string;
  difficulty: number;
  type: string;
  prompt: string;
  media_key: string | null;
  answer: string;
  aliases: string;
  explanation: string | null;
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

function toInternal(row: QuestionRow): InternalQuestion {
  return {
    id: row.id,
    theme: row.theme,
    difficulty: row.difficulty as 1 | 2 | 3,
    type: row.type as InternalQuestion["type"],
    prompt: row.prompt,
    mediaKey: row.media_key,
    answer: row.answer,
    aliases: JSON.parse(row.aliases) as string[],
    explanation: row.explanation,
  };
}

/** Draws a random deck of verified questions matching the room's theme settings. */
export async function drawQuestions(db: D1Database, settings: GameSettings): Promise<InternalQuestion[]> {
  const useThemeFilter = settings.themes.length > 0;
  const query = useThemeFilter
    ? `SELECT * FROM questions WHERE verified = 1 AND theme IN (${settings.themes.map(() => "?").join(",")})`
    : "SELECT * FROM questions WHERE verified = 1";
  const stmt = useThemeFilter ? db.prepare(query).bind(...settings.themes) : db.prepare(query);
  const { results } = await stmt.all<QuestionRow>();
  const shuffled = shuffle(results ?? []);
  return shuffled.slice(0, settings.questionCount).map(toInternal);
}
