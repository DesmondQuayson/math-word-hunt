// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { schoolAccessRateLimitSubject } from "./rate-limit";

describe("authorized-code rate-limit identity", () => {
  it("creates a stable keyed pseudonymous subject without retaining network data", () => {
    const secret = "school-access-session-test-secret-32-bytes-minimum";
    const first = schoolAccessRateLimitSubject(secret, "203.0.113.8");
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).toBe(schoolAccessRateLimitSubject(secret, "203.0.113.8"));
    expect(first).not.toContain("203.0.113.8");
    expect(first).not.toBe(schoolAccessRateLimitSubject(secret, "203.0.113.9"));
  });

  it("takes no caller-controlled input, so a header change mints no new budget", () => {
    // The user agent used to be part of this key. It is chosen by the caller, so
    // it let an attacker reset the budget at will while doing nothing to
    // separate legitimate students, who share both address and browser.
    expect(schoolAccessRateLimitSubject.length).toBe(2);
  });

  it("keeps a classroom out of a lockout while still stopping a guessing attack", () => {
    // The gate is keyed on the network address and a school puts a whole cohort
    // behind one, so the budget has to survive a lesson's worth of fumbling.
    const source = readFileSync(resolve(__dirname, "./rate-limit.ts"), "utf8");
    const attempts = Number(/const maximumAttempts = (\d+)/.exec(source)?.[1]);
    const blockSeconds = Number(/const blockSeconds = (\d+) \* 60/.exec(source)?.[1]) * 60;
    expect(attempts).toBeGreaterThanOrEqual(20);
    // The database function refuses anything above 20.
    expect(attempts).toBeLessThanOrEqual(20);
    // Half an hour of lost lesson time was the old behaviour; do not go back.
    expect(blockSeconds).toBeLessThanOrEqual(15 * 60);
  });
});
