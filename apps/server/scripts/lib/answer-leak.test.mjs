import { describe, expect, it } from "vitest";
import { answerLeaksIntoPrompt } from "./answer-leak.mjs";

describe("answerLeaksIntoPrompt", () => {
  it("catches the answer sitting in plain sight", () => {
    expect(answerLeaksIntoPrompt("Dans quelle ville joue le club Spartak Moscou ?", "Moscou")).toBe(true);
    expect(answerLeaksIntoPrompt("Qui a écrit « Le Journal d'Anne Frank » ?", "Anne Frank")).toBe(true);
    expect(
      answerLeaksIntoPrompt("À quel sport se rattache l'épreuve « championnat de Serbie de football » ?", "football"),
    ).toBe(true);
  });

  it("catches the adjectival forms a substring test walks past", () => {
    // These are the ones that shipped: the word is not there, the root is.
    expect(answerLeaksIntoPrompt("Dans quel pays paie-t-on en dollar canadien ?", "Canada")).toBe(true);
    expect(answerLeaksIntoPrompt("Dans quel pays paie-t-on en dollar guyanien ?", "Guyana")).toBe(true);
    expect(answerLeaksIntoPrompt("Quel pays a pour capitale São Tomé ?", "Sao Tomé-et-Principe")).toBe(true);
  });

  it("ignores accents and case, since the bank is inconsistent about both", () => {
    expect(answerLeaksIntoPrompt("Quel pays a pour capitale ANDORRE-LA-VIEILLE ?", "Andorre")).toBe(true);
  });

  it("does not mistake the category noun for a giveaway", () => {
    // A French answer repeats the noun the question asked for. That is grammar, not a leak:
    // "Sécession", "Versailles" and "Pacifique" are what actually had to be known.
    expect(answerLeaksIntoPrompt("Quelle guerre a opposé le Nord et le Sud ?", "la guerre de Sécession")).toBe(false);
    expect(answerLeaksIntoPrompt("Quel traité a mis fin à la Grande Guerre ?", "le traité de Versailles")).toBe(false);
    expect(answerLeaksIntoPrompt("Quel est le plus grand océan du monde ?", "l'océan Pacifique")).toBe(false);
  });

  it("does not treat a unit as the answer it accompanies", () => {
    expect(answerLeaksIntoPrompt("Une année sur Mercure dure combien de jours ?", "88 jours")).toBe(false);
    expect(answerLeaksIntoPrompt("En combien d'heures la Terre tourne-t-elle sur elle-même ?", "24 heures")).toBe(
      false,
    );
  });

  it("leaves a genuine question alone", () => {
    expect(answerLeaksIntoPrompt("Quel pays a pour capitale Ottawa ?", "Canada")).toBe(false);
    expect(answerLeaksIntoPrompt("Dans quelle ville joue le club Arsenal FC ?", "Londres")).toBe(false);
    expect(answerLeaksIntoPrompt("Quel sport pratique Rafael Nadal ?", "tennis")).toBe(false);
  });

  it("does not trip on short words that collide by chance", () => {
    // "de", "la", "les" appear in nearly every prompt; only real words count.
    expect(answerLeaksIntoPrompt("Quelle est la capitale de la Suisse ?", "Berne")).toBe(false);
  });

  it("says nothing about an empty or one-letter answer", () => {
    expect(answerLeaksIntoPrompt("Quelque chose ?", "")).toBe(false);
    expect(answerLeaksIntoPrompt("Quelque chose ?", "x")).toBe(false);
  });
});
