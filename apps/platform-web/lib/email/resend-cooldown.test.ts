import { describe, expect, it } from "vitest";

import { RESEND_COOLDOWN_SECONDS, providerResendWaitSeconds, resendCooldownMessage, resendCooldownRemaining } from "./resend-cooldown";

describe("provider pacing refusal", () => {
  it("reads the wait from Supabase's per-address refusal (the 2026-10-04 production case)", () => {
    expect(providerResendWaitSeconds({ status: 429, code: "over_email_send_rate_limit", message: "For security purposes, you can only request this after 53 seconds." })).toBe(53);
    expect(providerResendWaitSeconds({ status: 429, message: "For security purposes, you can only request this after 1 second." })).toBe(1);
  });

  it("does not treat a real send failure or a project-wide quota as pacing", () => {
    expect(providerResendWaitSeconds({ status: 429, code: "over_email_send_rate_limit", message: "Email rate limit exceeded" })).toBeNull();
    expect(providerResendWaitSeconds({ status: 500, message: "Error sending confirmation email" })).toBeNull();
    expect(providerResendWaitSeconds({ status: 400, message: "For security purposes, you can only request this after 53 seconds." })).toBeNull();
    expect(providerResendWaitSeconds(null)).toBeNull();
    expect(providerResendWaitSeconds("after 5 seconds")).toBeNull();
  });
});

describe("remaining resend wait", () => {
  const now = 1_791_000_000;

  it("starts the full window at sign-up from the countdown cookie", () => {
    expect(resendCooldownRemaining({ nowSeconds: now, cookieRetryAt: String(now + RESEND_COOLDOWN_SECONDS) })).toBe(60);
  });

  it("still counts down from the provider's own send time when the cookie is gone", () => {
    const sentSevenSecondsAgo = new Date((now - 7) * 1000).toISOString();
    expect(resendCooldownRemaining({ nowSeconds: now, cookieRetryAt: null, confirmationSentAt: sentSevenSecondsAgo })).toBe(53);
  });

  it("takes the later of the two clocks and never exceeds the window", () => {
    expect(resendCooldownRemaining({ nowSeconds: now, cookieRetryAt: String(now + 20), confirmationSentAt: new Date((now - 5) * 1000).toISOString() })).toBe(55);
    expect(resendCooldownRemaining({ nowSeconds: now, cookieRetryAt: String(now + 999) })).toBe(60);
  });

  it("is zero once the window has passed or nothing is known", () => {
    expect(resendCooldownRemaining({ nowSeconds: now, cookieRetryAt: String(now - 1), confirmationSentAt: new Date((now - 61) * 1000).toISOString() })).toBe(0);
    expect(resendCooldownRemaining({ nowSeconds: now, cookieRetryAt: "not-a-number", confirmationSentAt: "not-a-date" })).toBe(0);
    expect(resendCooldownRemaining({ nowSeconds: now })).toBe(0);
  });

  it("phrases the wait for people", () => {
    expect(resendCooldownMessage(1)).toBe("Wait 1 second before requesting another confirmation email.");
    expect(resendCooldownMessage(42)).toBe("Wait 42 seconds before requesting another confirmation email.");
  });
});
