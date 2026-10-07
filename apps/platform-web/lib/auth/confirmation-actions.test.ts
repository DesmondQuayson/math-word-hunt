import { beforeEach, describe, expect, it, vi } from "vitest";

import { initialAuthFormState, initialEmailConfirmationState } from "./form-state";

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
    getUser: vi.fn(),
    resend: vi.fn(),
    record: vi.fn()
  };
});

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => testState.cookieStore) }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { signUp: testState.signUp, getUser: testState.getUser, resend: testState.resend }
  }))
}));
vi.mock("@/lib/environment/production-public", () => ({ isProductionPublicMode: () => false }));
vi.mock("@/lib/environment/production-platform", () => ({ isProductionPlatformMode: () => true }));
vi.mock("@/lib/operations/server", () => ({ recordAggregateSignal: testState.record }));
vi.mock("@/lib/email/server", () => ({
  getAuthEmailExperience: () => ({ signUpResponse: "Check your email.", recoveryResponse: "Check your email." })
}));

import {
  checkEmailConfirmationAction,
  resendConfirmationAction,
  signUpAction
} from "@/app/auth-actions";

beforeEach(() => {
  process.env.APP_BASE_URL = "https://mathnexa.example";
  testState.values.clear();
  testState.signUp.mockReset().mockResolvedValue({ error: null });
  testState.getUser.mockReset().mockResolvedValue({ data: { user: null }, error: null });
  testState.resend.mockReset().mockResolvedValue({ error: null });
  testState.record.mockReset().mockResolvedValue(undefined);
  testState.cookieStore.get.mockClear();
  testState.cookieStore.set.mockClear();
  testState.cookieStore.delete.mockClear();
});

describe("email confirmation actions", () => {
  it("returns only a masked address and preserves an allowlisted destination in an HTTP-only cookie", async () => {
    const data = new FormData();
    data.set("email", "person@example.test");
    data.set("password", "Synthetic42!");
    data.set("passwordConfirmation", "Synthetic42!");
    data.set("next", "/games");
    const result = await signUpAction(initialAuthFormState, data);

    expect(result.status).toBe("success");
    expect(result.confirmation?.maskedEmail).toBe("p•••••@example.test");
    expect(JSON.stringify(result)).not.toContain("person@example.test");
    expect(testState.values.get("mathnexa-confirmation-next")).toBe("/games");
    expect(testState.cookieStore.set).toHaveBeenCalledWith(
      "mathnexa-confirmation-email",
      "person@example.test",
      expect.objectContaining({ httpOnly: true, sameSite: "lax", secure: true })
    );
  });

  it("uses authoritative Auth state for the confirmation check", async () => {
    testState.getUser.mockResolvedValueOnce({
      data: { user: { email: "person@example.test", email_confirmed_at: null } },
      error: null
    });
    await expect(checkEmailConfirmationAction(initialEmailConfirmationState)).resolves.toMatchObject({
      status: "error",
      message: "Your email has not been confirmed yet. Check your inbox and try again."
    });

    testState.values.set("mathnexa-confirmation-next", "/homework");
    testState.getUser.mockResolvedValueOnce({
      data: { user: { email: "person@example.test", email_confirmed_at: "2026-08-08T12:00:00Z" } },
      error: null
    });
    await expect(checkEmailConfirmationAction(initialEmailConfirmationState)).resolves.toMatchObject({
      status: "success",
      destination: "/homework",
      message: "Email confirmed. Your MathNexa account is ready."
    });
  });

  it("resends through Supabase once and enforces the server-owned cooldown", async () => {
    testState.values.set("mathnexa-confirmation-email", "person@example.test");
    testState.values.set("mathnexa-confirmation-next", "/quizzes");

    const first = await resendConfirmationAction(initialEmailConfirmationState);
    expect(first).toMatchObject({ status: "success", cooldownSeconds: 60 });
    expect(testState.resend).toHaveBeenCalledWith(expect.objectContaining({
      type: "signup",
      email: "person@example.test"
    }));

    const second = await resendConfirmationAction(initialEmailConfirmationState);
    expect(second.status).toBe("error");
    expect(second.message).toMatch(/^Wait \d+ seconds/);
    expect(testState.resend).toHaveBeenCalledTimes(1);
  });

  it("starts the resend wait at sign-up, so a resend seconds later never reaches the provider (production 2026-10-04)", async () => {
    const data = new FormData();
    data.set("email", "person@example.test");
    data.set("password", "Synthetic42!");
    data.set("passwordConfirmation", "Synthetic42!");
    const signedUp = await signUpAction(initialAuthFormState, data);
    expect(signedUp.confirmation?.cooldownSeconds).toBe(60);
    const retryAt = Number(testState.values.get("mathnexa-confirmation-resend-after"));
    expect(retryAt - Math.floor(Date.now() / 1000)).toBeGreaterThanOrEqual(59);
    expect(testState.cookieStore.set).toHaveBeenCalledWith("mathnexa-confirmation-resend-after", String(retryAt), expect.objectContaining({ httpOnly: true, maxAge: 60 }));

    const early = await resendConfirmationAction(initialEmailConfirmationState);
    expect(early).toMatchObject({ status: "error", cooldownSeconds: expect.any(Number) });
    expect(early.message).toMatch(/^Wait \d+ seconds? before requesting another confirmation email\.$/);
    expect(testState.resend).not.toHaveBeenCalled();
    expect(testState.record).not.toHaveBeenCalled();
  });

  it("still waits on the provider's own send time when the countdown cookie was cleared", async () => {
    testState.getUser.mockResolvedValueOnce({
      data: { user: { email: "person@example.test", email_confirmed_at: null, confirmation_sent_at: new Date(Date.now() - 7_000).toISOString() } },
      error: null
    });
    const result = await resendConfirmationAction(initialEmailConfirmationState);
    expect(result.status).toBe("error");
    // 60 s after the provider stamped the send, rounded up: never offer the button early.
    expect(result.cooldownSeconds).toBeGreaterThanOrEqual(53);
    expect(result.cooldownSeconds).toBeLessThanOrEqual(54);
    expect(testState.resend).not.toHaveBeenCalled();
    expect(testState.values.has("mathnexa-confirmation-resend-after")).toBe(true);
  });

  it("turns the provider's pacing refusal into a countdown and never records it as a delivery failure", async () => {
    testState.values.set("mathnexa-confirmation-email", "person@example.test");
    testState.resend.mockResolvedValueOnce({ error: { status: 429, code: "over_email_send_rate_limit", message: "For security purposes, you can only request this after 41 seconds." } });
    const result = await resendConfirmationAction(initialEmailConfirmationState);
    expect(result).toEqual({ status: "error", message: "Wait 41 seconds before requesting another confirmation email.", cooldownSeconds: 41 });
    expect(testState.record).toHaveBeenCalledWith({ metricKey: "email-confirmation-failure", outcome: "unavailable", source: "email" });
    expect(testState.record).not.toHaveBeenCalledWith(expect.objectContaining({ outcome: "failure" }));
  });

  it("still records a real send failure as a failure", async () => {
    testState.values.set("mathnexa-confirmation-email", "person@example.test");
    testState.resend.mockResolvedValueOnce({ error: { status: 500, message: "Error sending confirmation email" } });
    const result = await resendConfirmationAction(initialEmailConfirmationState);
    expect(result.status).toBe("error");
    expect(result.cooldownSeconds).toBeUndefined();
    expect(testState.record).toHaveBeenCalledWith({ metricKey: "email-confirmation-failure", outcome: "failure", source: "email" });
  });
});
