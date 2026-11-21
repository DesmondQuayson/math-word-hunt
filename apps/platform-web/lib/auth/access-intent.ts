/**
 * The product entries that a MathNexa entitlement protects. "/worksheets" is
 * the app's entry for the ShowMe Math Worksheet Generator: it runs the same
 * server-side access decision as the other four and then sends an entitled
 * visitor on to the generator (app/worksheets/layout.tsx).
 */
export const PRODUCT_DESTINATIONS = [
  "/games",
  "/map-prep",
  "/homework",
  "/quizzes",
  "/worksheets"
] as const;

/**
 * Where a completed authentication journey lands when nothing better was asked
 * for.
 *
 * This is the ONE place that decision is made. It used to be "/account", so
 * someone who simply chose "Sign in" from the navigation was dropped on a
 * billing-and-security page instead of the product. Account is still reachable
 * whenever a person asks for it; it is just no longer where signing in ends.
 */
export const POST_AUTH_DESTINATION = "/" as const;

/**
 * Where a NEW account continues after it confirms its email when it asked for
 * nothing more specific: the subscription page, which for an account that has
 * never redeemed its one trial is the "Start your free trial" step.
 *
 * Signing in keeps POST_AUTH_DESTINATION. Only account creation changes: a
 * person who just made an account and confirmed it used to land back on the
 * homepage with no next step, and most never found the trial (2026-11-21 funnel
 * audit: 8 of 11 confirmed accounts in 30 days never opened it).
 */
export const NEW_ACCOUNT_DESTINATION = "/subscription" as const;

/**
 * Games that are free for any signed-in MathNexa account
 * (lib/games/access-policy.ts). Their play route is a server-owned return
 * destination so "Play for Free Now" → sign in / create account → the game.
 * It is NOT a product destination: no subscription screen ever resolves to it.
 */
export const FREE_GAME_DESTINATIONS = [
  "/games/math-tug-of-war/play",
  "/games/math-bingo-live/host",
  "/games/polygon-showdown/play",
  "/games/math-race-champions/play"
] as const;

export const ACCESS_INTENT_DESTINATIONS = [
  POST_AUTH_DESTINATION,
  ...PRODUCT_DESTINATIONS,
  ...FREE_GAME_DESTINATIONS,
  "/subscription",
  "/account"
] as const;

export type FreeGameDestination = (typeof FREE_GAME_DESTINATIONS)[number];

export type ProductDestination = (typeof PRODUCT_DESTINATIONS)[number];
export type AccessIntentDestination = (typeof ACCESS_INTENT_DESTINATIONS)[number];

const productDestinations = new Set<string>(PRODUCT_DESTINATIONS);
const accessIntentDestinations = new Set<string>(ACCESS_INTENT_DESTINATIONS);
const freeGameDestinations = new Set<string>(FREE_GAME_DESTINATIONS);

export function isFreeGameDestination(value: string | null | undefined): value is FreeGameDestination {
  return typeof value === "string" && freeGameDestinations.has(value);
}

export function isProductDestination(value: string | null | undefined): value is ProductDestination {
  return typeof value === "string" && productDestinations.has(value);
}

/**
 * The destination of a new account's confirmation link. `requested` must
 * already be an allowlisted path (safeInternalRedirect). A free game, a
 * product, the subscription page or My Account is kept: the free game opens
 * with no trial language, and a product re-checks access and sends an account
 * without a subscription to /subscription?next=<product>. Nothing asked for,
 * or the generic homepage, becomes the trial step.
 */
export function signUpDestination(requested: string | null | undefined): string {
  return !requested || requested === POST_AUTH_DESTINATION ? NEW_ACCOUNT_DESTINATION : requested;
}

export function safeProductDestination(
  value: string | null | undefined,
  fallback: ProductDestination = "/games"
): ProductDestination {
  return value && productDestinations.has(value) ? value as ProductDestination : fallback;
}

export function safeAccessIntentDestination(
  value: string | null | undefined,
  fallback: AccessIntentDestination = POST_AUTH_DESTINATION
): AccessIntentDestination {
  return value && accessIntentDestinations.has(value) ? value as AccessIntentDestination : fallback;
}

export function accessIntentHref(destination: AccessIntentDestination): string {
  return `/access?next=${safeAccessIntentDestination(destination)}`;
}

export function subscriptionReviewHref(destination: ProductDestination): string {
  return `/subscription?next=${safeProductDestination(destination)}`;
}

export function confirmationRequiredHref(destination: AccessIntentDestination): string {
  return `/confirmation-required?next=${safeAccessIntentDestination(destination)}`;
}

export function destinationLabel(destination: AccessIntentDestination): string {
  return {
    "/": "Home",
    "/games": "Math Games",
    "/map-prep": "Online Math Prep",
    "/homework": "Homework PDFs",
    "/quizzes": "Quiz PDFs",
    "/worksheets": "Worksheet Generator",
    "/games/math-tug-of-war/play": "Math Tug of War",
    "/games/math-bingo-live/host": "Math Bingo Live",
    "/games/polygon-showdown/play": "Polygon Showdown",
    "/games/math-race-champions/play": "Math Race Champions",
    "/subscription": "Subscription",
    "/account": "My Account"
  }[destination];
}
