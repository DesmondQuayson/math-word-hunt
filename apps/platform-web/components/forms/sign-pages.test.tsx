import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /sign-up and /sign-in after the 2026-11 trial funnel fixes: every consumer
 * sign-up shows the offer with the form first (except a free game), a
 * signed-in visitor is sent on, and a failed email link is explained.
 */

const mocks = vi.hoisted(() => ({ context: vi.fn() }));
vi.mock("@/lib/environment/production-platform", () => ({ isProductionPlatformMode: () => true }));
vi.mock("@/lib/supabase/public-config", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/auth/consumer-context", () => ({ resolveConsumerContext: mocks.context }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((target: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${target};307;` }); }),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() })
}));
vi.mock("@/app/auth-actions", () => ({
  signUpAction: vi.fn(async (state) => state),
  signInAction: vi.fn(async (state) => state),
  forgotPasswordAction: vi.fn(async (state) => state),
  updatePasswordAction: vi.fn(async (state) => state),
  checkEmailConfirmationAction: vi.fn(async (state) => state),
  resendConfirmationAction: vi.fn(async (state) => state)
}));
vi.mock("@/app/school-access-actions", () => ({ authorizeSchoolAccessAction: vi.fn(async (state) => state) }));

import SignInPage from "@/app/sign-in/page";
import SignUpPage from "@/app/sign-up/page";

async function signUp(next?: string) {
  return render(await SignUpPage({ searchParams: Promise.resolve(next === undefined ? {} : { next }) }));
}
async function signIn(params: Record<string, string>) {
  return render(await SignInPage({ searchParams: Promise.resolve(params) }));
}

beforeEach(() => {
  mocks.context.mockResolvedValue({ status: "anonymous", userId: null, email: null, account: null });
});
afterEach(cleanup);

describe("/sign-up", () => {
  it.each([undefined, "/", "/subscription", "/map-prep", "/account"])("next=%s shows the trial onboarding with the form before any notice", async (next) => {
    const { container } = await signUp(next);
    expect(screen.getByRole("heading", { level: 1, name: "Start your free trial" })).toBeTruthy();
    expect(container.textContent).toContain("24-hour free trial");
    expect(container.textContent).toContain("Cancel before the 24-hour trial ends and you won't be charged.");
    const destination = !next || next === "/" ? "/subscription" : next;
    expect(container.querySelector('input[name="next"]')?.getAttribute("value")).toBe(destination);
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe(`/sign-in?next=${destination}`);
    // The form comes before the delivery and privacy notices.
    const formIndex = [...container.querySelectorAll("form, [role=note], .notice, section")].findIndex((element) => element.tagName === "FORM");
    expect(formIndex).toBe(0);
  });

  it("a free game keeps the free-account wording with no trial language", async () => {
    const { container } = await signUp("/games/math-tug-of-war/play");
    expect(screen.getByRole("heading", { level: 1, name: "Create a free account to play" })).toBeTruthy();
    expect(container.textContent).not.toMatch(/\$5\.99|free trial/i);
    expect(container.querySelector('input[name="next"]')?.getAttribute("value")).toBe("/games/math-tug-of-war/play");
  });

  it("a signed-in, confirmed visitor is sent on to the destination instead of a second account", async () => {
    mocks.context.mockResolvedValue({ status: "active", userId: "u1", email: "person@example.test", account: {} });
    await expect(signUp("/map-prep")).rejects.toMatchObject({ digest: expect.stringContaining(";/map-prep;") });
    await expect(signUp()).rejects.toMatchObject({ digest: expect.stringContaining(";/subscription;") });
  });

  it("an unconfirmed session still sees the form", async () => {
    mocks.context.mockResolvedValue({ status: "unconfirmed", userId: "u1", email: "person@example.test", account: null });
    await signUp();
    expect(screen.getByRole("heading", { level: 1, name: "Start your free trial" })).toBeTruthy();
  });
});

describe("/sign-in", () => {
  it("explains a confirmation link opened on another device, and keeps the destination", async () => {
    const { container } = await signIn({ error: "link-other-browser", next: "/subscription" });
    expect(container.textContent).toContain("Your email address is confirmed.");
    expect(container.textContent).toContain("different browser or device");
    expect(container.querySelector('input[name="next"]')?.getAttribute("value")).toBe("/subscription");
  });

  it("explains an expired or used link", async () => {
    const { container } = await signIn({ error: "link-expired", next: "/subscription" });
    expect(container.textContent).toContain("This link has expired or was already used.");
  });

  it("a failed password reset link points to a new one", async () => {
    await signIn({ error: "link-expired", next: "/update-password" });
    expect(screen.getByText("This password reset link can’t be used.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Request a new link" }).getAttribute("href")).toBe("/forgot-password");
  });

  it("ignores an unknown error value", async () => {
    const { container } = await signIn({ error: "<b>owned</b>" });
    expect(container.textContent).not.toMatch(/owned|link/i);
  });

  it("\"Start free trial\" keeps a requested product, otherwise starts at the trial step; a free game keeps the game", async () => {
    await signIn({ next: "/map-prep" });
    expect(screen.getByRole("link", { name: "Start free trial" }).getAttribute("href")).toBe("/sign-up?next=/map-prep");
    cleanup();
    await signIn({});
    expect(screen.getByRole("link", { name: "Start free trial" }).getAttribute("href")).toBe("/sign-up?next=/subscription");
    cleanup();
    await signIn({ next: "/games/polygon-showdown/play" });
    expect(screen.getByRole("link", { name: "Create a free account" }).getAttribute("href")).toBe("/sign-up?next=/games/polygon-showdown/play");
  });
});
