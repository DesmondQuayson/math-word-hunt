export const PRODUCT_DESTINATIONS = [
  "/games",
  "/map-prep",
  "/homework",
  "/quizzes"
] as const;

export const ACCESS_INTENT_DESTINATIONS = [
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
  fallback: AccessIntentDestination = "/account"
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
    "/games": "Games",
    "/map-prep": "MAP Prep",
    "/homework": "Homework",
    "/quizzes": "Quizzes",
    "/subscription": "Subscription",
    "/account": "My Account"
  }[destination];
}
