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
 */
export type GameAccessPolicy = "entitled" | "authenticated-free";

const GAME_ACCESS_POLICIES: Readonly<Record<string, GameAccessPolicy>> = Object.freeze({
  "math-tug-of-war": "authenticated-free"
});

/** Play routes of authenticated-free games, keyed by catalog slug. */
const FREE_GAME_PLAY_ROUTES: Readonly<Record<string, `/games/${string}/play`>> = Object.freeze({
  "math-tug-of-war": "/games/math-tug-of-war/play"
});

export const MATH_TUG_OF_WAR_PLAY_ROUTE = "/games/math-tug-of-war/play" as const;

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

export function freeGamePlayRoute(stableKey: string): `/games/${string}/play` | null {
  return isFreeToPlayGame(stableKey) && Object.prototype.hasOwnProperty.call(FREE_GAME_PLAY_ROUTES, stableKey) ? FREE_GAME_PLAY_ROUTES[stableKey] : null;
}
