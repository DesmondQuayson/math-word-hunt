/**
 * Credential-shape redaction, exercised against the real module.
 *
 * Two things make this file worth having.
 *
 * First, `CREDENTIAL_SHAPED_VALUE` is the layer that catches a secret arriving
 * under an innocent key name — the key-name filter cannot help when a caller
 * writes `{ note: "sk_live_..." }`. It had no direct coverage, so an edit that
 * broke the pattern would have been silent.
 *
 * Second, a cautionary note about how this was verified. An adversarial review
 * reported the pattern was non-functional, and a hand-written reproduction of it
 * appeared to confirm that — every case passed through unredacted. The
 * reproduction was wrong: shell quoting had turned `\\w` into `w`, so the copy
 * being tested was not the pattern that ships. Testing the actual module showed
 * it works. Hence this file imports the real emitter rather than restating the
 * regex: a security control must be tested as it ships, never as it is quoted.
 */
import { describe, expect, it } from "vitest";

import { emitSecurityEvent } from "@/lib/observability/security-events";

let probe = 0;

/**
 * Emits one event and returns whatever reached the log.
 *
 * Each call gets a UNIQUE correlation id, and that detail is load-bearing.
 * `emitOperationalEvent` de-duplicates on `category:code:correlationId` for five
 * seconds, so a shared id would suppress every emission after the first — and a
 * redaction assertion against an empty string passes for the wrong reason. The
 * first draft of this file did exactly that and reported nine green redaction
 * tests while logging nothing at all. A test that cannot observe the side effect
 * it asserts on is not a test.
 */
function logged(detail: Record<string, unknown>): string {
  probe += 1;
  const captured: string[] = [];
  const original = console.info;
  console.info = (line: string) => { captured.push(String(line)); };
  try {
    emitSecurityEvent(
      "AUTH_LOGIN_FAILED",
      detail as never,
      new Headers({ "x-vercel-id": `probe-${String(probe).padStart(6, "0")}abcdef` })
    );
  } finally {
    console.info = original;
  }
  // Guard the guard: if nothing was emitted, every assertion below would pass
  // vacuously, so fail loudly instead.
  if (captured.length === 0) throw new Error("no event was emitted — the assertion would have been vacuous");
  return captured.join(" ");
}

describe("a secret under an innocent key name is still redacted", () => {
  // `note` passes the key-name filter, so only the value-shape check can save it.
  const secretShapes: ReadonlyArray<readonly [string, string]> = [
    ["a Stripe live key", "sk_live_abcdefgh12345678"],
    ["a Stripe test key", "sk_test_abcdefgh12345678"],
    ["a Stripe restricted key", "rk_live_abcdefgh12345678"],
    ["a Stripe webhook secret", "whsec_abcdefgh12345678"],
    ["a Supabase secret key", "sb_secret_abcdefgh12345678"],
    ["a Supabase personal token", "sbp_0123456789abcdef01234567"],
    ["a JWT", "eyJhbGciOiJIUzI1NiIs.eyJzdWIiOiIxMjM0NTY3"],
    ["an Authorization value", "Bearer abcdefghijklmnop12345"],
    ["a PEM block", "-----BEGIN RSA PRIVATE KEY-----"]
  ];

  for (const [description, value] of secretShapes) {
    it(`drops ${description}`, () => {
      expect(logged({ note: value }), `${value.slice(0, 12)}… must not reach the log`).not.toContain(value);
    });
  }

  it("is not defeated by wrapping, padding or prefixing the value", () => {
    // The shapes a caller might produce without meaning to: a quoted value, a
    // value with surrounding whitespace, or one concatenated into a sentence.
    const core = "sk_live_abcdefgh12345678";
    for (const variant of [`"${core}"`, `   ${core}   `, `token=${core}`, `see ${core} for details`, `[${core}]`]) {
      expect(logged({ note: variant }), `variant ${JSON.stringify(variant)} must be dropped`).not.toContain(core);
    }
  });

  it("keeps ordinary operational values, so the events stay useful", () => {
    // Over-redaction is its own failure: an event with every field stripped
    // tells an operator nothing.
    const line = logged({ scope: "sign-in", attempt: 3, enforced: false, reason: "backend-error" });
    expect(line).toContain("sign-in");
    expect(line).toContain("backend-error");
    expect(line).toContain("auth-login-failed");
  });

  it("truncates a long value rather than letting it bloat the log", () => {
    const line = logged({ note: "x".repeat(5000) });
    expect(line.length).toBeLessThan(2000);
  });

  it("cannot be used to forge a second log line", () => {
    const line = logged({ note: "first\r\n{\"code\":\"forged-event\"}" });
    expect(line).not.toContain("forged-event\"}\n");
    expect(line.split("\n").length).toBe(1);
  });
});
