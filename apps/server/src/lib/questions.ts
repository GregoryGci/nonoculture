import type { GameSettings } from "@quiproquo/shared";
import type { DeckItem, InternalQuestion } from "../room/types.js";

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

/**
 * Deck composition, expressed per 15 slots: 1 drawing round, 4 audio questions, the rest
 * plain text. These are quotas, not probabilities — audio questions are drawn from their
 * own query so a game reliably contains them instead of depending on what RANDOM() picked.
 */
const CHAIN_ROUNDS_PER_15 = 1;
const AUDIO_QUESTIONS_PER_15 = 4;

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

/**
 * Draws `limit` random questions. The sampling is done by SQLite (ORDER BY RANDOM() LIMIT)
 * rather than by pulling the table into the Worker and shuffling: the bank is meant to grow
 * to several thousand rows, and materialising all of them per game would cost a full scan
 * plus the memory for every row we then throw away.
 */
async function fetchQuestions(
  db: D1Database,
  settings: GameSettings,
  limit: number,
  kind: "audio" | "text",
): Promise<InternalQuestion[]> {
  if (limit <= 0) return [];
  const themes = settings.themes;
  const clauses = ["verified = 1"];
  if (themes.length > 0) clauses.push(`theme IN (${themes.map(() => "?").join(",")})`);
  // "text" means "needs no media to be playable", which is also what makes it safe to serve
  // with no R2 binding; "audio" is the quota bucket the deck fills separately.
  clauses.push(kind === "audio" ? "type = 'audio' AND media_key IS NOT NULL" : "media_key IS NULL");
  const stmt = db
    .prepare(`SELECT * FROM questions WHERE ${clauses.join(" AND ")} ORDER BY RANDOM() LIMIT ?`)
    .bind(...themes, limit);
  const { results } = await stmt.all<QuestionRow>();
  return (results ?? []).map(toInternal);
}

/**
 * Themes the bank can actually field a question on right now. The host settings screen only
 * offers these: a theme with nothing behind it (never seeded, or media-only while R2 is
 * unbound) would otherwise look selectable and then produce an empty game.
 */
export async function listPlayableThemes(db: D1Database, mediaAvailable: boolean): Promise<string[]> {
  const mediaClause = mediaAvailable ? "" : " AND media_key IS NULL";
  const { results } = await db
    .prepare(`SELECT DISTINCT theme FROM questions WHERE verified = 1${mediaClause} ORDER BY theme`)
    .all<{ theme: string }>();
  return (results ?? []).map((row) => row.theme);
}

/** Spreads `count` chain slots evenly across the deck, never as the very first or last slot. */
function pickChainPositions(totalSlots: number, count: number): Set<number> {
  const positions = new Set<number>();
  if (count <= 0 || totalSlots < 3) return positions;
  const start = 1;
  const end = totalSlots - 2;
  if (end < start) return positions;
  const span = end - start + 1;
  for (let i = 0; i < count; i++) {
    const target = start + Math.floor(((i + 0.5) * span) / count);
    positions.add(Math.min(end, Math.max(start, target)));
  }
  return positions;
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

/**
 * Builds the full game deck to the quotas above: a few drawing rounds, a guaranteed share of
 * audio questions, the rest text, all shuffled together so the audio ones aren't clustered.
 *
 * Every quota degrades gracefully. Audio needs an R2 binding to be playable at all, and the
 * bank may simply hold fewer audio questions than the quota asks for; either way the shortfall
 * is taken up by text questions so the game still has the length the host chose.
 */
export async function buildDeck(
  db: D1Database,
  settings: GameSettings,
  { mediaAvailable }: { mediaAvailable: boolean },
): Promise<DeckItem[]> {
  const total = settings.questionCount;
  const requestedChainCount = Math.round((total * CHAIN_ROUNDS_PER_15) / 15);
  const questionSlots = Math.max(0, total - requestedChainCount);
  const audioQuota = mediaAvailable ? Math.round((total * AUDIO_QUESTIONS_PER_15) / 15) : 0;

  const audio = await fetchQuestions(db, settings, Math.min(audioQuota, questionSlots), "audio");
  // Whatever audio couldn't supply falls back to text, so the deck keeps its intended length.
  const text = await fetchQuestions(db, settings, questionSlots - audio.length, "text");
  const questions = shuffle([...audio, ...text]);

  // The bank may hold fewer questions than asked for (narrow theme filter, unseeded DB).
  // Only ever lay out as many question slots as we actually drew — filling the gap with
  // undefined would build a deck of blank questions that plays out as an empty screen.
  if (questions.length === 0) return [];
  const totalSlots = questions.length + requestedChainCount;
  const chainPositions = pickChainPositions(totalSlots, requestedChainCount);

  const deck: DeckItem[] = [];
  let triviaIdx = 0;
  for (let i = 0; i < totalSlots; i++) {
    const question = questions[triviaIdx];
    if (chainPositions.has(i) || !question) {
      deck.push({ kind: "chain" });
    } else {
      deck.push({ kind: "trivia", question });
      triviaIdx++;
    }
  }
  return deck;
}
