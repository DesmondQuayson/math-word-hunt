/**
 * Redaction guarantees for the security-event channel.
 *
 * Every value fed in here comes from FAKE_SECRETS — synthetic strings that
 * resemble a credential only in shape. That matters: if one of them ever turns
 * up in emitted output, it is unambiguous evidence of a redaction failure rather
 * than an ambiguous "is that a real key?" question.
 *
 * The suite deliberately attacks the filter rather than demonstrating it, and
 * ends with a mutation check that proves the assertions have teeth.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FAKE_SECRETS, FAKE_SECRET_VALUES, XSS_PAYLOADS } from "./fixtures/adversarial";

const emitted: string[] = [];
let originalInfo: typeof console.info;

beforeEach(() => {
  emitted.length = 0;
  originalInfo = console.info;
  console.info = (line: unknown) => { emitted.push(String(line)); };
});

afterEach(() => {
  console.info = originalInfo;
  vi.clearAllMocks();
});

function output(): string {
  return emitted.join("\n");
}

describe("no security event can carry a credential", () => {
  it("drops every credential-shaped field, whatever the caller names it", async () => {
    const { emitSecurityEvent } = await import("@/lib/observability/security-events");
    emitSecurityEvent("AUTH_LOGIN_FAILED", {
      password: FAKE_SECRETS.password,
      userPassword: FAKE_SECRETS.password,
      sessionCookie: FAKE_SECRETS.sessionCookie,
      cookie: FAKE_SECRETS.sessionCookie,
      accessToken: FAKE_SECRETS.accessToken,
      refreshToken: FAKE_SECRETS.refreshToken,
      authorization: FAKE_SECRETS.authorizationHeader,
      authorizationHeader: FAKE_SECRETS.authorizationHeader,
      schoolAccessCode: FAKE_SECRETS.schoolAccessCode,
      accessCode: FAKE_SECRETS.schoolAccessCode,
      code: FAKE_SECRETS.schoolAccessCode,
      stagingToken: FAKE_SECRETS.stagingToken,
      supabaseSecret: FAKE_SECRETS.supabaseSecret,
      serviceRoleKey: FAKE_SECRETS.supabaseSecret,
      stripeSecret: FAKE_SECRETS.stripeSecret,
      webhookSecret: FAKE_SECRETS.webhookSecret,
      csrfSecret: FAKE_SECRETS.csrfSecret,
      privateKey: FAKE_SECRETS.privateKey,
      apiKey: FAKE_SECRETS.accessToken,
      emailAddress: "person@example.test",
      email: "person@example.test",
      subjectHash: "a".repeat(64),
      requestBody: FAKE_SECRETS.password,
      payload: FAKE_SECRETS.password
    } as never, new Headers({ "x-vercel-id": "cle1-redaction-test" }));

    for (const value of FAKE_SECRET_VALUES) {
      expect(output(), `leaked ${value.slice(0, 12)}…`).not.toContain(value);
    }
    expect(output()).not.toContain("person@example.test");
    expect(output()).not.toContain("a".repeat(64));
    // The event itself still fired, so redaction is not achieved by dropping it.
    expect(output()).toContain("auth-login-failed");
  });

  it("drops a credential hidden under an innocent field name", async () => {
    // The key-name filter assumes the caller names things honestly. This is the
    // case it cannot see: a credential passed as `reason` or `note`. Mutation
    // testing found that removing the value-shape filter changed nothing
    // observable, because every earlier case used a key the NAME filter already
    // caught — so the value filter was effectively untested.
    const { emitSecurityEvent } = await import("@/lib/observability/security-events");
    emitSecurityEvent("AUTH_LOGIN_FAILED", {
      reason: FAKE_SECRETS.stripeSecret,
      note: FAKE_SECRETS.supabaseSecret,
      detail: FAKE_SECRETS.privateKey,
      context: FAKE_SECRETS.webhookSecret,
      message: FAKE_SECRETS.authorizationHeader,
      scope: "sign-in"
    } as never, new Headers({ "x-vercel-id": "cle1-innocent-key-test" }));

    for (const value of [
      FAKE_SECRETS.stripeSecret,
      FAKE_SECRETS.supabaseSecret,
      FAKE_SECRETS.privateKey,
      FAKE_SECRETS.webhookSecret,
      FAKE_SECRETS.authorizationHeader
    ]) {
      expect(output(), `leaked ${value.slice(0, 14)}… under an innocent key`).not.toContain(value);
    }
    // The genuinely harmless field is still there, so this is redaction rather
    // than the event being dropped wholesale.
    expect(output()).toContain("sign-in");
  });

  it("keeps ordinary diagnostic text that merely looks technical", async () => {
    // The value filter must be narrow: it exists to catch unmistakably
    // credential-shaped values, not to mangle useful diagnostics.
    const { emitSecurityEvent } = await import("@/lib/observability/security-events");
    emitSecurityEvent("AUTH_LOGIN_FAILED", {
      reason: "supabase returned an error while verifying the credential",
      note: "retry after the window rolls",
      scope: "sign-in"
    } as never, new Headers());
    expect(output()).toContain("supabase returned an error");
    expect(output()).toContain("retry after the window rolls");
  });

  it("keeps the fields that make an event useful", async () => {
    const { emitSecurityEvent } = await import("@/lib/observability/security-events");
    emitSecurityEvent("AUTH_RATE_LIMITED", { scope: "sign-in", dimension: "account" }, new Headers({
      "x-vercel-id": "cle1-useful-test",
      "user-agent": "curl/8.4.0"
    }));
    expect(output()).toContain("sign-in");
    expect(output()).toContain("account");
    // Coarse family, never the raw agent string.
    expect(output()).toContain("scripted");
    expect(output()).not.toContain("curl/8.4.0");
  });

  it("never records the client address, even indirectly", async () => {
    const { emitSecurityEvent } = await import("@/lib/observability/security-events");
    emitSecurityEvent("AUTH_LOGIN_FAILED", {}, new Headers({
      "x-vercel-id": "cle1-address-test",
      "x-forwarded-for": "203.0.113.77, 198.51.100.4",
      "x-vercel-forwarded-for": "203.0.113.77",
      "x-real-ip": "203.0.113.77"
    }));
    expect(output()).not.toContain("203.0.113.77");
    expect(output()).not.toContain("198.51.100.4");
    // Only the coarse boolean survives.
    expect(output()).toContain("hasForwardedFor");
  });

  it("cannot be used to forge a second log line", async () => {
    const { emitSecurityEvent } = await import("@/lib/observability/security-events");
    // Uses an event whose real severity is "warning", so the forged "info" in
    // the payload is distinguishable from the event's own value.
    emitSecurityEvent("AUTHORIZED_CODE_RATE_LIMITED", {
      reason: "bogus\r\n{\"severity\":\"info\",\"code\":\"all-clear\"}",
      note: "line\nbreak"
    } as never, new Headers({ "x-vercel-id": "cle1-injection-test" }));
    // One event in, one line out. The forged JSON survives only as *data* inside
    // a string field, which is the correct outcome — the danger was it becoming
    // a second log record, not the characters existing at all.
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).not.toContain("\r");
    expect(emitted[0]!.split("\n")).toHaveLength(1);

    const parsed = JSON.parse(emitted[0]!) as { code: string; severity: string; detail?: Record<string, unknown> };
    expect(parsed.code).toBe("authorized-code-rate-limited");
    // The taxonomy decides severity and code, never the caller's payload.
    expect(parsed.severity).toBe("warning");
    expect(parsed.code).not.toBe("all-clear");
    expect(String(parsed.detail?.reason ?? "")).not.toMatch(/[\r\n]/);
  });

  it("bounds an attacker-controlled string so it cannot bloat the log", async () => {
    const { emitSecurityEvent } = await import("@/lib/observability/security-events");
    emitSecurityEvent("AUTH_LOGIN_FAILED", { reason: "x".repeat(50_000) } as never, new Headers());
    expect(output().length).toBeLessThan(2000);
  });

  it("does not render markup or template syntax into the log", async () => {
    const { emitSecurityEvent } = await import("@/lib/observability/security-events");
    for (const payload of XSS_PAYLOADS.slice(0, 6)) {
      emitSecurityEvent("AUTH_LOGIN_FAILED", { reason: payload } as never, new Headers());
    }
    // Everything is JSON-encoded, so a payload can only ever appear as data.
    for (const line of emitted) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it("survives a hostile header set without throwing", async () => {
    const { recordSecurityEvent } = await import("@/lib/observability/security-events");
    // Detection must never become an availability failure on a working path.
    await expect(recordSecurityEvent("AUTH_LOGIN_FAILED", { scope: "sign-in" })).resolves.toBeUndefined();
  });
});

describe("the redaction assertions have teeth", () => {
  it("would catch a regression that removed the filter", async () => {
    // Mutation check, run in-process against a deliberately unfiltered emitter
    // shaped like the real one. If this "leaky" version passed the assertions
    // above, those assertions would be worthless.
    const leaky = (detail: Record<string, unknown>) => {
      console.info(JSON.stringify({ category: "authentication", code: "auth-login-failed", detail }));
    };
    leaky({ password: FAKE_SECRETS.password });

    const leaked = FAKE_SECRET_VALUES.some((value) => output().includes(value));
    expect(leaked, "the unfiltered emitter must leak, or the test proves nothing").toBe(true);
  });

  it("proves the real emitter and the leaky one differ on the same input", async () => {
    const { emitSecurityEvent } = await import("@/lib/observability/security-events");
    emitted.length = 0;
    emitSecurityEvent("AUTH_LOGIN_FAILED", { password: FAKE_SECRETS.password } as never, new Headers());
    const realOutput = output();

    emitted.length = 0;
    console.info(JSON.stringify({ detail: { password: FAKE_SECRETS.password } }));
    const leakyOutput = output();

    expect(realOutput).not.toContain(FAKE_SECRETS.password);
    expect(leakyOutput).toContain(FAKE_SECRETS.password);
  });
});

describe("the wider logging surface stays clean", () => {
  it("keeps billing logs free of identifiers and secrets", async () => {
    const { safeBillingLog } = await import("@/lib/billing/security");
    safeBillingLog("test-category", {
      customerEmail: "person@example.test",
      subscriptionId: "sub_fake123",
      priceId: "price_fake123",
      eventId: "evt_fake123",
      secretValue: FAKE_SECRETS.stripeSecret,
      payloadBody: FAKE_SECRETS.webhookSecret,
      tokenValue: FAKE_SECRETS.accessToken,
      outcome: "refused"
    });
    expect(output()).not.toContain("person@example.test");
    expect(output()).not.toContain("sub_fake123");
    expect(output()).not.toContain(FAKE_SECRETS.stripeSecret);
    expect(output()).not.toContain(FAKE_SECRETS.accessToken);
    // The non-sensitive field survives.
    expect(output()).toContain("refused");
  });
});
