// @vitest-environment node

import { describe, expect, it } from "vitest";

import { schoolAccessRateLimitSubject } from "./rate-limit";

describe("authorized-code rate-limit identity", () => {
  it("creates a stable keyed pseudonymous subject without retaining network data", () => {
    const secret = "school-access-session-test-secret-32-bytes-minimum";
    const first = schoolAccessRateLimitSubject(secret, "203.0.113.8", "Test browser");
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).toBe(schoolAccessRateLimitSubject(secret, "203.0.113.8", "Test browser"));
    expect(first).not.toContain("203.0.113.8");
    expect(first).not.toContain("Test browser");
    expect(first).not.toBe(schoolAccessRateLimitSubject(secret, "203.0.113.9", "Test browser"));
  });
});
