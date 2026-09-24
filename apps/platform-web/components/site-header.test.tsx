import { decideGameAccess } from "@math-vocabulary-hunt/platform-core";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ view: null as unknown }));

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/app/auth-actions", () => ({ signOutAction: vi.fn() }));
vi.mock("@/app/school-access-actions", () => ({ exitSchoolAccessAction: vi.fn() }));
vi.mock("@/lib/environment/production-platform", () => ({ isProductionPlatformMode: () => true }));
vi.mock("@/lib/environment/production-public", () => ({ isProductionPublicMode: () => false }));
vi.mock("@/lib/game-access/server", () => ({ getGameAccessView: vi.fn(async () => state.view) }));

import { SiteHeader } from "./site-header";

afterEach(cleanup);

const now = new Date("2026-09-24T12:00:00.000Z");
const later = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString();

function view(status: string, evidence: unknown, authenticated = true) {
  return {
    context: { status },
    source: authenticated ? "server-authoritative" : "default-deny",
    principal: null,
    decision: decideGameAccess({ authenticated, accountStatus: "active", emailConfirmed: authenticated, evidence, serverNow: now })
  };
}

async function renderHeader(v: unknown) {
  state.view = v;
  render(await SiteHeader());
  return screen.getByRole("banner");
}

describe("SiteHeader conversion call to action", () => {
  it("anonymous visitor: Start free trial is shown and starts at account creation", async () => {
    const header = await renderHeader(view("anonymous", {}, false));
    const links = within(header).getAllByRole("link", { name: "Start free trial" });
    // Compact and wide copies (CSS shows exactly one).
    expect(links).toHaveLength(2);
    for (const link of links) expect(link.getAttribute("href")).toBe("/sign-up?next=/subscription");
    expect(within(header).queryByRole("button", { name: "Sign out" })).toBeNull();
  });

  it("signed in without a subscription: Start free trial is shown", async () => {
    const header = await renderHeader(view("active", { state: "no-entitlement", trialRedeemedAt: null }));
    for (const link of within(header).getAllByRole("link", { name: "Start free trial" })) expect(link.getAttribute("href")).toBe("/subscription");
  });

  it("active subscription: no trial, the subscriber action instead", async () => {
    const header = await renderHeader(view("active", { state: "subscription-active", periodEndsAt: later }));
    expect(within(header).queryByRole("link", { name: "Start free trial" })).toBeNull();
    for (const link of within(header).getAllByRole("link", { name: "Start learning" })) expect(link.getAttribute("href")).toBe("/games");
  });

  it("expired trial follows the entitlement rules: subscribe, never a second trial", async () => {
    const header = await renderHeader(view("active", { state: "trial-expired", trialRedeemedAt: now.toISOString(), endedAt: now.toISOString() }));
    expect(within(header).queryByRole("link", { name: "Start free trial" })).toBeNull();
    expect(within(header).getAllByRole("link", { name: "Subscribe" })).toHaveLength(2);
  });

  it("keeps the primary navigation behind an accessible menu button", async () => {
    const user = userEvent.setup();
    const header = await renderHeader(view("anonymous", {}, false));
    const toggle = within(header).getByRole("button", { name: "Open menu" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    const panel = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
    expect(panel && within(panel).getByRole("navigation", { name: "Primary navigation" })).toBeTruthy();
    await user.click(toggle);
    expect(within(header).getByRole("button", { name: "Close menu" }).getAttribute("aria-expanded")).toBe("true");
    await user.keyboard("{Escape}");
    const reopened = within(header).getByRole("button", { name: "Open menu" });
    expect(reopened.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(reopened);
  });
});
