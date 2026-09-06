import { describe, expect, it } from "vitest";
import {
  classifyAnswer,
  isChainMatch,
  levenshteinDistance,
  normalizeAnswer,
  normalizedLevenshtein,
} from "./answer-validation.js";

describe("normalizeAnswer", () => {
  it("lowercases and strips accents", () => {
    expect(normalizeAnswer("Écureuil")).toBe("ecureuil");
  });

  it("strips a leading article", () => {
    expect(normalizeAnswer("Le Louvre")).toBe("louvre");
    expect(normalizeAnswer("la tour eiffel")).toBe("tour eiffel");
    expect(normalizeAnswer("l'Arc de Triomphe")).toBe("arc de triomphe");
    expect(normalizeAnswer("the beatles")).toBe("beatles");
  });

  it("strips punctuation and collapses whitespace", () => {
    expect(normalizeAnswer("  Napoléon,   Bonaparte !!")).toBe("napoleon bonaparte");
  });

  it("is idempotent on an empty string", () => {
    expect(normalizeAnswer("")).toBe("");
  });
});

describe("levenshteinDistance", () => {
  it("is 0 for identical strings", () => {
    expect(levenshteinDistance("paris", "paris")).toBe(0);
  });

  it("counts a single substitution", () => {
    expect(levenshteinDistance("paris", "parie")).toBe(1);
  });

  it("handles empty strings", () => {
    expect(levenshteinDistance("", "abc")).toBe(3);
    expect(levenshteinDistance("abc", "")).toBe(3);
  });

  it("is symmetric", () => {
    expect(levenshteinDistance("kitten", "sitting")).toBe(levenshteinDistance("sitting", "kitten"));
  });
});

describe("normalizedLevenshtein", () => {
  it("returns 0 for two empty strings", () => {
    expect(normalizedLevenshtein("", "")).toBe(0);
  });

  it("scales by the longer string length", () => {
    expect(normalizedLevenshtein("paris", "parie")).toBeCloseTo(1 / 5);
  });
});

describe("classifyAnswer", () => {
  it("auto-validates an exact match", () => {
    expect(classifyAnswer("Paris", "Paris").classification).toBe("auto_valid");
  });

  it("auto-validates through normalization differences", () => {
    expect(classifyAnswer("le paris", "Paris").classification).toBe("auto_valid");
  });

  it("auto-validates a tiny typo within threshold", () => {
    // "amsterdan" vs "amsterdam": distance 1 / length 9 = 0.111, under the 0.15 threshold
    expect(classifyAnswer("amsterdan", "amsterdam").classification).toBe("auto_valid");
  });

  it("accepts via alias list", () => {
    const result = classifyAnswer("New York", "New York City", ["NYC", "New York"]);
    expect(result.classification).toBe("auto_valid");
  });

  it("auto-rejects a wildly different answer", () => {
    expect(classifyAnswer("bicyclette", "Paris").classification).toBe("auto_invalid");
  });

  it("auto-rejects an empty answer", () => {
    expect(classifyAnswer("", "Paris").classification).toBe("auto_invalid");
  });

  it("puts a moderate typo in the grey zone for room vote", () => {
    // "berlim" vs "berlin": distance 1 / 6 = 0.166, above 0.15 threshold
    const result = classifyAnswer("berlim", "berlin");
    expect(result.classification).toBe("grey_zone");
  });
});

describe("isChainMatch", () => {
  it("accepts an exact match, ignoring case and accents", () => {
    expect(isChainMatch("Un Château", "un chateau")).toBe(true);
  });

  it("accepts a guess that drops or adds filler words around the same idea", () => {
    // The point of the round is whether the drawing carried the idea across, not whether
    // the guesser reproduced the article — classifyAnswer's 0.15 threshold rejects these.
    expect(isChainMatch("chat qui danse", "un chat qui danse")).toBe(true);
    expect(isChainMatch("un gros chien qui dort", "chien qui dort")).toBe(true);
  });

  it("tolerates a typo on a short prompt", () => {
    expect(isChainMatch("banana", "banane")).toBe(true);
  });

  it("still rejects an unrelated guess", () => {
    expect(isChainMatch("voiture", "un chat qui danse")).toBe(false);
    expect(isChainMatch("nimportequoi", "banane")).toBe(false);
  });

  it("rejects phrases that only share their filler words", () => {
    // These sit within ~0.3 normalized edit distance of each other, which is exactly why a
    // plain distance threshold can't be used here.
    expect(isChainMatch("un chien qui danse", "un chat qui danse")).toBe(false);
    expect(isChainMatch("marie qui court", "julie qui court")).toBe(false);
  });

  it("rejects a guess that only picks up one word of a longer prompt", () => {
    expect(isChainMatch("danse", "un chat qui danse")).toBe(false);
  });

  it("accepts a guess missing one non-essential word", () => {
    expect(isChainMatch("chat qui danse", "un gros chat qui danse")).toBe(true);
  });

  it("rejects empty input on either side", () => {
    expect(isChainMatch("", "banane")).toBe(false);
    expect(isChainMatch("banane", "")).toBe(false);
    expect(isChainMatch("   ", "banane")).toBe(false);
  });
});
