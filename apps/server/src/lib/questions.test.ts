import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@nonoculture/shared";
import { buildDeck } from "./questions.js";
import type { DeckItem } from "../room/types.js";

/**
 * A stand-in for D1 that serves rows from a fixed bank and honours the parts of the query
 * that matter here: the theme filter, the answer_kind bucket, and the id exclusion.
 *
 * Written against the SQL text on purpose — the bug being pinned is that two draws from the
 * same pool returned the same row, and only a fake that actually applies `id NOT IN (...)`
 * can tell whether the fix works.
 */
function fakeDb(rows: Record<string, unknown>[]): D1Database {
  return {
    prepare(sql: string) {
      let bound: unknown[] = [];
      const stmt = {
        bind(...args: unknown[]) {
          bound = args;
          return stmt;
        },
        all() {
          const limit = Number(bound[bound.length - 1]);
          const excluded = new Set(bound.slice(0, -1).filter((v) => typeof v === "number"));
          const wants = (kind: string) => sql.includes(kind);
          const themeArgs = bound.filter((v) => typeof v === "string");
          const themeIn = sql.includes("theme IN (");
          const themeNotIn = sql.includes("theme NOT IN (");
          const results = rows
            .filter((r) => !excluded.has(r.id as number))
            .filter((r) => {
              if (themeIn) return themeArgs.includes(r.theme as string);
              if (themeNotIn) return !themeArgs.includes(r.theme as string);
              return true;
            })
            .filter((r) => {
              if (wants("answer_kind = 'number'")) return r.answer_kind === "number";
              if (wants("answer_kind = 'list'")) return r.answer_kind === "list";
              if (wants("type = 'audio'")) return r.type === "audio";
              return r.type !== "audio" && (r.answer_kind === "text" || r.answer_kind === "math");
            })
            .slice(0, limit);
          return Promise.resolve({ results });
        },
      };
      return stmt as unknown as D1PreparedStatement;
    },
  } as unknown as D1Database;
}

const bank = Array.from({ length: 40 }, (_, i) => ({
  id: i + 1,
  theme: "geo",
  family: `f${i % 4}`,
  answer_kind: "text",
  difficulty: 1,
  type: "text",
  prompt: `Question ${i + 1} ?`,
  media_key: null,
  answer: `Réponse ${i + 1}`,
  aliases: "[]",
  explanation: null,
}));

const idsOf = (deck: DeckItem[]) =>
  deck.flatMap((item) => (item.kind === "chain" || item.kind === "reflex" ? [] : [item.question.id]));

describe("buildDeck", () => {
  it("never puts the same question in a game twice", async () => {
    // Bluff rounds and ordinary questions are drawn from the same pool by two separate
    // ORDER BY RANDOM() queries, which happily returned the same row — so a game could ask
    // a question and then ask players to invent a fake answer to it.
    const deck = await buildDeck(
      fakeDb(bank),
      { ...DEFAULT_SETTINGS, questionCount: 20, bluffRounds: 4, duelRounds: 0, reflexRounds: 0, numericRounds: 0 },
      { mediaAvailable: false },
    );
    const ids = idsOf(deck);
    expect(ids.length).toBeGreaterThan(10);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the deck at the length the host asked for", async () => {
    const deck = await buildDeck(
      fakeDb(bank),
      {
        ...DEFAULT_SETTINGS,
        questionCount: 12,
        chainRounds: 1,
        bluffRounds: 1,
        duelRounds: 0,
        reflexRounds: 1,
        numericRounds: 0,
      },
      { mediaAvailable: false },
    );
    expect(deck).toHaveLength(12);
  });

  it("spreads the draw across question families instead of exhausting one", async () => {
    const deck = await buildDeck(
      fakeDb(bank),
      {
        ...DEFAULT_SETTINGS,
        questionCount: 8,
        chainRounds: 0,
        bluffRounds: 0,
        duelRounds: 0,
        reflexRounds: 0,
        numericRounds: 0,
      },
      { mediaAvailable: false },
    );
    const families = deck.flatMap((i) => (i.kind === "trivia" ? [i.question.family] : []));
    expect(new Set(families).size).toBe(4);
  });
});

describe("theme selection", () => {
  const mixed = [
    ...bank.slice(0, 20),
    ...Array.from({ length: 20 }, (_, i) => ({ ...bank[i]!, id: 100 + i, theme: i % 2 === 0 ? "lol" : "dofus" })),
  ];

  it("leaves the game-specific themes out of an unfiltered run", async () => {
    // "Tous les thèmes" should not quietly start asking about Dofus class mechanics.
    const deck = await buildDeck(
      fakeDb(mixed),
      {
        ...DEFAULT_SETTINGS,
        questionCount: 15,
        themes: [],
        chainRounds: 0,
        bluffRounds: 0,
        duelRounds: 0,
        reflexRounds: 0,
        numericRounds: 0,
      },
      { mediaAvailable: false },
    );
    const themes = deck.flatMap((i) => (i.kind === "trivia" ? [i.question.theme] : []));
    expect(themes.length).toBeGreaterThan(0);
    expect(themes).not.toContain("lol");
    expect(themes).not.toContain("dofus");
  });

  it("still serves them when they are asked for by name", async () => {
    const deck = await buildDeck(
      fakeDb(mixed),
      {
        ...DEFAULT_SETTINGS,
        questionCount: 6,
        themes: ["lol"],
        chainRounds: 0,
        bluffRounds: 0,
        duelRounds: 0,
        reflexRounds: 0,
        numericRounds: 0,
      },
      { mediaAvailable: false },
    );
    const themes = deck.flatMap((i) => (i.kind === "trivia" ? [i.question.theme] : []));
    expect(themes.every((t) => t === "lol")).toBe(true);
  });
});
