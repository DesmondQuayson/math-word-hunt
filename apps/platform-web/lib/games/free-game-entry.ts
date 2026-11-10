import { isFreeGameDestination } from "@/lib/auth/access-intent";
import { freeGamePlayRoute } from "@/lib/games/access-policy";

/**
 * Where a "play free" link for a game goes: its play (or host) route when any
 * signed-in MathNexa account may play it with no subscription and sign in can
 * return there, otherwise null.
 *
 * This is the test requireGamePlayAccess (lib/access/server.ts) applies before
 * it admits an account with no subscription: the access policy says
 * "authenticated-free" (lib/games/access-policy.ts) and the route is one of
 * FREE_GAME_DESTINATIONS (lib/auth/access-intent.ts). So a link built from it
 * takes a signed-out visitor through sign in and back to the game, and never
 * ends at subscription review. The homepage cards, the Math Games cards and
 * the free-game names on Help and About all use it.
 */
export function freeGameEntryRoute(stableKey: string): string | null {
  const route = freeGamePlayRoute(stableKey);
  return route !== null && isFreeGameDestination(route) ? route : null;
}
