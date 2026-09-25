import { decideGameAccess } from "@math-vocabulary-hunt/platform-core";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ view: null as unknown, pathname: "/" }));

vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("@/app/auth-actions", () => ({ signOutAction: vi.fn() }));
vi.mock("@/app/school-access-actions", () => ({ exitSchoolAccessAction: vi.fn() }));
vi.mock("@/lib/environment/production-platform", () => ({ isProductionPlatformMode: () => true }));
vi.mock("@/lib/environment/production-public", () => ({ isProductionPublicMode: () => false }));
vi.mock("@/lib/game-access/server", () => ({ getGameAccessView: vi.fn(async () => state.view) }));

import { SiteHeader } from "./site-header";

afterEach(() => { cleanup(); state.pathname = "/"; });

const now = new Date("2026-09-24T12:00:00.000Z");
const later = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString();
const earlier = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

function view(status: string, evidence: unknown, authenticated = true, source?: string) {
  return {
    context: { status },
    source: source ?? (authenticated ? "server-authoritative" : "default-deny"),
    principal: null,
    decision: decideGameAccess({ authenticated, accountStatus: "active", emailConfirmed: authenticated, evidence, serverNow: now })
  };
}

async function renderHeader(v: unknown) {
  state.view = v;
  render(await SiteHeader());
  return screen.getByRole("banner");
}

const PRODUCTS: ReadonlyArray<[string, string]> = [
  ["Home", "/"],
  ["Math Games", "/games"],
  ["Online Math Prep", "/map-prep"],
  ["Homework PDFs", "/homework"],
  ["Quiz PDFs", "/quizzes"],
  ["Worksheet Generator", "https://showme.mathnexa.com/worksheets"]
];

function expectProductStrip(header: HTMLElement) {
  const strip = within(header).getByRole("navigation", { name: "Primary navigation" });
  const links = within(strip).getAllByRole("link");
  expect(links.map((link) => link.getAttribute("href"))).toEqual(PRODUCTS.map(([, href]) => href));
  for (const [label, href] of PRODUCTS) {
    const link = within(strip).getByRole("link", { name: label === "Home" ? /^Home( Current)?$/ : label });
    expect(link.getAttribute("href")).toBe(href);
  }
  return strip;
}

function accountPanel(header: HTMLElement) {
  const toggle = within(header).getByRole("button", { name: /Open account menu|Close account menu/ });
  return document.getElementById(toggle.getAttribute("aria-controls") ?? "") as HTMLElement;
}

describe("SiteHeader banner", () => {
  it("shows the brand picture and the six product destinations to everyone", async () => {
    const header = await renderHeader(view("anonymous", {}, false));
    const brand = within(header).getByRole("link", { name: "MathNexa home" });
    expect(brand.querySelector("img.brand-mark-photo, .brand-mark-photo img")).toBeTruthy();
    expectProductStrip(header);
    // Account actions are not in the product strip.
    const strip = within(header).getByRole("navigation", { name: "Primary navigation" });
    for (const label of ["Subscription", "My Account", "Sign out", "Start learning"]) expect(within(strip).queryByRole("link", { name: label })).toBeNull();
  });

  it("marks the current destination with aria-current", async () => {
    state.pathname = "/games/number-cross/play";
    const header = await renderHeader(view("anonymous", {}, false));
    const strip = within(header).getByRole("navigation", { name: "Primary navigation" });
    expect(within(strip).getByRole("link", { name: /Math Games/ }).getAttribute("aria-current")).toBe("page");
    expect(within(strip).getByRole("link", { name: /^Home( Current)?$/ }).getAttribute("aria-current")).toBeNull();
    expect(within(strip).getByRole("link", { name: "Worksheet Generator" }).getAttribute("aria-current")).toBeNull();
  });

  it("anonymous visitor: Start free trial (compact + wide copies) to account creation; account menu holds Subscription and My Account", async () => {
    const header = await renderHeader(view("anonymous", {}, false));
    const links = within(header).getAllByRole("link", { name: "Start free trial" });
    expect(links).toHaveLength(2);
    for (const link of links) expect(link.getAttribute("href")).toBe("/sign-up?next=/subscription");
    const panel = accountPanel(header);
    const account = within(panel).getByRole("navigation", { name: "Account navigation" });
    expect(within(account).getAllByRole("link").map((link) => link.textContent)).toEqual(["Subscription", "My Account"]);
    expect(within(account).queryByRole("button", { name: "Sign out" })).toBeNull();
  });

  it("signed in, trial never used: Start free trial to the subscription page", async () => {
    const header = await renderHeader(view("active", { state: "no-entitlement", trialRedeemedAt: null }));
    for (const link of within(header).getAllByRole("link", { name: "Start free trial" })) expect(link.getAttribute("href")).toBe("/subscription");
    expectProductStrip(header);
  });

  it("paid subscriber: no Start free trial, no Start learning, product strip intact, Sign out in the account menu", async () => {
    const header = await renderHeader(view("active", { state: "subscription-active", periodEndsAt: later }));
    expect(within(header).queryByRole("link", { name: "Start free trial" })).toBeNull();
    expect(within(header).queryByRole("link", { name: "Start learning" })).toBeNull();
    expect(header.querySelector("[data-header-cta]")).toBeNull();
    expectProductStrip(header);
    const account = within(accountPanel(header)).getByRole("navigation", { name: "Account navigation" });
    expect(within(account).getAllByRole("link").map((link) => link.textContent)).toEqual(["Subscription", "My Account"]);
    expect(within(account).getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

  it("active trial, renewal grace and scheduled cancellation: no call to action either", async () => {
    for (const evidence of [
      { state: "trial-active", trialRedeemedAt: earlier, startsAt: earlier, endsAt: later },
      { state: "subscription-grace-period", periodEndsAt: earlier, graceEndsAt: later },
      { state: "subscription-canceled-through-period-end", periodEndsAt: later }
    ]) {
      const header = await renderHeader(view("active", evidence));
      expect(header.querySelector("[data-header-cta]")).toBeNull();
      expect(within(header).queryByRole("link", { name: /Start (free trial|learning)/ })).toBeNull();
      expectProductStrip(header);
      cleanup();
    }
  });

  it("used trial: Subscribe to /pricing, never a second trial", async () => {
    const header = await renderHeader(view("active", { state: "trial-expired", trialRedeemedAt: earlier, endedAt: earlier }));
    expect(within(header).queryByRole("link", { name: "Start free trial" })).toBeNull();
    const links = within(header).getAllByRole("link", { name: "Subscribe" });
    expect(links).toHaveLength(2);
    for (const link of links) expect(link.getAttribute("href")).toBe("/pricing");
  });

  it("payment problem: Manage subscription", async () => {
    const header = await renderHeader(view("active", { state: "subscription-past-due", periodEndsAt: null }));
    for (const link of within(header).getAllByRole("link", { name: "Manage subscription" })) expect(link.getAttribute("href")).toBe("/subscription");
    expect(within(header).queryByRole("link", { name: "Start free trial" })).toBeNull();
  });

  it("school-code session: no call to action, Exit authorized access in the account menu", async () => {
    const header = await renderHeader(view("anonymous", { state: "subscription-active", periodEndsAt: later }, true, "school-access"));
    expect(header.querySelector("[data-header-cta]")).toBeNull();
    expect(within(accountPanel(header)).getByRole("button", { name: "Exit authorized access" })).toBeTruthy();
  });

  it("account menu: accessible disclosure, Escape closes and returns focus", async () => {
    const user = userEvent.setup();
    const header = await renderHeader(view("active", { state: "subscription-active", periodEndsAt: later }));
    const toggle = within(header).getByRole("button", { name: "Open account menu" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await user.click(toggle);
    expect(within(header).getByRole("button", { name: "Close account menu" }).getAttribute("aria-expanded")).toBe("true");
    await user.keyboard("{Escape}");
    const reopened = within(header).getByRole("button", { name: "Open account menu" });
    expect(reopened.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(reopened);
  });
});
