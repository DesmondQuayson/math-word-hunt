export const AUTH_EMAIL_DELIVERY_STATES = [
  "disabled",
  "local-capture",
  "transactional-configured",
  "transactional-verified"
] as const;

export type AuthEmailDeliveryState = (typeof AUTH_EMAIL_DELIVERY_STATES)[number];

export function parseAuthEmailDeliveryState(value: unknown): AuthEmailDeliveryState | null {
  return typeof value === "string" && AUTH_EMAIL_DELIVERY_STATES.includes(value as AuthEmailDeliveryState)
    ? value as AuthEmailDeliveryState
    : null;
}

export function isTransactionalAuthEmailVerified(value: unknown): boolean {
  return parseAuthEmailDeliveryState(value) === "transactional-verified";
}
