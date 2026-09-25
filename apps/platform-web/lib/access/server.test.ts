// @vitest-environment node
import { decideMathNexaAccess, MATHNEXA_ALL_ACCESS } from "@math-vocabulary-hunt/platform-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getGameAccessView: vi.fn(),
  redirect: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  })
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/game-access/server", () => ({ getGameAccessView: mocks.getGameAccessView }));

import { requireProductAccess } from "./server";

const now = new Date("2026-09-25T12:00:00.000Z");
const later = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString();
const earlier = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
// A valid trial window is exactly 24 hours from its start (entitlement.ts).
const trialEnd = new Date(Date.parse(earlier) + 24 * 60 * 60 * 1000).toISOString();

function view(status: string, entitlement: unknown, options: { authenticated?: boolean; emailConfirmed?: boolean; source?: string; capability?: boolean } = {}) {
  const authenticated = options.authenticated ?? true;
  return {
    context: { status },
    source: options.source ?? (authenticated ? "server-authoritative" : "default-deny"),
    principal: null,
    decision: decideMathNexaAccess({
      authenticated,
      accountStatus: "active",
      emailConfirmed: options.emailConfirmed ?? authenticated,
      evidence: options.capability === false ? entitlement : { capabilityKey: MATHNEXA_ALL_ACCESS, entitlement },
      serverNow: now
    })
  };
}

async function outcome(v: unknown) {
  mocks.getGameAccessView.mockResolvedValue(v);
  try {
    await requireProductAccess("/worksheets");
    return "allowed";
  } catch (error) {
    return (error as Error).message;
  }
}

describe("requireProductAccess for the Worksheet Generator entry (/worksheets)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends an anonymous visitor into the access flow with the generator remembered", async () => {
    expect(await outcome(view("anonymous", {}, { authenticated: false }))).toBe("NEXT_REDIRECT:/access?next=/worksheets");
    expect(await outcome(view("unconfigured", {}, { authenticated: false }))).toBe("NEXT_REDIRECT:/access?next=/worksheets");
  });

  it("sends an unconfirmed account to email confirmation first", async () => {
    expect(await outcome(view("unconfirmed", {}, { emailConfirmed: false }))).toBe("NEXT_REDIRECT:/confirmation-required?next=/worksheets");
  });

  it("sends a signed-in account without access to the existing subscription flow: trial-eligible and used-trial alike", async () => {
    expect(await outcome(view("active", { state: "no-entitlement", trialRedeemedAt: null }))).toBe("NEXT_REDIRECT:/subscription?next=/worksheets");
    expect(await outcome(view("active", { state: "trial-expired", trialRedeemedAt: earlier, endedAt: earlier }))).toBe("NEXT_REDIRECT:/subscription?next=/worksheets");
    expect(await outcome(view("active", { state: "subscription-past-due", periodEndsAt: null }))).toBe("NEXT_REDIRECT:/subscription?next=/worksheets");
  });

  it("never trusts evidence that lacks the MathNexa capability, whatever the client claims", async () => {
    expect(await outcome(view("active", { state: "subscription-active", periodEndsAt: later }, { capability: false }))).toBe("NEXT_REDIRECT:/subscription?next=/worksheets");
  });

  it("lets a server-verified entitlement through without interruption: active trial, paid subscription, grace, scheduled cancellation, school code", async () => {
    for (const [label, v] of [
      ["active trial", view("active", { state: "trial-active", trialRedeemedAt: earlier, startsAt: earlier, endsAt: trialEnd })],
      ["paid subscription", view("active", { state: "subscription-active", periodEndsAt: later })],
      ["renewal grace", view("active", { state: "subscription-grace-period", periodEndsAt: earlier, graceEndsAt: later })],
      ["scheduled cancellation", view("active", { state: "subscription-canceled-through-period-end", periodEndsAt: later })],
      ["school code", view("anonymous", { state: "subscription-active", periodEndsAt: later }, { source: "school-access" })]
    ] as const) {
      expect(await outcome(v), label).toBe("allowed");
    }
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
