/**
 * Configuration contract for the auth rate-limiter's keying material.
 *
 * The limiter fails closed in production, so how this secret resolves decides
 * whether customers can sign in. That makes the resolution order, the accepted
 * lengths and the whitespace handling security-critical in both directions:
 * too permissive and the key is weak, too strict and the product locks itself.
 */
import { describe, expect, it } from "vitest";

import { limiterSecretSource, resolveLimiterSecret, consumerAuthSubjectHash } from "@/lib/auth/rate-limit";
import { hasProductionIdentityConfiguration } from "@/lib/environment/production-platform";
import { ENVIRONMENT_BOOLEAN_VARIANTS } from "./fixtures/adversarial";

const DEDICATED = "d".repeat(48);
const LEGACY_ADMIN = "a".repeat(48);
const SERVICE = "s".repeat(48);

function environment(values: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return values as unknown as NodeJS.ProcessEnv;
}

describe("limiter secret resolution order", () => {
  it("prefers the dedicated secret, so migration needs no code change", () => {
    const all = environment({
      MVH_AUTH_RATE_LIMIT_SECRET: DEDICATED,
      MVH_ADMIN_CSRF_SECRET: LEGACY_ADMIN,
      SUPABASE_SECRET_KEY: SERVICE
    });
    expect(resolveLimiterSecret(all)).toBe(DEDICATED);
    expect(limiterSecretSource(all)).toBe("dedicated");
  });

  it("keeps working on the currently deployed production configuration", () => {
    // Production has no dedicated secret yet. Removing this fallback before the
    // owner sets one would take authentication down.
    const legacy = environment({ MVH_ADMIN_CSRF_SECRET: LEGACY_ADMIN, SUPABASE_SECRET_KEY: SERVICE });
    expect(resolveLimiterSecret(legacy)).toBe(LEGACY_ADMIN);
    expect(limiterSecretSource(legacy)).toBe("admin-csrf");
  });

  it("falls through to the service key, which is the floor", () => {
    const minimal = environment({ SUPABASE_SECRET_KEY: SERVICE });
    expect(resolveLimiterSecret(minimal)).toBe(SERVICE);
    expect(limiterSecretSource(minimal)).toBe("supabase-service");
  });

  it("reports honestly when nothing is configured", () => {
    expect(resolveLimiterSecret(environment({}))).toBeNull();
    expect(limiterSecretSource(environment({}))).toBe("none");
  });
});

describe("limiter secret validation", () => {
  it("rejects values that are too short to be keying material", () => {
    for (const tooShort of ["", " ", "short", "x".repeat(19)]) {
      expect(
        resolveLimiterSecret(environment({ MVH_AUTH_RATE_LIMIT_SECRET: tooShort })),
        `${JSON.stringify(tooShort)} must be refused`
      ).toBeNull();
    }
  });

  it("accepts exactly the length production identity already requires", () => {
    // This boundary is load-bearing. hasProductionIdentityConfiguration accepts
    // a 20-character SUPABASE_SECRET_KEY, so the limiter must too, or a valid
    // production deployment would fail closed and lock everyone out.
    const twenty = "s".repeat(20);
    const productionish = environment({
      NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
      SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "p".repeat(24),
      SUPABASE_SECRET_KEY: twenty,
      MVH_SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
      MVH_PRODUCTION_SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst"
    });
    expect(hasProductionIdentityConfiguration(productionish)).toBe(true);
    expect(resolveLimiterSecret(productionish)).toBe(twenty);
  });

  it("imposes no upper bound, because a ceiling would break the fail-closed invariant", () => {
    // This test previously asserted the opposite — that a value over 512
    // characters was rejected. That pinned a real defect: HMAC accepts a key of
    // any length, `hasProductionIdentityConfiguration()` imposes no maximum on
    // SUPABASE_SECRET_KEY, and the value comes from server configuration rather
    // than from a request. So a long key would satisfy production identity while
    // the limiter refused to resolve it, and under the fail-closed rule that
    // locks every customer out of a working system.
    for (const length of [513, 1024, 4096]) {
      expect(
        resolveLimiterSecret(environment({ MVH_AUTH_RATE_LIMIT_SECRET: "x".repeat(length) })),
        `a ${length}-character secret must still resolve`
      ).toBe("x".repeat(length));
    }
  });

  it("resolves for every environment production identity accepts, at any length", () => {
    // The invariant, stated directly: identity config and the limiter must never
    // disagree about whether a deployment is usable.
    for (const length of [20, 40, 128, 600]) {
      const key = "s".repeat(length);
      const productionish = environment({
        NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
        SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "p".repeat(24),
        SUPABASE_SECRET_KEY: key,
        MVH_SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
        MVH_PRODUCTION_SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst"
      });
      delete productionish.MVH_AUTH_RATE_LIMIT_SECRET;
      delete productionish.MVH_ADMIN_CSRF_SECRET;
      expect(hasProductionIdentityConfiguration(productionish)).toBe(true);
      expect(resolveLimiterSecret(productionish), `${length}-character key must resolve`).toBe(key);
    }
  });

  it("trims transport whitespace instead of being defeated by it", () => {
    // MN-09 was exactly this failure mode on a different variable.
    for (const wrapper of [" %s ", "\t%s\n", "\r\n%s\r\n", "\n\n%s\n\n"]) {
      const padded = wrapper.replace("%s", DEDICATED);
      expect(resolveLimiterSecret(environment({ MVH_AUTH_RATE_LIMIT_SECRET: padded }))).toBe(DEDICATED);
    }
  });

  it("does not treat a whitespace-only value as configuration", () => {
    for (const blank of ENVIRONMENT_BOOLEAN_VARIANTS.filter((v) => v.trim() === "")) {
      expect(
        resolveLimiterSecret(environment({ MVH_AUTH_RATE_LIMIT_SECRET: blank, SUPABASE_SECRET_KEY: SERVICE })),
        `${JSON.stringify(blank)} must fall through`
      ).toBe(SERVICE);
    }
  });
});

describe("the limiter secret stays server-side", () => {
  it("has no browser-visible twin anywhere in the source", () => {
    expect(
      resolveLimiterSecret(environment({ NEXT_PUBLIC_MVH_AUTH_RATE_LIMIT_SECRET: DEDICATED })),
      "a NEXT_PUBLIC lookalike must never satisfy the limiter"
    ).toBeNull();
  });

  it("never appears in a subject hash, only its digest", () => {
    const hash = consumerAuthSubjectHash(DEDICATED, "sign-in", "person@example.test", "203.0.113.10");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(DEDICATED);
    expect(hash).not.toContain("person@example.test");
    expect(hash).not.toContain("203.0.113.10");
  });

  it("reports its source as a label, never as a value or a length", () => {
    const label = limiterSecretSource(environment({ MVH_AUTH_RATE_LIMIT_SECRET: DEDICATED }));
    expect(["dedicated", "admin-csrf", "supabase-service", "none"]).toContain(label);
    expect(label).not.toContain(DEDICATED);
    expect(label).not.toMatch(/\d/);
  });

  it("changes every subject when the secret rotates, which is why rotation resets counters", () => {
    const before = consumerAuthSubjectHash(LEGACY_ADMIN, "sign-in", "person@example.test", "203.0.113.10");
    const after = consumerAuthSubjectHash(DEDICATED, "sign-in", "person@example.test", "203.0.113.10");
    expect(before).not.toBe(after);
  });
});
