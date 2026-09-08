import { OPT_IN_THEMES } from "@nonoculture/shared";
import type { GameSettings } from "@nonoculture/shared";
import type { DeckItem, InternalQuestion } from "../room/types.js";

interface QuestionRow {
  id: number;
  theme: string;
  family: string | null;
  answer_kind: string;
  difficulty: number;
  type: string;
  prompt: string;
  media_key: string | null;
  answer: string;
  aliases: string;
  explanation: string | null;
}

/**
 * Audio share of the deck, per 15 slots. A quota rather than a probability: audio questions
 * come from their own query, so a game reliably contains some instead of depending on what
 * RANDOM() happened to pick. Drawing rounds are no longer a ratio — the host sets the count.
 */
const AUDIO_QUESTIONS_PER_15 = 4;

/**
 * Image share of the deck, per 15 slots — same reasoning as the audio quota above.
 *
 * Images were left to chance and it showed: they are 5% of the pool, so a game contained one
 * about three quarters of the time and none the rest, which reads as "there are no picture
 * questions". Worse, they live in themes of their own (drapeaux, art, blasons), so any run
 * with a theme filter had exactly zero. A quota degrades to nothing on its own when the
 * chosen themes hold no images, which is the correct behaviour rather than a special case.
 */
const IMAGE_QUESTIONS_PER_15 = 3;

const ANSWER_KINDS = ["number", "list", "math"] as const;

/**
 * Reads the column, falling back to host-graded text for anything unrecognised.
 *
 * Written as a list rather than a chain of comparisons because the chain is where a new kind
 * gets forgotten: "math" silently arrived as "text" the first time, which does not fail — it
 * just quietly scores an arithmetic question as if a human had to judge it.
 */
function toAnswerKind(value: string): InternalQuestion["answerKind"] {
  return (ANSWER_KINDS as readonly string[]).includes(value) ? (value as InternalQuestion["answerKind"]) : "text";
}

function toInternal(row: QuestionRow): InternalQuestion {
  return {
    id: row.id,
    theme: row.theme,
    family: row.family,
    answerKind: toAnswerKind(row.answer_kind),
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
  kind: "audio" | "image" | "rest" | "numeric" | "list",
  mediaAvailable: boolean,
  /** Ids already placed in this deck. Two buckets can draw from the same pool — bluff rounds
   *  and ordinary questions both come from "rest" — and two independent ORDER BY RANDOM()
   *  queries happily return the same row, which put the same question in one game twice. */
  exclude: ReadonlySet<number> = new Set(),
): Promise<InternalQuestion[]> {
  if (limit <= 0) return [];
  const themes = settings.themes;
  const clauses = ["verified = 1"];
  if (themes.length > 0) {
    clauses.push(`theme IN (${themes.map(() => "?").join(",")})`);
  } else {
    // "All themes" means all the general ones. A run nobody filtered should not suddenly ask
    // about Dofus class mechanics; those come out only when someone picks them.
    clauses.push(`theme NOT IN (${OPT_IN_THEMES.map(() => "?").join(",")})`);
  }
  const themeBindings = themes.length > 0 ? themes : [...OPT_IN_THEMES];
  const excluded = [...exclude];
  if (excluded.length > 0) clauses.push(`id NOT IN (${excluded.map(() => "?").join(",")})`);
  if (kind === "numeric") {
    // Scored by proximity, so a wrong-but-close answer still counts for something.
    clauses.push("answer_kind = 'number'");
  } else if (kind === "list") {
    // A duel counts hits against a set, so it needs a question that carries one.
    clauses.push("answer_kind = 'list'");
  } else if (kind === "audio") {
    // The quota bucket, drawn separately so a game reliably contains some.
    clauses.push("type = 'audio' AND media_key IS NOT NULL");
  } else if (kind === "image") {
    // Its own quota bucket for the same reason as audio.
    clauses.push("type = 'image' AND media_key IS NOT NULL AND answer_kind = 'text'");
  } else {
    // Everything else, images and maths included. Splitting on "media_key IS NULL" instead
    // made image questions unreachable: they carry a media key but are not audio, so they
    // fell through both buckets and could never be drawn. Maths questions are in here for
    // the same reason — leave them out and picking the maths theme yields an empty game.
    clauses.push("type <> 'audio' AND answer_kind IN ('text', 'math')");
    if (!mediaAvailable) clauses.push("media_key IS NULL");
  }
  // Over-drawn on purpose: diversify() needs spare rows in each family to spread across.
  const stmt = db
    .prepare(`SELECT * FROM questions WHERE ${clauses.join(" AND ")} ORDER BY RANDOM() LIMIT ?`)
    .bind(...themeBindings, ...excluded, Math.min(limit * 6, 600));
  const { results } = await stmt.all<QuestionRow>();
  return diversify((results ?? []).map(toInternal), limit);
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

/**
 * Spreads a draw across question templates instead of letting one dominate.
 *
 * Families are generated in bulk — "Quel sport pratique X ?" alone has hundreds of rows — so
 * a plain random draw on a themed game returned twenty rewordings of the same sentence.
 * Taking one from each family in turn gives every template a share before any repeats.
 * Hand-written questions carry no family and are each their own bucket, so they are never
 * squeezed out by a large generated one.
 */
function diversify(rows: InternalQuestion[], limit: number): InternalQuestion[] {
  const buckets = new Map<string, InternalQuestion[]>();
  for (const q of rows) {
    const key = q.family ?? `solo:${q.id}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(q);
    else buckets.set(key, [q]);
  }

  const ordered = shuffle([...buckets.values()]);
  const out: InternalQuestion[] = [];
  for (let round = 0; out.length < limit; round++) {
    let tookAny = false;
    for (const bucket of ordered) {
      const q = bucket[round];
      if (!q) continue;
      out.push(q);
      tookAny = true;
      if (out.length >= limit) break;
    }
    if (!tookAny) break; // every bucket exhausted
  }
  return out;
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
  // A special round is never the first or last slot, so a short deck holds fewer of them.
  const specialBudget = total >= 3 ? total - 2 : 0;
  const chainCount = Math.min(settings.chainRounds, specialBudget);
  const bluffWanted = Math.min(settings.bluffRounds, Math.max(0, specialBudget - chainCount));
  const duelWanted = Math.min(settings.duelRounds, Math.max(0, specialBudget - chainCount - bluffWanted));
  // Reflex rounds carry no question of their own, so they only need budget, not bank.
  const reflexCount = Math.min(
    settings.reflexRounds,
    Math.max(0, specialBudget - chainCount - bluffWanted - duelWanted),
  );

  // Bluff and duel each need a question of their own, drawn first so the slot count can
  // shrink to what the bank can actually supply — a duel needs a list question, and there
  // may be none for the chosen themes.
  const drawn = new Set<number>();
  const take = async (n: number, kind: Parameters<typeof fetchQuestions>[3]) => {
    const rows = await fetchQuestions(db, settings, n, kind, mediaAvailable, drawn);
    for (const row of rows) drawn.add(row.id);
    return rows;
  };

  const bluffQuestions = await take(bluffWanted, "rest");
  const duelQuestions = await take(duelWanted, "list");

  const specialSlots = chainCount + reflexCount + bluffQuestions.length + duelQuestions.length;
  const questionSlots = Math.max(0, total - specialSlots);
  const audioQuota = mediaAvailable ? Math.round((total * AUDIO_QUESTIONS_PER_15) / 15) : 0;
  const imageQuota = mediaAvailable ? Math.round((total * IMAGE_QUESTIONS_PER_15) / 15) : 0;

  const numeric = await take(Math.min(settings.numericRounds, questionSlots), "numeric");
  const audio = await take(Math.min(audioQuota, Math.max(0, questionSlots - numeric.length)), "audio");
  // Whatever the quotas could not supply is taken up here, so the deck keeps its length.
  const image = await take(Math.min(imageQuota, Math.max(0, questionSlots - numeric.length - audio.length)), "image");
  const rest = await take(questionSlots - audio.length - numeric.length - image.length, "rest");
  const questions = shuffle([...audio, ...image, ...numeric, ...rest]);

  // The bank may hold fewer questions than asked for (narrow theme filter, unseeded DB).
  // Only ever lay out as many question slots as we actually drew — filling the gap with
  // undefined would build a deck of blank questions that plays out as an empty screen.
  if (questions.length === 0) return [];

  // Ordinary questions first, then the special rounds dropped into spread-out positions.
  const deck: DeckItem[] = questions.map((question) => ({ kind: "trivia", question }));
  const specials: DeckItem[] = shuffle([
    ...Array.from({ length: chainCount }, (): DeckItem => ({ kind: "chain" })),
    ...Array.from({ length: reflexCount }, (): DeckItem => ({ kind: "reflex" })),
    ...bluffQuestions.map((question): DeckItem => ({ kind: "bluff", question })),
    ...duelQuestions.map((question): DeckItem => ({ kind: "duel", question })),
  ]);
  const positions = [...pickChainPositions(deck.length + specials.length, specials.length)].sort((a, b) => a - b);
  positions.forEach((position, i) => {
    const special = specials[i];
    if (special) deck.splice(Math.min(position, deck.length), 0, special);
  });
  return deck;
}
