import "server-only";

import { cache } from "react";

import {
  MATHNEXA_ALL_ACCESS,
  decideMathNexaAccess,
  markVerificationUnavailable,
  type MathNexaAccessDecision
} from "@math-vocabulary-hunt/platform-core";

import { withTimeout } from "@/lib/async/with-timeout";
import { resolveConsumerContext, type ConsumerAccountRecord, type ConsumerContext } from "@/lib/auth/consumer-context";
import { tryGetConsumerBillingConfiguration } from "@/lib/billing/consumer-config";
import { createConsumerBillingProvider } from "@/lib/billing/consumer-provider-factory";
import { reconcileConsumerBilling } from "@/lib/billing/consumer-reconciliation";
import { createConsumerBillingRepository } from "@/lib/billing/consumer-service";
import { classifyEntitlementVerification } from "@/lib/game-access/self-heal";
import { SupabaseConsumerEntitlementRepository } from "@/lib/repositories/consumer-entitlement.repository";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveSchoolAccessSession } from "@/lib/school-access/session";

/**
 * Upper bound on an on-request provider verification. The page must never hang
 * on Stripe; when the bound passes the stored decision is used and, for a
 * clock-expired record, the customer is told verification is pending.
 */
const ACCESS_VERIFICATION_TIMEOUT_MS = 6_000;

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

// Deduped per request: the header, the homepage, and product pages all ask
// the same question during one render; without cache() each ran its own
// Supabase round trips. Explicit serverNow values bypass the shared entry.
export const getGameAccessView = cache(
  (serverNow?: Date): Promise<GameAccessView> => computeGameAccessView(serverNow ?? new Date())
);

async function computeGameAccessView(serverNow = new Date()): Promise<GameAccessView> {
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
  // Uncached: after a provider verification repairs the row, the re-read below
  // must see the repaired entitlement, not a memoized copy of the stale one.
  const supabase = await createServerSupabaseClient({ uncached: true });
  const account = context.account;
  const repository = supabase ? new SupabaseConsumerEntitlementRepository(supabase) : null;
  const decide = (evidence: unknown): MathNexaAccessDecision => decideMathNexaAccess({
    authenticated: true,
    accountStatus: account.accountStatus,
    emailConfirmed: account.emailConfirmedAt !== null,
    evidence,
    serverNow
  });
  let evidence: unknown = repository ? await repository.getEvidence(account) : {};
  let decision = decide(evidence);

  // Self-healing access check. A denial that exists only because the server
  // clock passed a locally stored boundary is exactly what a lost renewal event
  // looks like, so the provider is consulted before the customer is told
  // anything ended. Bounded: one provider round trip per customer per interval,
  // time-boxed, and never on an allowed decision.
  const verification = repository ? classifyEntitlementVerification({ evidence, decision, nowMs: serverNow.getTime() }) : null;
  if (verification && account.accountStatus === "active" && account.emailConfirmedAt !== null) {
    const repaired = await verifyEntitlementWithProvider(account);
    if (repaired && repository) {
      evidence = await repository.getEvidence(account);
      decision = decide(evidence);
    }
    if (classifyEntitlementVerification({ evidence, decision, nowMs: serverNow.getTime() }) === "clock-expired") {
      // Still expired-by-clock after asking the provider (or unable to ask):
      // deny, but honestly. "Subscription ended" is reserved for a provider-
      // confirmed end.
      decision = Object.freeze({
        ...markVerificationUnavailable(decision),
        capabilityKey: decision.capabilityKey,
        modules: Object.freeze([])
      });
    }
  }
  return {
    context,
    decision,
    source: supabase ? "server-authoritative" : "default-deny",
    principal: { kind: "consumer", id: context.userId }
  };
}

/**
 * Re-reads the account's subscriptions from the billing provider through the
 * canonical synchronizer. Returns true when a local row changed, meaning the
 * stored evidence must be read again. Failures never throw into the page.
 */
async function verifyEntitlementWithProvider(account: ConsumerAccountRecord): Promise<boolean> {
  const config = tryGetConsumerBillingConfiguration();
  if (!config) return false;
  const repository = createConsumerBillingRepository(config);
  if (!repository) return false;
  try {
    const outcome = await withTimeout(reconcileConsumerBilling({
      ownerUserId: account.userId,
      config,
      provider: createConsumerBillingProvider(config),
      repository,
      source: "reconciliation",
      correlationId: `access-${account.userId.slice(0, 8)}`
    }), ACCESS_VERIFICATION_TIMEOUT_MS, null);
    return outcome?.outcome === "synchronized" && outcome.changed;
  } catch {
    return false;
  }
}
