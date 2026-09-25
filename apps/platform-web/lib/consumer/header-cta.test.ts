import { decideGameAccess, markVerificationUnavailable } from "@math-vocabulary-hunt/platform-core";
import { describe, expect, it } from "vitest";

import { resolveHeaderCta } from "./header-cta";

const now = new Date("2026-09-24T12:00:00.000Z");
const hour = 60 * 60 * 1000;
const iso = (offset: number) => new Date(now.getTime() + offset).toISOString();

// Every decision below comes from the real entitlement rules; nothing is
// hand-built, so the header can only reflect what the server would decide.
function signedIn(evidence: unknown, overrides: Partial<Parameters<typeof decideGameAccess>[0]> = {}) {
  return {
    context: { status: "active" as const },
    source: "server-authoritative" as const,
    decision: decideGameAccess({ authenticated: true, accountStatus: "active", emailConfirmed: true, evidence, serverNow: now, ...overrides })
  };
}

const entitledEvidence = [
  { state: "subscription-active", periodEndsAt: iso(20 * 24 * hour) },
  { state: "trial-active", trialRedeemedAt: iso(-hour), startsAt: iso(-hour), endsAt: iso(23 * hour) },
  { state: "subscription-grace-period", periodEndsAt: iso(-hour), graceEndsAt: iso(6 * 24 * hour) },
  { state: "subscription-canceled-through-period-end", periodEndsAt: iso(5 * 24 * hour) }
];

describe("resolveHeaderCta", () => {
  it("offers the free trial to an anonymous visitor, starting at account creation", () => {
    const view = {
      context: { status: "anonymous" as const },
      source: "default-deny" as const,
      decision: decideGameAccess({ authenticated: false, accountStatus: "active", emailConfirmed: false, evidence: {}, serverNow: now })
    };
    expect(resolveHeaderCta(view)).toEqual({ kind: "start-trial", label: "Start free trial", href: "/sign-up?next=/subscription" });
  });

  it("offers the free trial to a signed-in account that has never redeemed it", () => {
    expect(resolveHeaderCta(signedIn({ state: "no-entitlement", trialRedeemedAt: null }))).toEqual({
      kind: "start-trial",
      label: "Start free trial",
      href: "/subscription"
    });
  });

  it("offers the trial to an unconfirmed account through the subscription page (which asks for confirmation first)", () => {
    const view = {
      context: { status: "unconfirmed" as const },
      source: "default-deny" as const,
      decision: decideGameAccess({ authenticated: true, accountStatus: "active", emailConfirmed: false, evidence: {}, serverNow: now })
    };
    expect(resolveHeaderCta(view)?.kind).toBe("start-trial");
    expect(resolveHeaderCta(view)?.href).toBe("/subscription");
  });

  it("shows no call to action at all for an account that already has access (subscription, trial, grace, scheduled cancellation)", () => {
    for (const evidence of entitledEvidence) expect(resolveHeaderCta(signedIn(evidence))).toBeNull();
  });

  it("shows no call to action for school-code sessions, and never a trial", () => {
    const view = {
      context: { status: "anonymous" as const },
      source: "school-access" as const,
      decision: decideGameAccess({ authenticated: true, accountStatus: "active", emailConfirmed: true, evidence: { state: "subscription-active", periodEndsAt: iso(hour) }, serverNow: now })
    };
    expect(resolveHeaderCta(view)).toBeNull();
  });

  it("never produces a 'Start learning' action for any state", () => {
    const views = [
      ...entitledEvidence.map((evidence) => signedIn(evidence)),
      signedIn({ state: "no-entitlement", trialRedeemedAt: null }),
      signedIn({ state: "trial-expired", trialRedeemedAt: iso(-48 * hour), endedAt: iso(-24 * hour) }),
      signedIn({ state: "subscription-past-due", periodEndsAt: null }),
      signedIn({ state: "trial-pending", trialRedeemedAt: iso(-60_000) })
    ];
    for (const view of views) expect(resolveHeaderCta(view)?.label).not.toBe("Start learning");
  });

  it("never offers a second trial once the trial was redeemed (expired trial, ended or canceled subscription)", () => {
    for (const evidence of [
      { state: "trial-expired", trialRedeemedAt: iso(-48 * hour), endedAt: iso(-24 * hour) },
      { state: "trial-active", trialRedeemedAt: iso(-30 * hour), startsAt: iso(-30 * hour), endsAt: iso(-6 * hour) },
      { state: "subscription-expired", endedAt: iso(-hour) },
      { state: "subscription-active", periodEndsAt: iso(-hour) },
      { state: "no-entitlement", trialRedeemedAt: iso(-72 * hour) }
    ]) {
      const cta = resolveHeaderCta(signedIn(evidence));
      expect(cta).toEqual({ kind: "subscribe", label: "Subscribe", href: "/pricing" });
    }
  });

  it("sends payment problems and unverifiable renewals to manage, not to a new subscription", () => {
    expect(resolveHeaderCta(signedIn({ state: "subscription-past-due", periodEndsAt: null }))).toEqual({ kind: "manage", label: "Manage subscription", href: "/subscription" });
    const unverified = signedIn({ state: "subscription-active", periodEndsAt: iso(-hour) });
    expect(resolveHeaderCta({ ...unverified, decision: markVerificationUnavailable(unverified.decision) })?.kind).toBe("manage");
  });

  it("shows trial status while the trial activation is pending", () => {
    expect(resolveHeaderCta(signedIn({ state: "trial-pending", trialRedeemedAt: iso(-60_000) }))).toEqual({
      kind: "trial-status",
      label: "Trial status",
      href: "/subscription"
    });
  });

  it("shows no commercial action for suspended, deletion-pending or unverifiable accounts", () => {
    for (const [status, accountStatus] of [["suspended", "suspended"], ["deletion-pending", "deletion-pending"]] as const) {
      const view = {
        context: { status },
        source: "server-authoritative" as const,
        decision: decideGameAccess({ authenticated: true, accountStatus, emailConfirmed: true, evidence: {}, serverNow: now })
      };
      expect(resolveHeaderCta(view)).toBeNull();
    }
    expect(resolveHeaderCta(signedIn({ state: "not-a-state" }))).toBeNull();
  });
});
