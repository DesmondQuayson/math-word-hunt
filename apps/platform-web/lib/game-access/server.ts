import "server-only";

import { decideGameAccess, type GameAccessDecision } from "@math-vocabulary-hunt/platform-core";

import { resolveConsumerContext, type ConsumerContext } from "@/lib/auth/consumer-context";
import { SupabaseConsumerEntitlementRepository } from "@/lib/repositories/consumer-entitlement.repository";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type GameAccessView = Readonly<{
  context: ConsumerContext;
  decision: GameAccessDecision;
  source: "server-authoritative" | "default-deny";
}>;

export async function getGameAccessView(serverNow = new Date()): Promise<GameAccessView> {
  const context = await resolveConsumerContext();
  if (context.status === "unconfigured" || context.status === "anonymous") {
    return {
      context,
      decision: decideGameAccess({
        authenticated: false,
        accountStatus: "active",
        emailConfirmed: false,
        evidence: { state: "no-entitlement", trialRedeemedAt: null },
        serverNow
      }),
      source: "default-deny"
    };
  }
  if (context.status === "unconfirmed" || context.status === "missing-account" || !context.account) {
    return {
      context,
      decision: decideGameAccess({
        authenticated: true,
        accountStatus: "active",
        emailConfirmed: context.status !== "unconfirmed",
        evidence: {},
        serverNow
      }),
      source: "default-deny"
    };
  }
  const supabase = await createServerSupabaseClient();
  const evidence = supabase ? await new SupabaseConsumerEntitlementRepository(supabase).getEvidence(context.account) : {};
  return {
    context,
    decision: decideGameAccess({
      authenticated: true,
      accountStatus: context.account.accountStatus,
      emailConfirmed: context.account.emailConfirmedAt !== null,
      evidence,
      serverNow
    }),
    source: supabase ? "server-authoritative" : "default-deny"
  };
}
