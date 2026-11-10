import { describe, expect, it, vi } from "vitest";

import type { PublicGame } from "@/lib/games/catalog";

vi.mock("@/lib/games/catalog", () => ({ loadPublicGameCatalog: vi.fn() }));
vi.mock("@/lib/resources/catalog", () => ({ loadPublicResourceLibrary: vi.fn() }));

import { gameAccessPolicy } from "@/lib/games/access-policy";

import { summarizeGames } from "./catalog-summaries";
import {
  MATH_TUG_OF_WAR_FALLBACK,
  freeGames,
  freeGamesPredicate,
  freeGamesStatement,
  listInWords,
  listSeparator,
  listedGames
} from "./free-games-statement";

/** A published catalog entry with only the fields the summaries read. */
function published(stableKey: string, title: string): PublicGame {
  return {
    id: "0b7f3c1e-4d2a-4f6b-9c8d-1e2f3a4b5c6d",
    resourceId: "0b7f3c1e-4d2a-4f6b-9c8d-1e2f3a4b5c6d",
    packageId: null,
    stableKey,
    slug: stableKey,
    title,
    description: `${title} description.`,
    launch: { type: "internal", key: stableKey },
    thumbnailReference: `builtin:${stableKey}`,
    recommendedGradeMin: 3,
    recommendedGradeMax: 8,
    skills: [],
    topics: [],
    tags: [],
    difficulty: "medium",
    version: "1.0.0"
  } as PublicGame;
}

// Production's published catalog on 2026-11-10, in display order.
const PRODUCTION_CATALOG = [
  published("math-vocabulary-hunt", "Math Vocabulary Hunt"),
  published("number-cross", "Number Cross"),
  published("number-logic", "Number Logic"),
  published("crosscalc", "CrossCalc"),
  published("math-tug-of-war", "Math Tug of War"),
  published("math-bingo-live", "Math Bingo Live"),
  published("polygon-showdown", "Polygon Showdown")
];

function statementFor(catalog: readonly PublicGame[]): string | null {
  return freeGamesStatement(summarizeGames(catalog));
}

describe("listInWords", () => {
  it("lists names the way the site's copy does, with no serial comma", () => {
    expect(listInWords([])).toBe("");
    expect(listInWords(["A"])).toBe("A");
    expect(listInWords(["A", "B"])).toBe("A and B");
    expect(listInWords(["A", "B", "C"])).toBe("A, B and C");
    expect(listInWords(["A", "B", "C", "D"])).toBe("A, B, C and D");
  });

  it("is built from listSeparator, which the linked names on Help and About use", () => {
    expect([0, 1, 2].map((index) => listSeparator(index, 3))).toEqual(["", ", ", " and "]);
    expect([0, 1].map((index) => listSeparator(index, 2))).toEqual(["", " and "]);
    expect(listSeparator(0, 1)).toBe("");
  });
});

describe("freeGamesPredicate", () => {
  it("agrees with the number of names", () => {
    expect(freeGamesPredicate(1)).toBe("is free with any MathNexa account");
    expect(freeGamesPredicate(3)).toBe("are free with any MathNexa account");
  });
});

describe("listedGames and freeGames", () => {
  it("lists the published catalog, and only Math Tug of War when the catalog cannot be read", () => {
    const games = summarizeGames(PRODUCTION_CATALOG);
    expect(listedGames({ available: true, games })).toBe(games);
    expect(listedGames({ available: false, games: [] })).toEqual([MATH_TUG_OF_WAR_FALLBACK]);
    expect(MATH_TUG_OF_WAR_FALLBACK).toMatchObject({ stableKey: "math-tug-of-war", title: "Math Tug of War", freeToPlay: true });
    expect(freeGamesStatement(listedGames({ available: false, games: [] }))).toBe("Math Tug of War is free with any MathNexa account");
  });

  it("keeps the free games in catalog order", () => {
    expect(freeGames(summarizeGames(PRODUCTION_CATALOG)).map((game) => game.stableKey)).toEqual(["math-tug-of-war", "math-bingo-live", "polygon-showdown"]);
    expect(freeGames(summarizeGames(PRODUCTION_CATALOG.filter((game) => gameAccessPolicy(game.stableKey) === "entitled")))).toEqual([]);
  });
});

describe("freeGamesStatement", () => {
  it("names every free game in Production's catalog, Polygon Showdown included, in catalog order", () => {
    expect(statementFor(PRODUCTION_CATALOG)).toBe("Math Tug of War, Math Bingo Live and Polygon Showdown are free with any MathNexa account");
  });

  it("follows the access policy, not the title: the subscription games are never named", () => {
    const statement = statementFor(PRODUCTION_CATALOG) ?? "";
    for (const game of PRODUCTION_CATALOG.filter((entry) => gameAccessPolicy(entry.stableKey) === "entitled")) {
      expect(statement, game.title).not.toContain(game.title);
    }
    // A new catalog game is "entitled" by default, so publishing one adds nothing.
    expect(statementFor([...PRODUCTION_CATALOG, published("fraction-frenzy", "Fraction Frenzy (free!)")])).toBe(statementFor(PRODUCTION_CATALOG));
  });

  it("names only published games: a free game that is not in the published catalog is left out", () => {
    const withoutPolygon = PRODUCTION_CATALOG.filter((game) => game.stableKey !== "polygon-showdown");
    expect(statementFor(withoutPolygon)).toBe("Math Tug of War and Math Bingo Live are free with any MathNexa account");
    expect(statementFor([published("math-tug-of-war", "Math Tug of War")])).toBe("Math Tug of War is free with any MathNexa account");
  });

  it("is null when no listed game is free", () => {
    expect(statementFor([])).toBeNull();
    expect(statementFor(PRODUCTION_CATALOG.filter((game) => gameAccessPolicy(game.stableKey) === "entitled"))).toBeNull();
  });

  it("names a game made free later without any list to edit", () => {
    // freeToPlay is the only input that decides: here, as if the policy made CrossCalc free.
    const summaries = summarizeGames(PRODUCTION_CATALOG).map((game) => game.stableKey === "crosscalc" ? { ...game, freeToPlay: true } : game);
    expect(freeGamesStatement(summaries)).toBe("CrossCalc, Math Tug of War, Math Bingo Live and Polygon Showdown are free with any MathNexa account");
  });
});
