import "server-only";

import {
  MATHNEXA_ALL_ACCESS,
  decideMathNexaAccess,
  type MathNexaAccessDecision
} from "@math-vocabulary-hunt/platform-core";

import { resolveConsumerContext, type ConsumerContext } from "@/lib/auth/consumer-context";
import { SupabaseConsumerEntitlementRepository } from "@/lib/repositories/consumer-entitlement.repository";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveSchoolAccessSession } from "@/lib/school-access/session";

export type AccessPrincipal = Readonly<{
  kind: "consumer" | "school-access";
  id: string;
}>;

export type GameAccessView = Readonly<{
  context: ConsumerContext;
  decision: MathNexaAccessDecision;
  source: "server-authoritative" | "school-access" | "default-deny";
  principal: AccessPrincipal | null;
}>;

export async function getGameAccessView(serverNow = new Date()): Promise<GameAccessView> {
  const context = await resolveConsumerContext();
  if (context.status === "unconfigured" || context.status === "anonymous") {
    const schoolSession = await resolveSchoolAccessSession(serverNow);
    if (schoolSession) {
      return {
        context,
        decision: decideMathNexaAccess({
          authenticated: true,
          accountStatus: "active",
          emailConfirmed: true,
          evidence: {
            capabilityKey: MATHNEXA_ALL_ACCESS,
            entitlement: {
              state: "subscription-active",
              periodEndsAt: new Date(schoolSession.expiresAt * 1000).toISOString()
            }
          },
          serverNow
        }),
        source: "school-access",
        principal: { kind: "school-access", id: schoolSession.id }
      };
    }
    return {
      context,
      decision: decideMathNexaAccess({
        authenticated: false,
        accountStatus: "active",
        emailConfirmed: false,
        evidence: {},
        serverNow
      }),
      source: "default-deny",
      principal: null
    };
  }
  if (context.status === "unconfirmed" || context.status === "missing-account" || !context.account) {
    return {
      context,
      decision: decideMathNexaAccess({
        authenticated: true,
        accountStatus: "active",
        emailConfirmed: context.status !== "unconfirmed",
        evidence: {},
        serverNow
      }),
      source: "default-deny",
      principal: context.userId ? { kind: "consumer", id: context.userId } : null
    };
  }
  const supabase = await createServerSupabaseClient();
  const evidence = supabase ? await new SupabaseConsumerEntitlementRepository(supabase).getEvidence(context.account) : {};
  return {
    context,
    decision: decideMathNexaAccess({
      authenticated: true,
      accountStatus: context.account.accountStatus,
      emailConfirmed: context.account.emailConfirmedAt !== null,
      evidence,
      serverNow
    }),
    source: supabase ? "server-authoritative" : "default-deny",
    principal: { kind: "consumer", id: context.userId }
  };
}
