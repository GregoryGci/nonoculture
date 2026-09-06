import type { RevealedAnswer } from "./domain.js";

/** Points awarded scale 1:1 with difficulty (1 = facile, 3 = difficile). */
export function pointsForDifficulty(difficulty: 1 | 2 | 3): number {
  return difficulty;
}

export interface ScoreDelta {
  playerId: string;
  points: number;
}

/**
 * Given the final acceptance state of every answer to a question (after auto-validation
 * and, if needed, the JUDGING vote), compute the score delta for each player.
 */
export function computeScoreDeltas(
  answers: Pick<RevealedAnswer, "playerId" | "accepted">[],
  difficulty: 1 | 2 | 3,
): ScoreDelta[] {
  const points = pointsForDifficulty(difficulty);
  return answers.map((a) => ({
    playerId: a.playerId,
    points: a.accepted ? points : 0,
  }));
}

export function applyScoreDeltas(
  scores: Record<string, number>,
  deltas: ScoreDelta[],
): Record<string, number> {
  const next = { ...scores };
  for (const delta of deltas) {
    next[delta.playerId] = (next[delta.playerId] ?? 0) + delta.points;
  }
  return next;
}
