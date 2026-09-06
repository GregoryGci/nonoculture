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

  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
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

  const distance = Math.min(
    ...candidates.map((candidate) => normalizedLevenshtein(normSubmitted, candidate)),
  );

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
