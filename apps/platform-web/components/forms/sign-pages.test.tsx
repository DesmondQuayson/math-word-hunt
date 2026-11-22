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

async function signUp(next?: string, extra: Record<string, unknown> = {}) {
  const params = { ...(next === undefined ? {} : { next }), ...extra } as { next?: string; entry?: string };
  return render(await SignUpPage({ searchParams: Promise.resolve(params) }));
}
/** The sign-up form as the server action would receive it: each control's element, name and type, plus the destination value. */
function signUpFormShape(container: HTMLElement) {
  const form = container.querySelector("form");
  return [...(form?.elements ?? [])].map((element) => {
    const control = element as HTMLInputElement;
    return [control.tagName, control.name, control.type, control.name === "next" ? control.value : ""];
  });
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
    cleanup();
    await signUp(undefined, { entry: "account" });
    expect(screen.getByRole("heading", { level: 1, name: "Create your MathNexa account" })).toBeTruthy();
  });
});

describe("/sign-up entry modes (2026-11-22): wording only", () => {
  it("A. Start free trial (/sign-up?next=/subscription): the trial heading, lead and button", async () => {
    const { container } = await signUp("/subscription");
    expect(screen.getByRole("heading", { level: 1, name: "Start your free trial" })).toBeTruthy();
    expect(container.textContent).toContain("Get full access to MathNexa math practice, games, learning tools, and premium resources.");
    expect(screen.getByRole("button", { name: "Start free trial" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Create your MathNexa account" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Create account" })).toBeNull();
  });

  it("B. Create account (/sign-up?entry=account): the account heading, the real next step, the trial terms and card requirement in view", async () => {
    const { container } = await signUp(undefined, { entry: "account" });
    expect(screen.getByRole("heading", { level: 1, name: "Create your MathNexa account" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Start your free trial" })).toBeNull();
    const header = container.querySelector(".onboarding-header");
    expect(header?.querySelector(".lede")?.textContent).toBe("Set up your account to access MathNexa. After you confirm your email, new eligible accounts can start the free trial before the monthly subscription begins.");
    // The existing offer line, from the commercial policy: trial length, price, card, cancellation.
    expect(header?.querySelector(".trial-offer-note")?.textContent).toBe("24-hour free trial, then $5.99 USD a month. A card is needed to start, and you won’t be charged if you cancel before the trial ends.");
    expect(header?.querySelector("a")).toBeNull();
    // The same plan card and next-step line as the trial wording.
    const text = container.textContent ?? "";
    expect(text).toContain("After the trial, $5.99 USD is billed monthly and renews automatically until canceled.");
    expect(text).toContain("Cancel before the 24-hour trial ends and you won't be charged.");
    expect(text).toContain("Next, confirm your email. Then add a payment method on Stripe's secure checkout to begin the trial.");
    expect(screen.getByRole("button", { name: "Create account" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start free trial" })).toBeNull();
  });

  it("C. both modes render the identical form: same controls, same destination, the same Sign in link, and no entry field", async () => {
    for (const next of [undefined, "/", "/subscription", "/map-prep"]) {
      const trial = await signUp(next);
      const trialShape = signUpFormShape(trial.container);
      const trialSignIn = screen.getByRole("link", { name: "Sign in" }).getAttribute("href");
      cleanup();
      const account = await signUp(next, { entry: "account" });
      expect(signUpFormShape(account.container), String(next)).toEqual(trialShape);
      expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href"), String(next)).toBe(trialSignIn);
      expect(account.container.querySelector("[name=entry]"), String(next)).toBeNull();
      expect(account.container.innerHTML, String(next)).not.toContain("entry=");
      cleanup();
    }
    expect(signUpFormShape((await signUp(undefined, { entry: "account" })).container).find(([, name]) => name === "next")?.[3]).toBe("/subscription");
  });

  it("any other entry value, a repeated one, or markup keeps the trial wording and is never echoed", async () => {
    for (const entry of ["trial", "Account", "ACCOUNT", " account", "account ", "<b>account</b>", ["account", "account"], ""]) {
      const { container } = await signUp(undefined, { entry });
      expect(screen.getByRole("heading", { level: 1, name: "Start your free trial" }), JSON.stringify(entry)).toBeTruthy();
      expect(container.innerHTML, JSON.stringify(entry)).not.toMatch(/&lt;b&gt;|<b>account/);
      cleanup();
    }
  });

  it("a free game keeps its free-account wording whatever the entry mode", async () => {
    const { container } = await signUp("/games/math-tug-of-war/play", { entry: "account" });
    expect(screen.getByRole("heading", { level: 1, name: "Create a free account to play" })).toBeTruthy();
    expect(container.textContent).not.toMatch(/\$5\.99|free trial/i);
  });

  it("D. a signed-in, confirmed account is sent on exactly as before, whatever the entry mode (the destination re-checks the trial on the server)", async () => {
    mocks.context.mockResolvedValue({ status: "active", userId: "u1", email: "person@example.test", account: {} });
    for (const entry of ["account", "trial", undefined]) {
      await expect(signUp(undefined, { entry })).rejects.toMatchObject({ digest: expect.stringContaining(";/subscription;") });
      await expect(signUp("/map-prep", { entry })).rejects.toMatchObject({ digest: expect.stringContaining(";/map-prep;") });
    }
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
