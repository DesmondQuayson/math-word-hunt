export const GAME_ENTITLEMENT_STATES = [
  "no-entitlement",
  "trial-pending",
  "trial-active",
  "trial-expired",
  "subscription-active",
  "subscription-past-due",
  "subscription-canceled-through-period-end",
  "subscription-expired",
  "account-suspended",
  "account-deletion-pending"
] as const;

export type GameEntitlementState = (typeof GAME_ENTITLEMENT_STATES)[number];
export type ConsumerAccountStatus = "active" | "suspended" | "deletion-pending";
export type GameAccessNextAction =
  | "sign-in"
  | "confirm-email"
  | "start-checkout"
  | "wait-for-activation"
  | "launch-game"
  | "manage-subscription"
  | "contact-support"
  | "review-deletion";

export type GameEntitlementEvidence =
  | Readonly<{ state: "no-entitlement"; trialRedeemedAt: string | null }>
  | Readonly<{ state: "trial-pending"; trialRedeemedAt: string }>
  | Readonly<{ state: "trial-active"; trialRedeemedAt: string; startsAt: string; endsAt: string }>
  | Readonly<{ state: "trial-expired"; trialRedeemedAt: string; endedAt: string }>
  | Readonly<{ state: "subscription-active"; periodEndsAt: string }>
  | Readonly<{ state: "subscription-past-due"; periodEndsAt: string | null }>
  | Readonly<{ state: "subscription-canceled-through-period-end"; periodEndsAt: string }>
  | Readonly<{ state: "subscription-expired"; endedAt: string }>;

export type GameAccessDecision = Readonly<{
  allowed: boolean;
  state: GameEntitlementState;
  reason:
    | "email-confirmation-required"
    | "authentication-required"
    | "checkout-required"
    | "trial-activation-pending"
    | "trial-access-active"
    | "trial-ended"
    | "subscription-access-active"
    | "payment-past-due"
    | "canceled-access-active"
    | "subscription-ended"
    | "account-suspended"
    | "account-deletion-pending"
    | "malformed-entitlement";
  nextAction: GameAccessNextAction;
  accessEndsAt: string | null;
}>;

type DecisionInput = Readonly<{
  authenticated: boolean;
  accountStatus: ConsumerAccountStatus;
  emailConfirmed: boolean;
  evidence: unknown;
  serverNow?: Date;
}>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function timestamp(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value)) ? value : null;
}

export function parseGameEntitlementEvidence(value: unknown): GameEntitlementEvidence | null {
  if (!record(value) || typeof value.state !== "string") return null;
  if (value.state === "no-entitlement" && exact(value, ["state", "trialRedeemedAt"])) {
    if (value.trialRedeemedAt === null) return Object.freeze({ state: value.state, trialRedeemedAt: null });
    const redeemed = timestamp(value.trialRedeemedAt);
    return redeemed ? Object.freeze({ state: value.state, trialRedeemedAt: redeemed }) : null;
  }
  if (value.state === "trial-pending" && exact(value, ["state", "trialRedeemedAt"])) {
    const redeemed = timestamp(value.trialRedeemedAt);
    return redeemed ? Object.freeze({ state: value.state, trialRedeemedAt: redeemed }) : null;
  }
  if (value.state === "trial-active" && exact(value, ["state", "trialRedeemedAt", "startsAt", "endsAt"])) {
    const redeemed = timestamp(value.trialRedeemedAt);
    const startsAt = timestamp(value.startsAt);
    const endsAt = timestamp(value.endsAt);
    if (!redeemed || !startsAt || !endsAt || Date.parse(endsAt) - Date.parse(startsAt) !== 24 * 60 * 60 * 1000 || Date.parse(redeemed) > Date.parse(startsAt)) return null;
    return Object.freeze({ state: value.state, trialRedeemedAt: redeemed, startsAt, endsAt });
  }
  if (value.state === "trial-expired" && exact(value, ["state", "trialRedeemedAt", "endedAt"])) {
    const redeemed = timestamp(value.trialRedeemedAt);
    const endedAt = timestamp(value.endedAt);
    return redeemed && endedAt ? Object.freeze({ state: value.state, trialRedeemedAt: redeemed, endedAt }) : null;
  }
  if (value.state === "subscription-active" && exact(value, ["state", "periodEndsAt"])) {
    const periodEndsAt = timestamp(value.periodEndsAt);
    return periodEndsAt ? Object.freeze({ state: value.state, periodEndsAt }) : null;
  }
  if (value.state === "subscription-past-due" && exact(value, ["state", "periodEndsAt"])) {
    if (value.periodEndsAt === null) return Object.freeze({ state: value.state, periodEndsAt: null });
    const periodEndsAt = timestamp(value.periodEndsAt);
    return periodEndsAt ? Object.freeze({ state: value.state, periodEndsAt }) : null;
  }
  if (value.state === "subscription-canceled-through-period-end" && exact(value, ["state", "periodEndsAt"])) {
    const periodEndsAt = timestamp(value.periodEndsAt);
    return periodEndsAt ? Object.freeze({ state: value.state, periodEndsAt }) : null;
  }
  if (value.state === "subscription-expired" && exact(value, ["state", "endedAt"])) {
    const endedAt = timestamp(value.endedAt);
    return endedAt ? Object.freeze({ state: value.state, endedAt }) : null;
  }
  return null;
}

function decision(
  allowed: boolean,
  state: GameEntitlementState,
  reason: GameAccessDecision["reason"],
  nextAction: GameAccessNextAction,
  accessEndsAt: string | null = null
): GameAccessDecision {
  return Object.freeze({ allowed, state, reason, nextAction, accessEndsAt });
}

export function decideGameAccess(input: DecisionInput): GameAccessDecision {
  const now = input.serverNow ?? new Date();
  if (!Number.isFinite(now.getTime())) return decision(false, "no-entitlement", "malformed-entitlement", "contact-support");
  if (!input.authenticated) return decision(false, "no-entitlement", "authentication-required", "sign-in");
  if (input.accountStatus === "suspended") return decision(false, "account-suspended", "account-suspended", "contact-support");
  if (input.accountStatus === "deletion-pending") return decision(false, "account-deletion-pending", "account-deletion-pending", "review-deletion");
  if (!input.emailConfirmed) return decision(false, "no-entitlement", "email-confirmation-required", "confirm-email");

  const evidence = parseGameEntitlementEvidence(input.evidence);
  if (!evidence) return decision(false, "no-entitlement", "malformed-entitlement", "contact-support");
  const nowMs = now.getTime();

  if (evidence.state === "no-entitlement") {
    return decision(false, evidence.state, "checkout-required", evidence.trialRedeemedAt === null ? "start-checkout" : "manage-subscription");
  }
  if (evidence.state === "trial-pending") {
    return decision(false, evidence.state, "trial-activation-pending", "wait-for-activation");
  }
  if (evidence.state === "trial-active") {
    if (nowMs < Date.parse(evidence.startsAt)) return decision(false, "trial-pending", "trial-activation-pending", "wait-for-activation");
    if (nowMs >= Date.parse(evidence.endsAt)) return decision(false, "trial-expired", "trial-ended", "manage-subscription");
    return decision(true, evidence.state, "trial-access-active", "launch-game", evidence.endsAt);
  }
  if (evidence.state === "trial-expired") {
    return decision(false, evidence.state, "trial-ended", "manage-subscription");
  }
  if (evidence.state === "subscription-active") {
    if (nowMs >= Date.parse(evidence.periodEndsAt)) return decision(false, "subscription-expired", "subscription-ended", "manage-subscription");
    return decision(true, evidence.state, "subscription-access-active", "launch-game", evidence.periodEndsAt);
  }
  if (evidence.state === "subscription-past-due") {
    return decision(false, evidence.state, "payment-past-due", "manage-subscription");
  }
  if (evidence.state === "subscription-canceled-through-period-end") {
    if (nowMs >= Date.parse(evidence.periodEndsAt)) return decision(false, "subscription-expired", "subscription-ended", "manage-subscription");
    return decision(true, evidence.state, "canceled-access-active", "launch-game", evidence.periodEndsAt);
  }
  return decision(false, evidence.state, "subscription-ended", "manage-subscription");
}

export function isTrialEligible(trialRedeemedAt: unknown): boolean {
  return trialRedeemedAt === null;
}
