import { MATHNEXA_ALL_ACCESS, decideMathNexaAccess } from "@math-vocabulary-hunt/platform-core";
import { cleanup, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveHeaderCta } from "@/lib/consumer/header-cta";

// The homepage hero's actions for every account state the server can report
// (2026-11-22). The real route component is driven with server access views
// built by the real access decision: nothing here reads the browser. A
// signed-out visitor sees all three entry points; a signed-in account never sees
// "Create account" or "Sign in", and sees "Start free trial" only while the
// server says its one trial is unused.

const state = vi.hoisted(() => ({ view: null as unknown }));

vi.mock("@/lib/environment/production-platform", () => ({ isProductionPlatformMode: () => true }));
vi.mock("@/lib/environment/production-public", () => ({ isProductionPublicMode: () => false }));
vi.mock("@/lib/game-access/server", () => ({ getGameAccessView: vi.fn(async () => state.view) }));
vi.mock("@/lib/games/catalog", () => ({ loadPublicGameCatalog: vi.fn(async () => ({ games: [] })) }));
vi.mock("@/lib/cms/public", () => ({ loadPublishedCmsDocument: vi.fn(async () => null) }));
vi.mock("@/components/cms/structured-cms-content", () => ({ StructuredCmsContent: () => null }));
vi.mock("@/app/auth-actions", () => ({
  checkEmailConfirmationAction: vi.fn(async (value) => value),
  resendConfirmationAction: vi.fn(async (value) => value)
}));
vi.mock("@/app/school-access-actions", () => ({
  authorizeSchoolAccessAction: vi.fn(async (value) => value),
  exitSchoolAccessAction: vi.fn()
}));

import HomePage from "@/app/page";

afterEach(() => { cleanup(); state.view = null; });

const now = new Date("2026-11-22T18:00:00.000Z");
const hour = 60 * 60 * 1000;
const iso = (offsetHours: number) => new Date(now.getTime() + offsetHours * hour).toISOString();
const userId = "00000000-0000-4000-8000-000000000001";

function signedOut(status: "anonymous" | "unconfigured") {
  return {
    context: { status, userId: null, email: null, account: null },
    decision: decideMathNexaAccess({ authenticated: false, accountStatus: "active", emailConfirmed: false, evidence: {}, serverNow: now }),
    source: "default-deny",
    principal: null
  };
}

function unconfirmed() {
  return {
    context: { status: "unconfirmed", userId, email: "person@example.test", account: null },
    decision: decideMathNexaAccess({ authenticated: true, accountStatus: "active", emailConfirmed: false, evidence: {}, serverNow: now }),
    source: "default-deny",
    principal: { kind: "consumer", id: userId }
  };
}

function signedIn(entitlement: Record<string, unknown>, trialRedeemedAt: string | null) {
  return {
    context: {
      status: "active",
      userId,
      email: "person@example.test",
      account: { userId, accountStatus: "active", emailConfirmedAt: iso(-200), trialRedeemedAt, deletionRequestedAt: null, deletionCompletedAt: null, createdAt: iso(-200), updatedAt: iso(-1) }
    },
    decision: decideMathNexaAccess({ authenticated: true, accountStatus: "active", emailConfirmed: true, evidence: { capabilityKey: MATHNEXA_ALL_ACCESS, entitlement }, serverNow: now }),
    source: "server-authoritative",
    principal: { kind: "consumer", id: userId }
  };
}

async function hero(view: unknown) {
  state.view = view;
  const { container } = render(await HomePage());
  const copy = container.querySelector<HTMLElement>(".teacher-home-copy") as HTMLElement;
  const actions = [...copy.querySelectorAll<HTMLAnchorElement>(".teacher-home-actions a")].map((link) => [link.textContent, link.getAttribute("href")]);
  return { copy, actions, ready: copy.querySelector(".teacher-home-ready")?.textContent ?? null, trialNote: copy.querySelector(".trial-offer-note") !== null };
}

function expectNoAccountEntryPoints(copy: HTMLElement, label: string) {
  expect(within(copy).queryByRole("link", { name: "Create account" }), label).toBeNull();
  expect(within(copy).queryByRole("link", { name: "Sign in" }), label).toBeNull();
}

describe("homepage hero actions by account state", () => {
  it("A. logged out: Start free trial, Create account, Sign in, in that order, on the existing routes", async () => {
    for (const status of ["anonymous", "unconfigured"] as const) {
      const result = await hero(signedOut(status));
      expect(result.actions, status).toEqual([["Start free trial", "/sign-up?next=/subscription"], ["Create account", "/sign-up?entry=account"], ["Sign in", "/sign-in"]]);
      expect(result.trialNote, status).toBe(true);
      cleanup();
    }
  });

  it("B. signed in, trial never used: Start free trial (the server says it is unused), no Create account or Sign in", async () => {
    const view = signedIn({ state: "no-entitlement", trialRedeemedAt: null }, null);
    expect(view.decision.nextAction).toBe("start-checkout");
    const result = await hero(view);
    expect(result.actions).toEqual([["Start free trial", "/subscription"], ["My Account", "/account"]]);
    expect(result.trialNote).toBe(true);
    expectNoAccountEntryPoints(result.copy, "eligible");
  });

  it("B'. signed in but email not confirmed: the trial path (it asks for confirmation first), no Create account or Sign in", async () => {
    const result = await hero(unconfirmed());
    expect(result.actions).toEqual([["Start free trial", "/subscription"], ["My Account", "/account"]]);
    expectNoAccountEntryPoints(result.copy, "unconfirmed");
  });

  it("C. trial active: no trial offer and no account entry points, the ready message instead", async () => {
    const result = await hero(signedIn({ state: "trial-active", trialRedeemedAt: iso(-2), startsAt: iso(-2), endsAt: iso(22) }, iso(-2)));
    expect(result.actions).toEqual([]);
    expect(result.ready).toContain("Your MathNexa resource shelf is ready below.");
    expect(result.trialNote).toBe(false);
    expectNoAccountEntryPoints(result.copy, "trial active");
  });

  it("D. trial already used (ended, or used with no subscription): Subscribe on Pricing, never Start free trial", async () => {
    for (const [label, entitlement] of [
      ["trial ended", { state: "trial-expired", trialRedeemedAt: iso(-48), endedAt: iso(-24) }],
      ["trial used, nothing else", { state: "no-entitlement", trialRedeemedAt: iso(-48) }]
    ] as const) {
      const view = signedIn(entitlement, iso(-48));
      const result = await hero(view);
      expect(result.actions, label).toEqual([["Subscribe", "/pricing"], ["My Account", "/account"]]);
      expect(result.actions.flat(), label).not.toContain("Start free trial");
      expect(result.trialNote, label).toBe(false);
      expectNoAccountEntryPoints(result.copy, label);
      cleanup();
    }
  });

  it("E. active paid subscriber (including one set to end at the period's end): the ready message, no commercial actions", async () => {
    for (const [label, entitlement] of [
      ["active", { state: "subscription-active", periodEndsAt: iso(240) }],
      ["set to end", { state: "subscription-canceled-through-period-end", periodEndsAt: iso(240) }]
    ] as const) {
      const result = await hero(signedIn(entitlement, iso(-800)));
      expect(result.actions, label).toEqual([]);
      expect(result.ready, label).toContain("Your MathNexa resource shelf is ready below.");
      expectNoAccountEntryPoints(result.copy, label);
      cleanup();
    }
  });

  it("F. canceled or expired subscriber who used the trial: the existing resubscribe path (Pricing), never a trial", async () => {
    const result = await hero(signedIn({ state: "subscription-expired", endedAt: iso(-24) }, iso(-800)));
    expect(result.actions).toEqual([["Subscribe", "/pricing"], ["My Account", "/account"]]);
    expect(result.trialNote).toBe(false);
    expectNoAccountEntryPoints(result.copy, "expired subscriber");
  });

  it("payment problem and trial activation keep their existing pages: Manage subscription, Trial status", async () => {
    const pastDue = await hero(signedIn({ state: "subscription-past-due", periodEndsAt: iso(-1) }, iso(-800)));
    expect(pastDue.actions).toEqual([["Manage subscription", "/subscription"], ["My Account", "/account"]]);
    cleanup();
    const pending = await hero(signedIn({ state: "trial-pending", trialRedeemedAt: iso(-0.1) }, iso(-0.1)));
    expect(pending.actions).toEqual([["Trial status", "/subscription"], ["My Account", "/account"]]);
    expect(pending.trialNote).toBe(false);
  });

  it("the hero's first action is always the header's own server-decided action for a signed-in account", async () => {
    for (const entitlement of [
      { state: "no-entitlement", trialRedeemedAt: null },
      { state: "no-entitlement", trialRedeemedAt: iso(-48) },
      { state: "trial-expired", trialRedeemedAt: iso(-48), endedAt: iso(-24) },
      { state: "subscription-expired", endedAt: iso(-24) },
      { state: "subscription-past-due", periodEndsAt: iso(-1) },
      { state: "trial-pending", trialRedeemedAt: iso(-0.1) }
    ]) {
      const view = signedIn(entitlement, "trialRedeemedAt" in entitlement ? entitlement.trialRedeemedAt as string | null : iso(-800));
      const header = resolveHeaderCta(view as Parameters<typeof resolveHeaderCta>[0]);
      const result = await hero(view);
      expect(result.actions[0], entitlement.state).toEqual([header?.label, header?.href]);
      cleanup();
    }
  });
});
