import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NEW_ACCOUNT_DESTINATION, POST_AUTH_DESTINATION, isProductDestination, signUpDestination } from "./access-intent";
import { classifyEmailLinkFailure, isEmailLinkFailure } from "./email-link-failure";
import { initialAuthFormState, initialEmailConfirmationState } from "./form-state";

/**
 * The 2026-11 trial funnel fixes: a new account continues to the trial step,
 * an unconfirmed sign-in is offered a new confirmation email, and a failed
 * email link says why and keeps the destination.
 */

const testState = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    values,
    cookieStore: {
      get: vi.fn((name: string) => values.has(name) ? { name, value: values.get(name)! } : undefined),
      set: vi.fn((name: string, value: string) => { values.set(name, value); }),
      delete: vi.fn((name: string) => { values.delete(name); })
    },
    signUp: vi.fn(),
    signIn: vi.fn(),
    getUser: vi.fn(),
    resend: vi.fn(),
    exchange: vi.fn(),
    record: vi.fn(),
    security: vi.fn(),
    observe: vi.fn(),
    consume: vi.fn(),
    platform: true
  };
});

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => testState.cookieStore) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn((target: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${target};307;` }); }) }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: {
      signUp: testState.signUp,
      signInWithPassword: testState.signIn,
      getUser: testState.getUser,
      resend: testState.resend,
      exchangeCodeForSession: testState.exchange
    }
  }))
}));
vi.mock("@/lib/environment/production-public", () => ({ isProductionPublicMode: () => false }));
vi.mock("@/lib/environment/production-platform", () => ({ isProductionPlatformMode: () => testState.platform }));
vi.mock("@/lib/operations/server", () => ({ recordAggregateSignal: testState.record }));
vi.mock("@/lib/observability/security-events", () => ({ recordSecurityEvent: testState.security }));
vi.mock("@/lib/auth/rate-limit", () => ({
  consumeConsumerAuthAttempt: testState.consume,
  clearConsumerAuthAttempts: vi.fn(async () => undefined),
  observeFailedSignIn: testState.observe
}));
vi.mock("@/lib/analytics/ad-attribution", () => ({ rememberAdClickForAccount: vi.fn(async () => undefined) }));
vi.mock("@/lib/showme-access/server", () => ({ clearShowMePass: vi.fn(async () => undefined) }));
vi.mock("@/lib/email/server", () => ({
  getAuthEmailExperience: () => ({ signUpResponse: "Check your email.", recoveryResponse: "Check your email." })
}));

import { checkEmailConfirmationAction, signInAction, signUpAction } from "@/app/auth-actions";
import { GET as authCallback } from "@/app/auth/callback/route";

beforeEach(() => {
  process.env.APP_BASE_URL = "https://mathnexa.example";
  testState.platform = true;
  testState.values.clear();
  testState.signUp.mockReset().mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  testState.signIn.mockReset().mockResolvedValue({ error: null });
  testState.getUser.mockReset().mockResolvedValue({ data: { user: null }, error: null });
  testState.resend.mockReset().mockResolvedValue({ error: null });
  testState.exchange.mockReset().mockResolvedValue({ error: null });
  testState.record.mockReset().mockResolvedValue(undefined);
  testState.security.mockReset().mockResolvedValue(undefined);
  testState.observe.mockReset().mockResolvedValue(undefined);
  testState.consume.mockReset().mockResolvedValue("allowed");
  testState.cookieStore.set.mockClear();
});

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

const account = { email: "person@example.test", password: "Synthetic42!", passwordConfirmation: "Synthetic42!" };

describe("new accounts continue to the trial step", () => {
  it("maps nothing, or the generic homepage, to the trial step and keeps every specific destination", () => {
    expect(NEW_ACCOUNT_DESTINATION).toBe("/subscription");
    expect(signUpDestination(undefined)).toBe("/subscription");
    expect(signUpDestination("")).toBe("/subscription");
    expect(signUpDestination(POST_AUTH_DESTINATION)).toBe("/subscription");
    for (const kept of ["/subscription", "/account", "/map-prep", "/games", "/homework", "/quizzes", "/worksheets", "/games/math-tug-of-war/play", "/games/math-bingo-live/host"]) {
      expect(signUpDestination(kept)).toBe(kept);
    }
    expect(isProductDestination("/map-prep")).toBe(true);
    expect(isProductDestination("/subscription")).toBe(false);
    expect(isProductDestination("/games/math-tug-of-war/play")).toBe(false);
  });

  it("sends the confirmation link of a sign-up with no destination to /subscription (was the homepage)", async () => {
    const result = await signUpAction(initialAuthFormState, form(account));
    expect(result.status).toBe("success");
    expect(result.confirmation).toMatchObject({ origin: "sign-up", cooldownSeconds: 60 });
    expect(testState.signUp).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({ emailRedirectTo: "https://mathnexa.example/auth/callback?next=%2Fsubscription" })
    }));
    expect(testState.values.get("mathnexa-confirmation-next")).toBe("/subscription");
  });

  it("treats next=/ like no destination, and keeps a free game or a product", async () => {
    await signUpAction(initialAuthFormState, form({ ...account, next: "/" }));
    expect(testState.values.get("mathnexa-confirmation-next")).toBe("/subscription");
    await signUpAction(initialAuthFormState, form({ ...account, next: "/games/math-tug-of-war/play" }));
    expect(testState.values.get("mathnexa-confirmation-next")).toBe("/games/math-tug-of-war/play");
    await signUpAction(initialAuthFormState, form({ ...account, next: "/map-prep" }));
    expect(testState.values.get("mathnexa-confirmation-next")).toBe("/map-prep");
    // Anything not allowlisted still falls back, now to the trial step.
    await signUpAction(initialAuthFormState, form({ ...account, next: "https://attacker.example" }));
    expect(testState.values.get("mathnexa-confirmation-next")).toBe("/subscription");
  });
});

describe("an unconfirmed sign-in is offered a new confirmation email", () => {
  it("answers email_not_confirmed with the confirmation step: masked address, no countdown, nothing sent yet", async () => {
    testState.signIn.mockResolvedValueOnce({ error: { code: "email_not_confirmed", message: "Email not confirmed", status: 400 } });
    const result = await signInAction(initialAuthFormState, form({ email: "person@example.test", password: "Synthetic42!" }));
    expect(result).toEqual({
      status: "error",
      message: "Your email address is not confirmed yet.",
      confirmation: { maskedEmail: "p•••••@example.test", cooldownSeconds: 0, origin: "sign-in" }
    });
    expect(JSON.stringify(result)).not.toContain("person@example.test");
    // The resend action can find the address; no countdown was started because nothing was sent.
    expect(testState.values.get("mathnexa-confirmation-email")).toBe("person@example.test");
    expect(testState.values.get("mathnexa-confirmation-next")).toBe("/subscription");
    expect(testState.values.has("mathnexa-confirmation-resend-after")).toBe(false);
    expect(testState.resend).not.toHaveBeenCalled();
    // Detection is unchanged.
    expect(testState.security).toHaveBeenCalledWith("AUTH_LOGIN_FAILED", { scope: "sign-in" });
    expect(testState.observe).toHaveBeenCalled();
  });

  it("keeps a requested product as the confirmation destination", async () => {
    testState.signIn.mockResolvedValueOnce({ error: { message: "Email not confirmed", status: 400 } });
    await signInAction(initialAuthFormState, form({ email: "person@example.test", password: "Synthetic42!", next: "/map-prep" }));
    expect(testState.values.get("mathnexa-confirmation-next")).toBe("/map-prep");
  });

  it("still answers a wrong password or an unknown address with the one generic message", async () => {
    testState.signIn.mockResolvedValueOnce({ error: { code: "invalid_credentials", message: "Invalid login credentials", status: 400 } });
    const result = await signInAction(initialAuthFormState, form({ email: "person@example.test", password: "Wrong42!" }));
    expect(result).toEqual({ status: "error", message: "The email or password was not accepted." });
    expect(testState.values.size).toBe(0);
  });
});

describe("the confirmation check offers sign-in when this browser has no session", () => {
  it("says the link may have been opened on another device, with a sign-in link to the remembered destination", async () => {
    testState.values.set("mathnexa-confirmation-next", "/subscription");
    const result = await checkEmailConfirmationAction(initialEmailConfirmationState);
    expect(result).toMatchObject({ status: "error", signInHref: "/sign-in?next=/subscription" });
    expect(result.message).toMatch(/another device, sign in here to continue/);
  });

  it("keeps the original answer for a session whose email is not confirmed", async () => {
    testState.getUser.mockResolvedValueOnce({ data: { user: { email: "person@example.test", email_confirmed_at: null } }, error: null });
    const result = await checkEmailConfirmationAction(initialEmailConfirmationState);
    expect(result).toEqual({ status: "error", message: "Your email has not been confirmed yet. Check your inbox and try again." });
  });
});

describe("a failed email link says why and keeps the destination", () => {
  it("classifies the three failures", () => {
    expect(classifyEmailLinkFailure({ code: "abc", providerError: null })).toBe("link-other-browser");
    expect(classifyEmailLinkFailure({ code: null, providerError: "otp_expired" })).toBe("link-expired");
    expect(classifyEmailLinkFailure({ code: null, providerError: null })).toBe("link-unusable");
    expect(isEmailLinkFailure("link-expired")).toBe(true);
    expect(isEmailLinkFailure("callback")).toBe(false);
    expect(isEmailLinkFailure("<script>")).toBe(false);
  });

  async function callback(query: string) {
    const response = await authCallback(new NextRequest(`https://mathnexa.example/auth/callback${query}`));
    return response.headers.get("location");
  }

  it("signs in and continues on success", async () => {
    expect(await callback("?code=abc&next=%2Fsubscription")).toBe("https://mathnexa.example/subscription");
  });

  it("a code this browser cannot exchange (another device) goes to sign-in with the destination", async () => {
    testState.exchange.mockResolvedValueOnce({ error: { message: "invalid flow state, no valid flow state found" } });
    expect(await callback("?code=abc&next=%2Fsubscription")).toBe("https://mathnexa.example/sign-in?error=link-other-browser&next=%2Fsubscription");
  });

  it("a link the provider refused (expired or used) says so", async () => {
    expect(await callback("?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&next=%2Fmap-prep"))
      .toBe("https://mathnexa.example/sign-in?error=link-expired&next=%2Fmap-prep");
    expect(testState.exchange).not.toHaveBeenCalled();
  });

  it("anything else is unusable, and an unknown destination becomes the homepage", async () => {
    expect(await callback("?next=https%3A%2F%2Fattacker.example")).toBe("https://mathnexa.example/sign-in?error=link-unusable&next=%2F");
  });

  it("the local teacher pilot keeps its original redirect", async () => {
    testState.platform = false;
    expect(await callback("")).toBe("https://mathnexa.example/sign-in?error=callback");
    testState.exchange.mockResolvedValueOnce({ error: { message: "bad" } });
    expect(await callback("?code=abc")).toBe("https://mathnexa.example/sign-in?error=callback");
  });
});
