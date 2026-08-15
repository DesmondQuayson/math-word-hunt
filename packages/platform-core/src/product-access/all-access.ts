import {
  decideGameAccess,
  type ConsumerAccountStatus,
  type GameAccessDecision,
  type GameEntitlementEvidence
} from "../game-access/entitlement";

export const MATHNEXA_ALL_ACCESS = "MATHNEXA_ALL_ACCESS" as const;
export const MATHNEXA_PRODUCT_MODULES = ["games", "map_prep", "homework", "quizzes"] as const;

export type MathNexaProductModule = (typeof MATHNEXA_PRODUCT_MODULES)[number];
export type MathNexaAllAccessEvidence = Readonly<{
  capabilityKey: typeof MATHNEXA_ALL_ACCESS;
  entitlement: GameEntitlementEvidence;
}>;
export type MathNexaAccessDecision = GameAccessDecision & Readonly<{
  capabilityKey: typeof MATHNEXA_ALL_ACCESS | null;
  modules: readonly MathNexaProductModule[];
}>;

type DecisionInput = Readonly<{
  authenticated: boolean;
  accountStatus: ConsumerAccountStatus;
  emailConfirmed: boolean;
  evidence: unknown;
  serverNow?: Date;
}>;

function allAccessEvidence(value: unknown): value is MathNexaAllAccessEvidence {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return Object.keys(item).sort().join("|") === "capabilityKey|entitlement" &&
    item.capabilityKey === MATHNEXA_ALL_ACCESS;
}

export function decideMathNexaAccess(input: DecisionInput): MathNexaAccessDecision {
  const validCapability = allAccessEvidence(input.evidence);
  const access = decideGameAccess({
    authenticated: input.authenticated,
    accountStatus: input.accountStatus,
    emailConfirmed: input.emailConfirmed,
    evidence: validCapability ? input.evidence.entitlement : {},
    ...(input.serverNow ? { serverNow: input.serverNow } : {})
  });
  return Object.freeze({
    ...access,
    capabilityKey: validCapability ? MATHNEXA_ALL_ACCESS : null,
    modules: access.allowed && validCapability ? Object.freeze([...MATHNEXA_PRODUCT_MODULES]) : Object.freeze([])
  });
}

export function hasMathNexaModuleAccess(
  decision: MathNexaAccessDecision,
  module: MathNexaProductModule
): boolean {
  return decision.allowed && decision.capabilityKey === MATHNEXA_ALL_ACCESS && decision.modules.includes(module);
}
