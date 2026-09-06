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

/** Roughly 2 chain ("téléphone dessiné") rounds per 15 slots, per the game design. */
const CHAIN_ROUND_RATIO = 2 / 15;

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

async function fetchTriviaQuestions(db: D1Database, settings: GameSettings, limit: number): Promise<InternalQuestion[]> {
  if (limit <= 0) return [];
  const useThemeFilter = settings.themes.length > 0;
  const query = useThemeFilter
    ? `SELECT * FROM questions WHERE verified = 1 AND theme IN (${settings.themes.map(() => "?").join(",")})`
    : "SELECT * FROM questions WHERE verified = 1";
  const stmt = useThemeFilter ? db.prepare(query).bind(...settings.themes) : db.prepare(query);
  const { results } = await stmt.all<QuestionRow>();
  const shuffled = shuffle(results ?? []);
  return shuffled.slice(0, limit).map(toInternal);
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

/**
 * Builds the full game deck: trivia questions drawn from D1 plus a handful of chain
 * ("téléphone dessiné") rounds spread through it, per docs/brief.md's game design.
 */
export async function buildDeck(db: D1Database, settings: GameSettings): Promise<DeckItem[]> {
  const requestedChainCount = Math.round(settings.questionCount * CHAIN_ROUND_RATIO);
  const requestedTriviaCount = Math.max(0, settings.questionCount - requestedChainCount);

  const questions = await fetchTriviaQuestions(db, settings, requestedTriviaCount);
  const totalSlots = questions.length + requestedChainCount;
  const chainPositions = pickChainPositions(totalSlots, requestedChainCount);

  const deck: DeckItem[] = [];
  let triviaIdx = 0;
  for (let i = 0; i < totalSlots; i++) {
    if (chainPositions.has(i)) {
      deck.push({ kind: "chain" });
    } else {
      deck.push({ kind: "trivia", question: questions[triviaIdx]! });
      triviaIdx++;
    }
  }
  return deck;
}
