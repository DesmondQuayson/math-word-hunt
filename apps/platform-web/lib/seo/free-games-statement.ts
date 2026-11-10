import type { GameCatalogSummary, GameSummary } from "@/lib/seo/catalog-summaries";

/**
 * Names the free games on the public pages: Math Games (v1.2.43), and Help,
 * About and Pricing (v1.2.44). Each `freeToPlay` comes from the access policy
 * (`summarizeGames` asks `isFreeToPlayGame`), and the games come from the
 * published catalog, so a page names exactly the published games that a
 * MathNexa account with no subscription may play. There is no list of names to
 * keep up to date: a game made free or published later is named automatically,
 * and a draft or a subscription game never is.
 */

/** Shown, and named, only when the catalog cannot be read: the free game is always offered. */
export const MATH_TUG_OF_WAR_FALLBACK: GameSummary = Object.freeze({
  stableKey: "math-tug-of-war",
  thumbnailReference: "",
  title: "Math Tug of War",
  description: "Solve the math. Pull the rope. Beat the other side!",
  grades: null,
  skills: [],
  freeToPlay: true
});

/** The games a public page lists and names: the published catalog, or Math Tug of War alone when the catalog cannot be read. */
export function listedGames(summary: GameCatalogSummary): readonly GameSummary[] {
  return summary.available ? summary.games : [MATH_TUG_OF_WAR_FALLBACK];
}

/** The free games among `games`, in the order given (catalog order). */
export function freeGames<T extends Pick<GameSummary, "freeToPlay">>(games: readonly T[]): T[] {
  return games.filter((game) => game.freeToPlay);
}

/** What goes before item `index` of `count` when they are listed in words: "", ", " or " and ". */
export function listSeparator(index: number, count: number): string {
  if (index <= 0) return "";
  return index === count - 1 ? " and " : ", ";
}

/** "A", "A and B", "A, B and C": how the site's copy lists names. */
export function listInWords(names: readonly string[]): string {
  return names.map((name, index) => `${listSeparator(index, names.length)}${name}`).join("");
}

/** "is free with any MathNexa account" after one name, "are free with any MathNexa account" after several. */
export function freeGamesPredicate(count: number): string {
  return `${count === 1 ? "is" : "are"} free with any MathNexa account`;
}

/**
 * "Math Tug of War, Math Bingo Live and Polygon Showdown are free with any
 * MathNexa account", naming the free games in the order given (catalog
 * order). Null when none of the games is free.
 */
export function freeGamesStatement(games: readonly Pick<GameSummary, "title" | "freeToPlay">[]): string | null {
  const names = freeGames(games).map((game) => game.title);
  if (!names.length) return null;
  return `${listInWords(names)} ${freeGamesPredicate(names.length)}`;
}
