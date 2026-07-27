import { isBillingPlanKey, type BillingPlanKey } from "../billing/plan-keys";
import { CAPABILITIES_BY_KEY } from "./registry";
import { isCapabilityKey, type CapabilityKey } from "./keys";

export const CAPABILITY_DECISION_REASONS = [
  "allowed", "denied_signed_out", "denied_suspended", "denied_deletion_requested",
  "denied_no_entitlement", "denied_limit_reached", "denied_wrong_owner", "denied_unavailable",
  "denied_manual_review", "denied_environment", "denied_malformed_state"
] as const;
export type CapabilityDecisionReason = (typeof CAPABILITY_DECISION_REASONS)[number];

export type CapabilityEntitlementState =
  | Readonly<{ state: "free"; planKey: "free" }>
  | Readonly<{ state: "verified"; planKey: Exclude<BillingPlanKey, "free">; expiresAt: string }>
  | Readonly<{ state: "expired"; planKey: Exclude<BillingPlanKey, "free">; expiredAt: string }>
  | Readonly<{ state: "manual-review"; planKey: BillingPlanKey | null }>;

export type CapabilityDecisionInput = Readonly<{
  capabilityKey: unknown;
  actor: unknown;
  entitlement: unknown;
  resource?: unknown;
  usage?: unknown;
  environment?: unknown;
  now?: Date;
}>;

export type CapabilityDecision = Readonly<{
  allowed: boolean;
  reason: CapabilityDecisionReason;
  internalReason: string;
  copyKey: CapabilityDecisionReason;
  upgradeEligible: boolean;
  effectivePlanKey: BillingPlanKey | null;
  limit: Readonly<{ unit: "active-classes" | "active-activity-drafts"; current: number; maximum: number; remaining: number }> | null;
}>;

type Actor = Readonly<{ signedIn: boolean; userId: string | null; accountStatus: "active" | "suspended" | "deletion-requested" }>;
type Resource = Readonly<{ ownerUserId: string | null; archived: boolean }>;
type Usage = Readonly<{ current: number }>;
type Environment = Readonly<{ sandbox: boolean; capabilityEnabled: boolean; emergencyProDeny: boolean }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const a = Object.keys(value).sort();
  const b = [...keys].sort();
  return a.length === b.length && a.every((key, index) => key === b[index]);
}

function actor(value: unknown): Actor | null {
  if (!isRecord(value) || !exact(value, ["signedIn", "userId", "accountStatus"]) || typeof value.signedIn !== "boolean") return null;
  if (value.userId !== null && (typeof value.userId !== "string" || !value.userId)) return null;
  if (value.accountStatus !== "active" && value.accountStatus !== "suspended" && value.accountStatus !== "deletion-requested") return null;
  if (value.signedIn !== (value.userId !== null)) return null;
  return value as unknown as Actor;
}

function entitlement(value: unknown, now: Date): CapabilityEntitlementState | null {
  if (!isRecord(value) || typeof value.state !== "string") return null;
  if (value.state === "free" && exact(value, ["state", "planKey"]) && value.planKey === "free") return value as unknown as CapabilityEntitlementState;
  if (value.state === "manual-review" && exact(value, ["state", "planKey"]) && (value.planKey === null || isBillingPlanKey(value.planKey))) return value as unknown as CapabilityEntitlementState;
  if ((value.state === "verified" || value.state === "expired") && isBillingPlanKey(value.planKey) && value.planKey !== "free") {
    const dateKey = value.state === "verified" ? "expiresAt" : "expiredAt";
    if (!exact(value, ["state", "planKey", dateKey]) || typeof value[dateKey] !== "string" || !Number.isFinite(Date.parse(value[dateKey]))) return null;
    if (value.state === "verified" && Date.parse(value.expiresAt as string) <= now.getTime()) return null;
    return value as unknown as CapabilityEntitlementState;
  }
  return null;
}

function resource(value: unknown): Resource | null {
  if (value === undefined) return { ownerUserId: null, archived: false };
  if (!isRecord(value) || !exact(value, ["ownerUserId", "archived"]) || typeof value.archived !== "boolean" ||
      (value.ownerUserId !== null && (typeof value.ownerUserId !== "string" || !value.ownerUserId))) return null;
  return value as unknown as Resource;
}

function usage(value: unknown): Usage | null {
  if (value === undefined) return { current: 0 };
  if (!isRecord(value) || !exact(value, ["current"]) || !Number.isSafeInteger(value.current) || Number(value.current) < 0) return null;
  return { current: Number(value.current) };
}

function environment(value: unknown): Environment | null {
  if (!isRecord(value) || !exact(value, ["sandbox", "capabilityEnabled", "emergencyProDeny"]) ||
      typeof value.sandbox !== "boolean" || typeof value.capabilityEnabled !== "boolean" || typeof value.emergencyProDeny !== "boolean") return null;
  return value as unknown as Environment;
}

function denied(reason: Exclude<CapabilityDecisionReason, "allowed">, internalReason: string, upgradeEligible = false, planKey: BillingPlanKey | null = null, limit: CapabilityDecision["limit"] = null): CapabilityDecision {
  return Object.freeze({ allowed: false, reason, internalReason, copyKey: reason, upgradeEligible, effectivePlanKey: planKey, limit });
}

export function decideCapability(input: CapabilityDecisionInput): CapabilityDecision {
  const now = input.now ?? new Date();
  if (!isCapabilityKey(input.capabilityKey)) return denied("denied_malformed_state", "unknown-capability");
  const definition = CAPABILITIES_BY_KEY[input.capabilityKey];
  const parsedActor = actor(input.actor);
  const parsedEntitlement = entitlement(input.entitlement, now);
  const parsedResource = resource(input.resource);
  const parsedUsage = usage(input.usage);
  const parsedEnvironment = environment(input.environment);
  if (!parsedActor || !parsedEntitlement || !parsedResource || !parsedUsage || !parsedEnvironment) return denied("denied_malformed_state", "malformed-input");

  if (parsedResource.ownerUserId !== null && parsedResource.ownerUserId !== parsedActor.userId) return denied("denied_wrong_owner", "resource-owner-mismatch");
  if (parsedActor.signedIn && parsedActor.accountStatus === "suspended") return denied("denied_suspended", "account-suspended");
  if (parsedActor.signedIn && parsedActor.accountStatus === "deletion-requested") return denied("denied_deletion_requested", "deletion-request-pending");
  if (definition.availability === "unavailable") return denied("denied_unavailable", "product-capability-unavailable");
  if (!parsedEnvironment.capabilityEnabled || (definition.availability === "sandbox-only" && !parsedEnvironment.sandbox)) return denied("denied_environment", "environment-disabled");
  if (parsedEntitlement.state === "manual-review") return denied("denied_manual_review", "entitlement-manual-review");
  if (!parsedActor.signedIn && definition.category !== "public") return denied("denied_signed_out", "authentication-required");

  const effectivePlanKey: BillingPlanKey = parsedEntitlement.state === "verified" && !parsedEnvironment.emergencyProDeny
    ? parsedEntitlement.planKey
    : "free";
  const allowance = effectivePlanKey === "free" ? definition.free : definition.pro;
  if (allowance !== "included") return denied("denied_no_entitlement", "capability-not-in-plan", definition.upgradeEligible, effectivePlanKey);

  let limit: CapabilityDecision["limit"] = null;
  if (definition.usageLimit) {
    const maximum = effectivePlanKey === "free" ? definition.usageLimit.free : definition.usageLimit.pro;
    limit = Object.freeze({ unit: definition.usageLimit.unit, current: parsedUsage.current, maximum, remaining: Math.max(0, maximum - parsedUsage.current) });
    if (parsedUsage.current >= maximum) return denied("denied_limit_reached", "active-resource-limit-reached", definition.upgradeEligible && effectivePlanKey === "free", effectivePlanKey, limit);
  }

  return Object.freeze({ allowed: true, reason: "allowed", internalReason: parsedResource.archived ? "allowed-existing-archived-resource" : "allowed", copyKey: "allowed", upgradeEligible: false, effectivePlanKey, limit });
}
