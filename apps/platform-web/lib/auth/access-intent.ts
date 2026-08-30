export const PRODUCT_DESTINATIONS = [
  "/games",
  "/map-prep",
  "/homework",
  "/quizzes"
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

export const ACCESS_INTENT_DESTINATIONS = [
  POST_AUTH_DESTINATION,
  ...PRODUCT_DESTINATIONS,
  "/subscription",
  "/account"
] as const;

export type ProductDestination = (typeof PRODUCT_DESTINATIONS)[number];
export type AccessIntentDestination = (typeof ACCESS_INTENT_DESTINATIONS)[number];

const productDestinations = new Set<string>(PRODUCT_DESTINATIONS);
const accessIntentDestinations = new Set<string>(ACCESS_INTENT_DESTINATIONS);

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
    "/games": "Games",
    "/map-prep": "MAP Prep",
    "/homework": "Homework",
    "/quizzes": "Quizzes",
    "/subscription": "Subscription",
    "/account": "My Account"
  }[destination];
}
