import { afterEach, describe, expect, it } from "vitest";

import { normalizeTimestamp } from "../repositories/errors.js";
import { getSupabasePublicConfig } from "../supabase/public-config.js";
import { getAppBaseUrl, safeInternalRedirect } from "./safe-redirect.js";

const original = { ...process.env };
afterEach(() => { process.env = { ...original }; });

describe("authentication security boundaries", () => {
  it("allows only explicit internal callback destinations", () => {
    expect(safeInternalRedirect("/account")).toBe("/account");
    expect(safeInternalRedirect("/games")).toBe("/games");
    expect(safeInternalRedirect("/map-prep")).toBe("/map-prep");
    expect(safeInternalRedirect("/homework")).toBe("/homework");
    expect(safeInternalRedirect("/quizzes")).toBe("/quizzes");
    // Home became a valid post-authentication destination. It is an exact
    // same-origin path in the server-owned allowlist, not a wildcard, so the
    // near-misses below must still be refused.
    expect(safeInternalRedirect("/")).toBe("/");
    expect(safeInternalRedirect("/ ")).toBe("/teacher");
    expect(safeInternalRedirect("https://mathnexa.com/")).toBe("/teacher");
    expect(safeInternalRedirect("//mathnexa.com/")).toBe("/teacher");
    expect(safeInternalRedirect("/?next=https://attacker.example")).toBe("/teacher");
    expect(safeInternalRedirect("//attacker.example")).toBe("/teacher");
    expect(safeInternalRedirect("https://attacker.example")).toBe("/teacher");
    expect(safeInternalRedirect("javascript:alert(1)")).toBe("/teacher");
    expect(safeInternalRedirect("data:text/html,attack")).toBe("/teacher");
    expect(safeInternalRedirect("file:///etc/passwd")).toBe("/teacher");
    expect(safeInternalRedirect("%2Fgames")).toBe("/teacher");
    expect(safeInternalRedirect("/teacher?owner=foreign")).toBe("/teacher");
  });

  it("fails safely for missing or malformed public configuration", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    expect(getSupabasePublicConfig()).toBeNull();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "javascript:alert(1)";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "long-enough-but-invalid-provider-key";
    expect(getSupabasePublicConfig()).toBeNull();
  });

  it("restricts insecure application origins to local development", () => {
    process.env.APP_BASE_URL = "http://attacker.example";
    expect(getAppBaseUrl()).toBe("http://127.0.0.1:3000");
    process.env.APP_BASE_URL = "http://localhost:3100/path";
    expect(getAppBaseUrl()).toBe("http://localhost:3100");
  });

  it("normalizes provider timestamp formats before domain validation", () => {
    expect(normalizeTimestamp("2026-07-26 12:30:00+00")).toBe("2026-07-26T12:30:00.000Z");
    expect(normalizeTimestamp("malformed")).toBe("malformed");
  });
});
