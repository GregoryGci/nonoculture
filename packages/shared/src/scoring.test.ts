import { describe, expect, it } from "vitest";
import { applyScoreDeltas, computeScoreDeltas, pointsForDifficulty } from "./scoring.js";

describe("pointsForDifficulty", () => {
  it("maps difficulty 1/2/3 to the same point value", () => {
    expect(pointsForDifficulty(1)).toBe(1);
    expect(pointsForDifficulty(2)).toBe(2);
    expect(pointsForDifficulty(3)).toBe(3);
  });
});

describe("computeScoreDeltas", () => {
  it("awards points only to accepted answers", () => {
    const deltas = computeScoreDeltas(
      [
        { playerId: "a", accepted: true },
        { playerId: "b", accepted: false },
      ],
      3,
    );
    expect(deltas).toEqual([
      { playerId: "a", points: 3 },
      { playerId: "b", points: 0 },
    ]);
  });

  it("returns an empty array for no answers", () => {
    expect(computeScoreDeltas([], 2)).toEqual([]);
  });
});

describe("applyScoreDeltas", () => {
  it("accumulates points onto existing scores", () => {
    const result = applyScoreDeltas(
      { a: 5, b: 2 },
      [
        { playerId: "a", points: 3 },
        { playerId: "b", points: 0 },
      ],
    );
    expect(result).toEqual({ a: 8, b: 2 });
  });

  it("initializes a score for a player not seen before", () => {
    const result = applyScoreDeltas({}, [{ playerId: "c", points: 1 }]);
    expect(result).toEqual({ c: 1 });
  });

  it("does not mutate the input scores object", () => {
    const scores = { a: 1 };
    applyScoreDeltas(scores, [{ playerId: "a", points: 1 }]);
    expect(scores).toEqual({ a: 1 });
  });
});
