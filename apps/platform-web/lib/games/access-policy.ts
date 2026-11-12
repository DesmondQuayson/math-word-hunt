/**
 * Game-level access classification: the ONE place that says who may play
 * which game.
 *
 *   "entitled"            MathNexa all-access (subscription, trial, or a school
 *                         access session). The default for every game.
 *   "authenticated-free"  Any signed-in MathNexa account (or a school access
 *                         session), no subscription needed. Never anonymous.
 *
 * Owner decision (2026-09-27): Math Tug of War is free for signed-in users.
 * To make it a paid game later, change its entry to "entitled"; nothing in the
 * gameplay, the play route or the Online Match API needs to change.
 *
 * Math Bingo Live (DRAFT, owner review) is free to HOST with any signed-in
 * account. Its students never sign in: they join one room with a game code
 * and a display name (app/api/games/math-bingo-live/play), which grants
 * nothing outside that room.
 */
export type GameAccessPolicy = "entitled" | "authenticated-free";

const GAME_ACCESS_POLICIES: Readonly<Record<string, GameAccessPolicy>> = Object.freeze({
  "math-tug-of-war": "authenticated-free",
  "math-bingo-live": "authenticated-free",
  // Free for any signed-in account. Its Showdown guests never sign in: they
  // join one room with a code and a display name, which grants nothing outside
  // that room and creates no account, wallet or saved progress.
  "polygon-showdown": "authenticated-free",
  // Free for any signed-in account or school session (owner preference,
  // 2026-11-11). Only signed-in accounts keep a Race Dollar wallet, cars and
  // stage progress; Online Race guests join one room with a code and a display
  // name, which grants nothing outside that room.
  "math-race-champions": "authenticated-free"
});

type FreeGameRoute = `/games/${string}/play` | `/games/${string}/host`;

/** Play (or host) routes of authenticated-free games, keyed by catalog slug. */
const FREE_GAME_PLAY_ROUTES: Readonly<Record<string, FreeGameRoute>> = Object.freeze({
  "math-tug-of-war": "/games/math-tug-of-war/play",
  "math-bingo-live": "/games/math-bingo-live/host",
  "polygon-showdown": "/games/polygon-showdown/play",
  "math-race-champions": "/games/math-race-champions/play"
});

export const MATH_RACE_CHAMPIONS_PLAY_ROUTE = "/games/math-race-champions/play" as const;
export const MATH_TUG_OF_WAR_PLAY_ROUTE = "/games/math-tug-of-war/play" as const;
export const MATH_BINGO_LIVE_HOST_ROUTE = "/games/math-bingo-live/host" as const;
export const POLYGON_SHOWDOWN_PLAY_ROUTE = "/games/polygon-showdown/play" as const;

export function gameAccessPolicy(stableKey: string): GameAccessPolicy {
  return Object.prototype.hasOwnProperty.call(GAME_ACCESS_POLICIES, stableKey) ? GAME_ACCESS_POLICIES[stableKey] : "entitled";
}

export function isFreeToPlayGame(stableKey: string): boolean {
  return gameAccessPolicy(stableKey) === "authenticated-free";
}

/**
 * The stable key of the authenticated-free game served at this slug, or null.
 * Decided from a static table, before any database read, so a play request
 * is authenticated before anything about the catalog is looked up.
 */
export function freeGameKeyForSlug(slug: string): string | null {
  return Object.prototype.hasOwnProperty.call(FREE_GAME_PLAY_ROUTES, slug) && isFreeToPlayGame(slug) ? slug : null;
}

export function freeGamePlayRoute(stableKey: string): FreeGameRoute | null {
  return isFreeToPlayGame(stableKey) && Object.prototype.hasOwnProperty.call(FREE_GAME_PLAY_ROUTES, stableKey) ? FREE_GAME_PLAY_ROUTES[stableKey] : null;
}
