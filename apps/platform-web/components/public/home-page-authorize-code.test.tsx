import { MATHNEXA_ALL_ACCESS, decideMathNexaAccess } from "@math-vocabulary-hunt/platform-core";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

// The homepage route decides what the code card shows from the server-side
// session (getGameAccessView), never from the browser. These tests drive the
// real route component through every session the server can report and check
// the rendered output: signed out shows the card; any authenticated account
// session, whatever its access, renders no card at all.

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

const now = new Date("2026-09-26T12:00:00.000Z");
const hour = 60 * 60 * 1000;
const earlier = new Date(now.getTime() - hour).toISOString();
const later = new Date(now.getTime() + 10 * 24 * hour).toISOString();
const trialEnd = new Date(Date.parse(earlier) + 24 * hour).toISOString();
const userId = "00000000-0000-4000-8000-000000000001";

type AccountStatus = "active" | "suspended" | "deletion-pending";

function account(accountStatus: AccountStatus) {
  return {
    userId,
    accountStatus,
    emailConfirmedAt: earlier,
    trialRedeemedAt: null,
    deletionRequestedAt: null,
    deletionCompletedAt: null,
    createdAt: earlier,
    updatedAt: earlier
  };
}

function signedOut(status: "anonymous" | "unconfigured") {
  return {
    context: { status, userId: null, email: null, account: null },
    decision: decideMathNexaAccess({ authenticated: false, accountStatus: "active", emailConfirmed: false, evidence: {}, serverNow: now }),
    source: "default-deny",
    principal: null
  };
}

function schoolSession() {
  return {
    context: { status: "anonymous", userId: null, email: null, account: null },
    decision: decideMathNexaAccess({
      authenticated: true,
      accountStatus: "active",
      emailConfirmed: true,
      evidence: { capabilityKey: MATHNEXA_ALL_ACCESS, entitlement: { state: "subscription-active", periodEndsAt: later } },
      serverNow: now
    }),
    source: "school-access",
    principal: { kind: "school-access", id: "school-session" }
  };
}

function withoutAccount(status: "unconfirmed" | "missing-account") {
  return {
    context: { status, userId, email: "teacher@example.test", account: null },
    decision: decideMathNexaAccess({ authenticated: true, accountStatus: "active", emailConfirmed: status !== "unconfirmed", evidence: {}, serverNow: now }),
    source: "default-deny",
    principal: { kind: "consumer", id: userId }
  };
}

function signedIn(accountStatus: AccountStatus, entitlement: unknown) {
  return {
    context: { status: accountStatus, userId, email: "teacher@example.test", account: account(accountStatus) },
    decision: decideMathNexaAccess({
      authenticated: true,
      accountStatus,
      emailConfirmed: true,
      evidence: entitlement === null ? {} : { capabilityKey: MATHNEXA_ALL_ACCESS, entitlement },
      serverNow: now
    }),
    source: "server-authoritative",
    principal: { kind: "consumer", id: userId }
  };
}

async function renderHome(view: unknown) {
  state.view = view;
  return render(await HomePage());
}

function expectNoCodeCard(container: HTMLElement, label: string) {
  expect(container.querySelector("#authorized-access"), label).toBeNull();
  expect(container.querySelector(".teacher-home-authorized-access, .authorized-access-panel, .authorized-access-form, #authorized-code, input[name='authorizedCode']"), label).toBeNull();
  expect(screen.queryByRole("heading", { name: "Authorize Code" }), label).toBeNull();
  expect(screen.queryByRole("heading", { name: "Authorized access active" }), label).toBeNull();
  expect(screen.queryByLabelText(/^Code/), label).toBeNull();
  expect(screen.queryByRole("button", { name: /Show code|Hide code/ }), label).toBeNull();
  expect(screen.queryByRole("button", { name: "Continue" }), label).toBeNull();
  expect(container.textContent, label).not.toMatch(/Authorize Code|Authorized access active/);
  // The rest of the homepage is intact, and the hero copy ends with its actions.
  expect(screen.getByRole("heading", { level: 1 }).textContent, label).toBe("Make every math lesson clearer, more engaging, and ready to teach.");
  expect(screen.getByRole("link", { name: /Quiz PDFs Assess · Print/ }).getAttribute("href"), label).toBe("/quizzes");
  const last = container.querySelector(".teacher-home-copy")?.lastElementChild;
  expect(last?.classList.contains("teacher-home-actions") || last?.classList.contains("teacher-home-ready"), label).toBe(true);
}

describe("homepage Authorize Code card follows the server-side session", () => {
  it("A: signed out (anonymous, and a deployment without auth configured) shows the card with a working Show/Hide control", async () => {
    for (const status of ["anonymous", "unconfigured"] as const) {
      const user = userEvent.setup();
      const { container } = await renderHome(signedOut(status));
      const anchor = container.querySelector<HTMLElement>("#authorized-access") as HTMLElement;
      expect(anchor, status).toBeTruthy();
      const entry = within(anchor);
      expect(entry.getByRole("heading", { name: "Authorize Code" }), status).toBeTruthy();
      const code = entry.getByLabelText(/^Code/) as HTMLInputElement;
      expect(code.getAttribute("type"), status).toBe("password");
      expect(entry.getByRole("button", { name: "Continue" }), status).toBeTruthy();
      expect(anchor.querySelector('input[name="next"]')?.getAttribute("value"), status).toBe("/games");
      await user.click(entry.getByRole("button", { name: "Show code" }));
      expect(code.getAttribute("type"), status).toBe("text");
      await user.click(entry.getByRole("button", { name: "Hide code" }));
      expect(code.getAttribute("type"), status).toBe("password");
      expect(screen.getByRole("link", { name: "Create an account" }).getAttribute("href"), status).toBe("/sign-up");
      cleanup();
    }
  });

  it("signed out with an authorized code already active: the existing exit control stays in the same place (unchanged)", async () => {
    const { container } = await renderHome(schoolSession());
    const anchor = container.querySelector<HTMLElement>("#authorized-access") as HTMLElement;
    expect(anchor).toBeTruthy();
    expect(within(anchor).getByRole("heading", { name: "Authorized access active" })).toBeTruthy();
    expect(within(anchor).getByRole("button", { name: "Exit authorized access" })).toBeTruthy();
    expect(screen.queryByLabelText(/^Code/)).toBeNull();
  });

  it("B-F: every authenticated session renders no card, whatever its access (not an entitlement decision)", async () => {
    const sessions: ReadonlyArray<[string, unknown, boolean]> = [
      ["unconfirmed email", withoutAccount("unconfirmed"), false],
      ["signed in, account row missing", withoutAccount("missing-account"), false],
      ["B signed-in non-subscriber, trial eligible", signedIn("active", { state: "no-entitlement", trialRedeemedAt: null }), false],
      ["signed-in, no evidence at all", signedIn("active", null), false],
      ["C active trial", signedIn("active", { state: "trial-active", trialRedeemedAt: earlier, startsAt: earlier, endsAt: trialEnd }), true],
      ["trial activation pending", signedIn("active", { state: "trial-pending", trialRedeemedAt: earlier }), false],
      ["D active subscriber", signedIn("active", { state: "subscription-active", periodEndsAt: later }), true],
      ["scheduled cancellation", signedIn("active", { state: "subscription-canceled-through-period-end", periodEndsAt: later }), true],
      ["renewal grace", signedIn("active", { state: "subscription-grace-period", periodEndsAt: earlier, graceEndsAt: later }), true],
      ["E used trial", signedIn("active", { state: "trial-expired", trialRedeemedAt: earlier, endedAt: earlier }), false],
      ["E used trial, no entitlement row", signedIn("active", { state: "no-entitlement", trialRedeemedAt: earlier }), false],
      ["F payment problem", signedIn("active", { state: "subscription-past-due", periodEndsAt: earlier }), false],
      ["subscription ended", signedIn("active", { state: "subscription-expired", endedAt: earlier }), false],
      ["suspended account, still signed in", signedIn("suspended", { state: "subscription-active", periodEndsAt: later }), false],
      ["deletion pending, still signed in", signedIn("deletion-pending", null), false]
    ];
    for (const [label, view, allowed] of sessions) {
      // The fixture really is the access state it names: entitled and
      // non-entitled sessions are both covered, and both hide the card.
      expect((view as { decision: { allowed: boolean } }).decision.allowed, label).toBe(allowed);
      const { container } = await renderHome(view);
      expectNoCodeCard(container, label);
      cleanup();
    }
  });
});
