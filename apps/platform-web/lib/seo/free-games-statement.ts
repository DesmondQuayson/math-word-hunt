import type { GameSummary } from "@/lib/seo/catalog-summaries";

/**
 * Names the free games for the public Math Games page (v1.2.43). Each
 * `freeToPlay` comes from the access policy (`summarizeGames` asks
 * `isFreeToPlayGame`), and the games come from the published catalog, so the
 * page names exactly the published games that a MathNexa account with no
 * subscription may play. There is no list of names to keep up to date: a game
 * made free or published later is named automatically, and a draft or a
 * subscription game never is.
 */

/** "A", "A and B", "A, B and C": how the site's copy lists names. */
export function listInWords(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * "Math Tug of War, Math Bingo Live and Polygon Showdown are free with any
 * MathNexa account", naming the free games in the order given (catalog
 * order). Null when none of the games is free.
 */
export function freeGamesStatement(games: readonly Pick<GameSummary, "title" | "freeToPlay">[]): string | null {
  const names = games.filter((game) => game.freeToPlay).map((game) => game.title);
  if (!names.length) return null;
  return `${listInWords(names)} ${names.length === 1 ? "is" : "are"} free with any MathNexa account`;
}
