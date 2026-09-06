// "l'" elides directly onto the next word (no space), unlike "le "/"la "/etc.
const INITIAL_ARTICLES = /^(le|la|les|un|une|the)\s+|^l['’]\s*/i;

/**
 * Lowercase, strip accents/punctuation, collapse whitespace, drop a leading article.
 * Applied to both the submitted answer and the reference answer/aliases before compare.
 */
export function normalizeAnswer(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // combining accents after NFD decomposition
    .toLowerCase()
    .trim()
    .replace(INITIAL_ARTICLES, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // punctuation -> space
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Both rows are filled for indices 0..b.length before any of them is read, so the
  // non-null assertions below hold; they're only needed because noUncheckedIndexedAccess
  // types every array read as possibly undefined.
  let prev: number[] = new Array<number>(b.length + 1);
  let curr: number[] = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const deletion = prev[j]! + 1;
      const insertion = curr[j - 1]! + 1;
      const substitution = prev[j - 1]! + cost;
      curr[j] = Math.min(deletion, insertion, substitution);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length]!;
}

/** Distance normalized by the length of the longer string, in [0, 1]. */
export function normalizedLevenshtein(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  return levenshteinDistance(a, b) / maxLen;
}

export const AUTO_VALID_THRESHOLD = 0.15;
/** Above this normalized distance, an answer is auto-rejected outright. */
export const AUTO_INVALID_THRESHOLD = 0.5;

export type AnswerClassification = "auto_valid" | "auto_invalid" | "grey_zone";

/**
 * Chain ("téléphone dessiné") prompts are free-form phrases, not canonical answers with
 * aliases, so classifyAnswer is the wrong tool for them: its 0.15 distance makes
 * "chat qui danse" miss "un chat qui danse", while simply loosening the threshold makes
 * "p2 qui danse" match "host qui danse" — long phrases that differ only in their subject
 * sit very close in edit distance. Comparing the *significant words* instead gets both
 * right: filler words are free, but every meaningful word has to be accounted for.
 */
const FILLER_WORDS = new Set([
  "le",
  "la",
  "les",
  "l",
  "un",
  "une",
  "des",
  "de",
  "du",
  "d",
  "au",
  "aux",
  "a",
  "et",
  "ou",
  "qui",
  "que",
  "qu",
  "dans",
  "sur",
  "avec",
  "en",
  "est",
  "sont",
  "pour",
  "par",
  "se",
  "sa",
  "son",
  "ses",
  "ce",
  "cet",
  "cette",
  "il",
  "elle",
  "on",
  "the",
  "of",
]);

/** Two words are "the same word" through a typo or a plural. */
const WORD_DISTANCE_THRESHOLD = 0.25;
/** Share of the longer side's words that must be accounted for. Above 0.5 on purpose:
 *  "danse" alone shouldn't pass for "un chat qui danse" (1 of its 2 significant words),
 *  while dropping one word out of three still should. */
const WORD_COVERAGE_THRESHOLD = 0.6;

function significantWords(input: string): string[] {
  const words = normalizeAnswer(input)
    .split(" ")
    .filter((w) => w.length > 0);
  const kept = words.filter((w) => !FILLER_WORDS.has(w));
  return kept.length > 0 ? kept : words; // a prompt made only of filler words is still a prompt
}

/**
 * Whether a chain guess counts as having found the original prompt: every significant word
 * of the shorter side has a counterpart on the other, and enough of the longer side is
 * covered that the two are talking about the same thing.
 */
export function isChainMatch(guess: string, prompt: string): boolean {
  const normGuess = normalizeAnswer(guess);
  const normPrompt = normalizeAnswer(prompt);
  if (normGuess.length === 0 || normPrompt.length === 0) return false;
  if (normGuess === normPrompt) return true;

  const guessWords = significantWords(guess);
  const promptWords = significantWords(prompt);
  const [shorter, longer] =
    guessWords.length <= promptWords.length ? [guessWords, promptWords] : [promptWords, guessWords];

  const unmatched = [...longer];
  for (const word of shorter) {
    const idx = unmatched.findIndex((other) => normalizedLevenshtein(word, other) <= WORD_DISTANCE_THRESHOLD);
    if (idx === -1) return false; // a word of the shorter side is nowhere on the other: different idea
    unmatched.splice(idx, 1);
  }
  return (longer.length - unmatched.length) / longer.length >= WORD_COVERAGE_THRESHOLD;
}

/**
 * Compares a submitted answer against the expected answer and its aliases.
 * Takes the *best* (smallest) normalized distance across all candidates.
 */
export function classifyAnswer(
  submitted: string,
  expected: string,
  aliases: string[] = [],
): { classification: AnswerClassification; distance: number } {
  const normSubmitted = normalizeAnswer(submitted);
  const candidates = [expected, ...aliases].map(normalizeAnswer);

  const distance = Math.min(...candidates.map((candidate) => normalizedLevenshtein(normSubmitted, candidate)));

  if (normSubmitted.length === 0) {
    return { classification: "auto_invalid", distance: 1 };
  }
  if (distance <= AUTO_VALID_THRESHOLD) {
    return { classification: "auto_valid", distance };
  }
  if (distance >= AUTO_INVALID_THRESHOLD) {
    return { classification: "auto_invalid", distance };
  }
  return { classification: "grey_zone", distance };
}
