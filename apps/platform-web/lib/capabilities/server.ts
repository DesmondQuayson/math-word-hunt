import "server-only";

import {
  CAPABILITY_KEYS,
  decideCapability,
  type CapabilityDecision,
  type CapabilityEntitlementState,
  type CapabilityKey
} from "@math-vocabulary-hunt/platform-core";

import { resolveTeacherContext, type TeacherContext } from "@/lib/auth/teacher-context";
import { tryGetBillingConfiguration } from "@/lib/billing/config";
import { createServerRepositories } from "@/lib/repositories/server-repositories";
import type { CapabilityUsageSnapshot } from "@/lib/repositories/capability.repository";

export type CapabilityAccessView = Readonly<{
  context: TeacherContext;
  usage: CapabilityUsageSnapshot | null;
  decisions: Readonly<Record<CapabilityKey, CapabilityDecision>>;
  source: "public" | "server-authoritative" | "default-deny";
}>;

function actor(context: TeacherContext) {
  if (!context.userId) return { signedIn: false, userId: null, accountStatus: "active" } as const;
  const accountStatus = context.status === "suspended" || context.status === "deletion-requested" ? context.status : "active";
  return { signedIn: true, userId: context.userId, accountStatus } as const;
}

function entitlement(usage: CapabilityUsageSnapshot | null, context: TeacherContext): CapabilityEntitlementState | Record<string, never> {
  if (!context.userId) return { state: "free", planKey: "free" };
  if (!usage) return {};
  if (usage.planKey === "free") return { state: "free", planKey: "free" };
  if (!usage.planExpiresAt) return {};
  return { state: "verified", planKey: usage.planKey, expiresAt: usage.planExpiresAt };
}

export async function getCapabilityAccessView(): Promise<CapabilityAccessView> {
  const [context, repositories] = await Promise.all([resolveTeacherContext(), createServerRepositories()]);
  const usage = context.userId && repositories ? await repositories.capabilities.getUsage() : null;
  const billing = tryGetBillingConfiguration();
  const environment = {
    sandbox: billing?.enabled === true && billing.stripeMode === "test" && billing.applicationEnvironment !== "production",
    capabilityEnabled: true,
    emergencyProDeny: billing?.enabled === true ? billing.emergencyDefaultDeny : false
  } as const;
  const decisions = Object.fromEntries(CAPABILITY_KEYS.map((capabilityKey) => {
    const current = capabilityKey === "class.create" ? usage?.activeClassCount ?? 0 : capabilityKey === "activity.create" ? usage?.activeActivityCount ?? 0 : 0;
    return [capabilityKey, decideCapability({ capabilityKey, actor: actor(context), entitlement: entitlement(usage, context), usage: { current }, environment })];
  })) as Record<CapabilityKey, CapabilityDecision>;
  return Object.freeze({
    context,
    usage,
    decisions: Object.freeze(decisions),
    source: !context.userId ? "public" : usage ? "server-authoritative" : "default-deny"
  });
}

export async function authorizeOwnedCapability(capabilityKey: CapabilityKey, ownerUserId?: string): Promise<Readonly<{ decision: CapabilityDecision; view: CapabilityAccessView }>> {
  const view = await getCapabilityAccessView();
  if (ownerUserId === undefined) return { decision: view.decisions[capabilityKey], view };
  const billing = tryGetBillingConfiguration();
  const current = capabilityKey === "class.create" ? view.usage?.activeClassCount ?? 0 : capabilityKey === "activity.create" ? view.usage?.activeActivityCount ?? 0 : 0;
  const decision = decideCapability({
    capabilityKey,
    actor: actor(view.context),
    entitlement: entitlement(view.usage, view.context),
    resource: { ownerUserId, archived: false },
    usage: { current },
    environment: {
      sandbox: billing?.enabled === true && billing.stripeMode === "test" && billing.applicationEnvironment !== "production",
      capabilityEnabled: true,
      emergencyProDeny: billing?.enabled === true ? billing.emergencyDefaultDeny : false
    }
  });
  return { decision, view };
}
