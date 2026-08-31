/**
 * Standing security contract for the MathNexa platform.
 *
 * These are deliberately written against the real modules the application
 * ships, not against copies of their logic, so they keep failing if someone
 * later loosens the thing they protect. They are meant to outlive the hardening
 * phase that created them.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { buildContentSecurityPolicy, buildSecurityHeaders } from "@/lib/security/headers.mjs";
import { ACCESS_INTENT_DESTINATIONS, safeAccessIntentDestination, safeProductDestination } from "@/lib/auth/access-intent";
import { safeInternalRedirect } from "@/lib/auth/safe-redirect";
import { authorizedCodeMatches, getSchoolAccessConfiguration, normalizeAuthorizedCode } from "@/lib/school-access/config";
import { verifySchoolAccessToken, createSchoolAccessToken } from "@/lib/school-access/session";
import { decideAdminAccess } from "@/lib/admin/security";
import {
  consumerAuthSubjectHash,
  decideRateLimit,
  rateLimitingRequired,
  resolveLimiterSecret
} from "@/lib/auth/rate-limit";
import { hasProductionIdentityConfiguration } from "@/lib/environment/production-platform";

const repositoryRoot = resolve(__dirname, "../../../..");
const appRoot = resolve(__dirname, "../..");

function read(relativePath: string): string {
  return readFileSync(resolve(repositoryRoot, relativePath), "utf8");
}

/* ------------------------------------------------------------------ headers */

describe("security response headers", () => {
  const headers = buildSecurityHeaders({});
  const byKey = new Map(headers.map((entry) => [entry.key, entry.value]));

  it("ships every header the platform was missing", () => {
    for (const key of [
      "Content-Security-Policy",
      "Strict-Transport-Security",
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Referrer-Policy",
      "Permissions-Policy"
    ]) {
      expect(byKey.get(key), `${key} must be present`).toBeTruthy();
    }
  });

  it("blocks cross-origin framing, so sign-in and account cannot be clickjacked", () => {
    expect(byKey.get("Content-Security-Policy")).toContain("frame-ancestors 'self'");
    expect(byKey.get("X-Frame-Options")).toBe("SAMEORIGIN");
  });

  it("keeps a restrictive baseline and never allows a wildcard source", () => {
    const csp = byKey.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).not.toMatch(/(^|[ ;])\*/);
    expect(csp).not.toContain("unsafe-eval");
  });

  it("permits exactly the two Stripe hosts as external form destinations", () => {
    // Checkout and the billing portal are form posts that redirect off-site.
    // Narrower than 'self' alone would break payment; wider would hand an
    // injected form somewhere to exfiltrate to.
    const formAction = /form-action ([^;]+)/.exec(buildContentSecurityPolicy({}))?.[1]?.trim().split(/\s+/) ?? [];
    expect(new Set(formAction)).toEqual(new Set(["'self'", "https://checkout.stripe.com", "https://billing.stripe.com"]));
  });

  it("asserts HSTS across subdomains without silently committing to preload", () => {
    const hsts = byKey.get("Strict-Transport-Security") ?? "";
    expect(hsts).toContain("includeSubDomains");
    expect(hsts).toMatch(/max-age=\d{7,}/);
    // preload is a one-way door and stays an explicit owner decision.
    expect(hsts).not.toContain("preload");
  });

  it("denies powerful device permissions by default", () => {
    const permissions = byKey.get("Permissions-Policy") ?? "";
    for (const feature of ["camera=()", "microphone=()", "geolocation=()", "payment=()", "usb=()"]) {
      expect(permissions).toContain(feature);
    }
  });

  it("allows the browser Supabase client only when one is configured", () => {
    expect(buildContentSecurityPolicy({})).toContain("connect-src 'self'");
    const withSupabase = buildContentSecurityPolicy({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co" });
    expect(withSupabase).toContain("https://example.supabase.co");
    expect(withSupabase).toContain("wss://example.supabase.co");
  });

  it("is actually wired into the shipped Next.js configuration", () => {
    const config = readFileSync(resolve(appRoot, "next.config.mjs"), "utf8");
    expect(config).toContain("buildSecurityHeaders");
    expect(config).toMatch(/source:\s*"\/:path\*"/);
    // The framework banner must not be advertised.
    expect(config).toContain("poweredByHeader: false");
  });
});

/* ---------------------------------------------------------------- redirects */

describe("redirect safety", () => {
  const hostile = [
    "//evil.com",
    "https://evil.com",
    "http://evil.com",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "\\\\evil.com",
    "/\\evil.com",
    "/%5C%5Cevil.com",
    "%2F%2Fevil.com",
    "%252F%252Fevil.com",
    "/../../evil",
    "/games/../../evil",
    "https:/\\evil.com",
    "/\r\nLocation: https://evil.com",
    "/games#@evil.com",
    "/games?next=https://evil.com",
    "//evil.com/games",
    "/\u0000/evil",
    "/ /evil",
    "http://mathnexa.com.evil.com"
  ];

  it("refuses every hostile destination on the post-auth callback", () => {
    for (const value of hostile) {
      expect(safeInternalRedirect(value), `must refuse ${value}`).toBe("/teacher");
    }
  });

  it("refuses every hostile destination on the access-intent journey", () => {
    for (const value of hostile) {
      expect(safeAccessIntentDestination(value), `must refuse ${value}`).toBe("/");
      expect(safeProductDestination(value), `must refuse ${value}`).toBe("/games");
    }
  });

  it("still allows the genuine first-party destinations", () => {
    for (const destination of ACCESS_INTENT_DESTINATIONS) {
      expect(safeAccessIntentDestination(destination)).toBe(destination);
    }
    expect(safeInternalRedirect("/teacher")).toBe("/teacher");
    expect(safeInternalRedirect("/update-password")).toBe("/update-password");
  });

  it("is an exact allowlist rather than a parser, so encoding tricks cannot apply", () => {
    // A prefix of an allowed value must not be accepted.
    expect(safeInternalRedirect("/teacher/../admin")).toBe("/teacher");
    expect(safeInternalRedirect("/teacher ")).toBe("/teacher");
    expect(safeInternalRedirect("/TEACHER")).toBe("/teacher");
  });
});

/* --------------------------------------------------- paid access/entitlement */

describe("authorized-code access cannot be forged or extracted", () => {
  const secret = "school-access-session-secret-that-is-long-enough";
  const configured = { MATHNEXA_SCHOOL_ACCESS_CODE: "AESM", MATHNEXA_SCHOOL_ACCESS_SESSION_SECRET: secret };

  it("never reads the code from a browser-public variable", () => {
    expect(getSchoolAccessConfiguration({
      NEXT_PUBLIC_MATHNEXA_SCHOOL_ACCESS_CODE: "AESM",
      MATHNEXA_SCHOOL_ACCESS_SESSION_SECRET: secret
    })).toBeNull();
    expect(getSchoolAccessConfiguration(configured)).not.toBeNull();
  });

  it("compares the code in constant time and rejects near misses", () => {
    const configuration = getSchoolAccessConfiguration(configured)!;
    expect(authorizedCodeMatches("AESM", configuration)).toBe(true);
    expect(authorizedCodeMatches("aesm", configuration)).toBe(true);
    for (const wrong of ["AES", "AESM1", "", "AESN", "A", "x".repeat(200)]) {
      expect(authorizedCodeMatches(wrong, configuration), `must refuse ${wrong}`).toBe(false);
    }
    expect(normalizeAuthorizedCode(null)).toBe("");
  });

  it("refuses a session token that was tampered with or signed by another key", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const token = createSchoolAccessToken(secret, now)!;
    const [payload, signature] = token.split(".");
    expect(verifySchoolAccessToken(token, secret, now)).not.toBeNull();
    expect(verifySchoolAccessToken(token, "a-completely-different-secret-value-32", now)).toBeNull();
    // Flip a leading signature character. The trailing base64url character
    // encodes only partial bits, so several values decode to the same bytes;
    // mutating it would not actually be a tampered signature.
    expect(verifySchoolAccessToken(`${payload}.${signature![0] === "A" ? "B" : "A"}${signature!.slice(1)}`, secret, now)).toBeNull();
    // A re-signed but different payload must not be accepted under the old signature.
    const swapped = Buffer.from(JSON.stringify({ v: 1, sid: "22222222-2222-2222-2222-222222222222", iat: 0, exp: 43200 }), "utf8").toString("base64url");
    expect(verifySchoolAccessToken(`${swapped}.${signature}`, secret, now)).toBeNull();
    // An unsigned "alg:none" style payload must not be accepted.
    const forged = Buffer.from(JSON.stringify({ v: 1, sid: "11111111-1111-1111-1111-111111111111", iat: 0, exp: 43200 }), "utf8").toString("base64url");
    expect(verifySchoolAccessToken(`${forged}.`, secret, now)).toBeNull();
  });

  it("expires the session rather than trusting a client-supplied lifetime", () => {
    const issued = new Date("2026-01-01T00:00:00Z");
    const token = createSchoolAccessToken(secret, issued)!;
    const afterExpiry = new Date(issued.getTime() + 13 * 60 * 60 * 1000);
    expect(verifySchoolAccessToken(token, secret, afterExpiry)).toBeNull();
  });
});

describe("entitlement authority stays on the server", () => {
  it("computes access only in server-only modules", () => {
    for (const path of [
      "apps/platform-web/lib/game-access/server.ts",
      "apps/platform-web/lib/access/server.ts",
      "apps/platform-web/lib/school-access/config.ts",
      "apps/platform-web/lib/school-access/session.ts",
      "apps/platform-web/lib/auth/rate-limit.ts",
      "apps/platform-web/lib/admin/session.ts",
      "apps/platform-web/lib/admin/security.ts",
      "apps/platform-web/lib/staging-access/server.ts",
      "apps/platform-web/lib/supabase/service.ts"
    ]) {
      expect(read(path).startsWith("import \"server-only\""), `${path} must be server-only`).toBe(true);
    }
  });

  it("never derives entitlement from client-controlled storage", () => {
    const source = read("apps/platform-web/lib/game-access/server.ts") + read("apps/platform-web/lib/access/server.ts");
    for (const sink of ["localStorage", "sessionStorage", "searchParams", "document.cookie"]) {
      expect(source, `entitlement must not read ${sink}`).not.toContain(sink);
    }
  });
});

/* --------------------------------------------------------------------- RBAC */

describe("admin authorization decisions", () => {
  const admin = { id: "admin-1", revoked_at: null, mfa_enrolled: true } as never;
  const session = {
    admin_user_id: "admin-1",
    revoked_at: null,
    ended_at: null,
    assurance_level: "aal2",
    expires_at: new Date(Date.now() + 600_000).toISOString()
  } as never;
  const authorized = {
    featureEnabled: true,
    infrastructureAvailable: true,
    authenticated: true,
    emailVerified: true,
    assuranceLevel: "aal2",
    admin,
    session,
    sessionTokenValid: true
  };

  it("authorizes only a verified, MFA-bound admin with a live bound session", () => {
    expect(decideAdminAccess(authorized).state).toBe("authorized");
  });

  it("refuses every single-condition downgrade", () => {
    const downgrades: ReadonlyArray<[string, Record<string, unknown>, string]> = [
      ["feature disabled", { featureEnabled: false }, "disabled"],
      ["anonymous", { authenticated: false }, "unauthenticated"],
      ["unverified email", { emailVerified: false }, "unauthenticated"],
      ["not an admin", { admin: null }, "non-admin"],
      ["revoked admin", { admin: { ...(admin as object), revoked_at: "2026-01-01T00:00:00Z" } }, "non-admin"],
      ["no MFA enrolment", { admin: { ...(admin as object), mfa_enrolled: false } }, "mfa-required"],
      ["only aal1", { assuranceLevel: "aal1" }, "mfa-required"],
      ["no session cookie", { sessionTokenValid: false }, "reauth-required"],
      ["session of another admin", { session: { ...(session as object), admin_user_id: "admin-2" } }, "reauth-required"],
      ["revoked session", { session: { ...(session as object), revoked_at: "2026-01-01T00:00:00Z" } }, "reauth-required"],
      ["aal1 session", { session: { ...(session as object), assurance_level: "aal1" } }, "reauth-required"],
      ["expired session", { session: { ...(session as object), expires_at: new Date(Date.now() - 1000).toISOString() } }, "reauth-required"]
    ];
    for (const [label, patch, expected] of downgrades) {
      expect(decideAdminAccess({ ...authorized, ...patch } as never).state, label).toBe(expected);
    }
  });
});

describe("privileged route surface", () => {
  const adminRoutes = [
    "analytics/export", "audit/export", "cms/save", "cms/status", "games/archive",
    "games/catalog/rollback", "games/catalog/status", "games/catalog/update", "games/external",
    "games/rollback", "games/status", "games/upload", "map-prep/save", "map-prep/status",
    "media/archive", "media/status", "media/upload", "operations/flag", "operations/retention",
    "resources/archive", "resources/convert-topic", "resources/publish", "resources/replace",
    "resources/revise", "resources/rollback", "resources/status", "resources/upload",
    "taxonomy/create", "taxonomy/status", "users/action", "users/note"
  ];

  it("gates every admin endpoint on an authorized admin session", () => {
    for (const route of adminRoutes) {
      const source = read(`apps/platform-web/app/admin/${route}/route.ts`);
      expect(source, `${route} must check admin access`).toContain("inspectAdminAccess");
      // Several handlers ship minified, so match without depending on spacing.
      expect(source, `${route} must refuse a non-authorized state`).toMatch(/state\s*!==\s*"authorized"/);
    }
  });

  it("requires a CSRF token on every admin mutation", () => {
    for (const route of adminRoutes.filter((value) => !value.endsWith("export"))) {
      const source = read(`apps/platform-web/app/admin/${route}/route.ts`);
      if (!source.includes("export async function POST")) continue;
      expect(source, `${route} must validate CSRF`).toContain("validateAdminMutationCsrf");
    }
  });

  it("gates paid product delivery on a server-side entitlement check", () => {
    for (const route of [
      "apps/platform-web/app/game/runtime/[...asset]/route.ts",
      "apps/platform-web/app/games/[resourceId]/runtime/route.ts",
      "apps/platform-web/app/resources/[resourceId]/download/route.ts"
    ]) {
      expect(read(route), `${route} must consult entitlement`).toContain("getGameAccessView");
    }
    for (const route of [
      "apps/platform-web/app/games/[resourceId]/launch/route.ts",
      "apps/platform-web/app/games/[resourceId]/play/route.ts"
    ]) {
      expect(read(route), `${route} must consult entitlement`).toContain("requireProductAccess");
    }
  });
});

/* ------------------------------------------------------------- rate limiting */

describe("credential rate limiting", () => {
  it("throttles sign-in, sign-up and password recovery", () => {
    const source = read("apps/platform-web/app/auth-actions.ts");
    for (const scope of ["sign-in", "sign-up", "password-recovery"]) {
      expect(source, `${scope} must be throttled`).toContain(`consumeConsumerAuthAttempt("${scope}"`);
    }
  });

  it("throttles before the password is ever checked", () => {
    const source = read("apps/platform-web/app/auth-actions.ts");
    const throttle = source.indexOf('consumeConsumerAuthAttempt("sign-in"');
    const verify = source.indexOf("signInWithPassword");
    expect(throttle).toBeGreaterThan(-1);
    expect(throttle).toBeLessThan(verify);
  });

  it("keeps the authorized-code gate throttled", () => {
    expect(read("apps/platform-web/app/school-access-actions.ts")).toContain("consumeSchoolAccessAttempt");
  });

  it("separates each surface so one cannot exhaust another's budget", () => {
    const secret = "x".repeat(40);
    const hashes = new Set([
      consumerAuthSubjectHash(secret, "sign-in", "a@example.com", "1.2.3.4", "ua"),
      consumerAuthSubjectHash(secret, "sign-up", "a@example.com", "1.2.3.4", "ua"),
      consumerAuthSubjectHash(secret, "password-recovery", "a@example.com", "1.2.3.4", "ua")
    ]);
    expect(hashes.size).toBe(3);
  });

  it("pseudonymizes the subject rather than storing the address", () => {
    const hash = consumerAuthSubjectHash("x".repeat(40), "sign-in", "person@example.com", "1.2.3.4", "ua");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("person");
    expect(hash).not.toContain("1.2.3.4");
  });

  it("resolves keying material without depending on the admin console being enabled", () => {
    expect(resolveLimiterSecret({ SUPABASE_SECRET_KEY: "s".repeat(40) } as NodeJS.ProcessEnv)).toBe("s".repeat(40));
    expect(resolveLimiterSecret({} as NodeJS.ProcessEnv)).toBeNull();
    expect(resolveLimiterSecret({ SUPABASE_SECRET_KEY: "short" } as NodeJS.ProcessEnv)).toBeNull();
    // A dedicated secret must win over the borrowed fallbacks.
    expect(resolveLimiterSecret({
      MVH_AUTH_RATE_LIMIT_SECRET: "d".repeat(40),
      SUPABASE_SECRET_KEY: "s".repeat(40)
    } as NodeJS.ProcessEnv)).toBe("d".repeat(40));
  });

  it("denies once the budget is spent rather than passing the attempt through", () => {
    expect(decideRateLimit({
      productionPlatform: true, limiterConfigured: true, backendFailed: false, withinBudget: false
    })).toBe("throttled");
  });

  it("keeps every budget within the bounds the database function accepts", async () => {
    // consume_admin_auth_rate_limit raises unless attempts are 1..20 and the
    // window and block are 30..3600 / 30..86400 seconds. A budget outside those
    // bounds would throw at runtime and, under the policy above, deny sign-in.
    const source = read("apps/platform-web/lib/auth/rate-limit.ts");
    const budgets = [...source.matchAll(/maxAttempts: (\d+), windowSeconds: (\d+), blockSeconds: (\d+)/g)];
    expect(budgets.length).toBe(3);
    for (const [, attempts, window, block] of budgets) {
      expect(Number(attempts)).toBeGreaterThanOrEqual(1);
      expect(Number(attempts)).toBeLessThanOrEqual(20);
      expect(Number(window)).toBeGreaterThanOrEqual(30);
      expect(Number(window)).toBeLessThanOrEqual(3600);
      expect(Number(block)).toBeGreaterThanOrEqual(30);
      expect(Number(block)).toBeLessThanOrEqual(86400);
    }
  });

  it("does not leak whether an address exists when recovery is throttled", () => {
    const source = read("apps/platform-web/app/auth-actions.ts");
    // The throttled branch of recovery must return the same neutral success
    // copy as the unthrottled one, or the limiter becomes an enumeration oracle.
    const throttled = /consumeConsumerAuthAttempt\("password-recovery"[^}]*\}/.exec(source)?.[0] ?? "";
    expect(throttled).toContain("recoveryResponse");
    expect(throttled).toContain('status: "success"');
  });
});

/* ------------------------------------- production rate-limiter availability */

describe("production rate-limiter contract", () => {
  const production = { productionPlatform: true } as const;
  const development = { productionPlatform: false } as const;

  it("PRODUCTION: limiter missing -> authentication denied, never allowed", () => {
    expect(decideRateLimit({
      ...production, limiterConfigured: false, backendFailed: false, withinBudget: false
    })).toBe("unavailable");
    // The dangerous regression is specifically "allowed". Assert it directly.
    expect(decideRateLimit({
      ...production, limiterConfigured: false, backendFailed: false, withinBudget: true
    })).not.toBe("allowed");
  });

  it("PRODUCTION: limiter configured but backend fails -> authentication denied", () => {
    expect(decideRateLimit({
      ...production, limiterConfigured: true, backendFailed: true, withinBudget: false
    })).toBe("unavailable");
    expect(decideRateLimit({
      ...production, limiterConfigured: true, backendFailed: true, withinBudget: true
    })).not.toBe("allowed");
  });

  it("PRODUCTION: limiter healthy -> proceeds according to the budget", () => {
    expect(decideRateLimit({
      ...production, limiterConfigured: true, backendFailed: false, withinBudget: true
    })).toBe("allowed");
    expect(decideRateLimit({
      ...production, limiterConfigured: true, backendFailed: false, withinBudget: false
    })).toBe("throttled");
  });

  it("DEVELOPMENT: missing limiter infrastructure follows the approved fallback", () => {
    expect(decideRateLimit({
      ...development, limiterConfigured: false, backendFailed: false, withinBudget: false
    })).toBe("allowed");
    expect(decideRateLimit({
      ...development, limiterConfigured: true, backendFailed: true, withinBudget: false
    })).toBe("allowed");
    // A healthy limiter is still enforced outside production.
    expect(decideRateLimit({
      ...development, limiterConfigured: true, backendFailed: false, withinBudget: false
    })).toBe("throttled");
  });

  it("there is no input combination where production silently fails open", () => {
    for (const limiterConfigured of [true, false]) {
      for (const backendFailed of [true, false]) {
        for (const withinBudget of [true, false]) {
          const verdict = decideRateLimit({ productionPlatform: true, limiterConfigured, backendFailed, withinBudget });
          if (!limiterConfigured || backendFailed) {
            expect(verdict, `configured=${limiterConfigured} failed=${backendFailed}`).toBe("unavailable");
          }
        }
      }
    }
  });

  it("decides production from trusted server configuration, never a browser value", () => {
    expect(rateLimitingRequired({ MVH_APP_ENVIRONMENT: "production-platform" } as NodeJS.ProcessEnv)).toBe(true);
    expect(rateLimitingRequired({ MVH_APP_ENVIRONMENT: "local" } as NodeJS.ProcessEnv)).toBe(false);
    expect(rateLimitingRequired({} as NodeJS.ProcessEnv)).toBe(false);
    // The browser-visible twin must not be able to turn the requirement on or off.
    expect(rateLimitingRequired({
      NEXT_PUBLIC_MVH_APP_ENVIRONMENT: "production-platform"
    } as NodeJS.ProcessEnv)).toBe(false);
    expect(rateLimitingRequired({
      MVH_APP_ENVIRONMENT: "production-platform",
      NEXT_PUBLIC_MVH_APP_ENVIRONMENT: "local"
    } as NodeJS.ProcessEnv)).toBe(true);
    expect(read("apps/platform-web/lib/auth/rate-limit.ts")).not.toMatch(
      /source\.NEXT_PUBLIC_[A-Z_]*\s*===/
    );
  });

  it("never demands more configuration than production identity already requires", () => {
    // This is the availability guarantee behind failing closed. Any environment
    // good enough to run production authentication must also yield a limiter
    // secret, or fail-closed would lock every customer out of a working system.
    const productionEnv = {
      NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
      SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "p".repeat(24),
      // Exactly the 20-character floor hasProductionIdentityConfiguration accepts.
      SUPABASE_SECRET_KEY: "s".repeat(20),
      MVH_SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
      MVH_PRODUCTION_SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst"
    } as NodeJS.ProcessEnv;
    expect(hasProductionIdentityConfiguration(productionEnv)).toBe(true);
    expect(resolveLimiterSecret(productionEnv)).not.toBeNull();
  });

  it("reports a privacy-safe event when the limiter is unavailable", () => {
    const source = read("apps/platform-web/lib/auth/rate-limit.ts");
    expect(source).toContain("rate-limiter-unavailable");
    expect(source).toContain('category: "authentication"');
    // It must not route through the helper that needs the very client that is
    // missing in the case being reported. Match a call, not the mention of it
    // in the comment that explains this constraint.
    expect(source).not.toMatch(/\brecordAggregateSignal\s*\(/);
    expect(source).not.toMatch(/import[^;]*recordAggregateSignal/);
    // Only non-sensitive fields may be attached.
    const detail = /detail: \{([^}]*)\}/.exec(source)?.[1] ?? "";
    expect(detail).not.toMatch(/password|token|secret|cookie|authorization|email|identifier|subject|hash/i);
  });

  it("keeps the unavailable response generic and free of internals", () => {
    const source = read("apps/platform-web/app/auth-actions.ts");
    const message = /const temporarilyUnavailable[^;]*?message: "([^"]+)"/s.exec(source)?.[1] ?? "";
    expect(message.length).toBeGreaterThan(0);
    expect(message).not.toMatch(
      /supabase|rpc|rate.?limit|postgres|database|consume_|service|token|secret|env|MVH_|SUPABASE_/i
    );
    // Every surface must use that one shared message, so none of them can drift
    // into revealing something the others do not.
    expect((source.match(/return temporarilyUnavailable;/g) ?? []).length).toBe(3);
  });

  it("does not distinguish whether the account exists when denying", () => {
    const source = read("apps/platform-web/app/auth-actions.ts");
    // The unavailable branch is taken before any credential or account lookup,
    // so its response cannot depend on the submitted address.
    for (const call of ["sign-in", "sign-up", "password-recovery"]) {
      const index = source.indexOf(`consumeConsumerAuthAttempt("${call}"`);
      expect(index, `${call} must consult the limiter`).toBeGreaterThan(-1);
    }
    expect(source.indexOf('consumeConsumerAuthAttempt("sign-in"'))
      .toBeLessThan(source.indexOf("signInWithPassword"));
    expect(source.indexOf('consumeConsumerAuthAttempt("password-recovery"'))
      .toBeLessThan(source.indexOf("resetPasswordForEmail"));
  });
});

/* -------------------------------------------------------- secrets & leakage */

describe("secret containment", () => {
  it("exposes no privileged value through a browser-public variable", () => {
    const forbidden = /NEXT_PUBLIC_[A-Z_]*(SECRET|SERVICE|PRIVATE|TOKEN|PASSWORD|ACCESS_CODE)/;
    for (const path of [
      "apps/platform-web/lib/supabase/public-config.ts",
      "apps/platform-web/lib/school-access/config.ts",
      "apps/platform-web/lib/staging-access/server.ts",
      "apps/platform-web/lib/admin/config.ts",
      "apps/platform-web/lib/auth/rate-limit.ts"
    ]) {
      expect(read(path), `${path} must not expose a public secret`).not.toMatch(forbidden);
    }
  });

  it("never logs a credential, cookie or authorization header", () => {
    const source = read("apps/platform-web/lib/billing/security.ts");
    expect(source).toContain("safeBillingLog");
    // The redaction filter must still cover the sensitive key names.
    for (const key of ["email", "secret", "payload", "token"]) {
      expect(source).toContain(key);
    }
  });
});

/* ------------------------------------------------------------------ staging */

describe("staging gate fails closed", () => {
  const token = "A".repeat(43);
  const enabled = {
    MVH_APP_ENVIRONMENT: "production-platform",
    MVH_STAGING_ACCESS_REQUIRED: "true",
    MVH_STAGING_ACCESS_TOKEN: token
  };

  it("cannot be unlocked without the exact bearer credential", async () => {
    const { isValidStagingBearerAuthorization, isValidStagingAccessCookie, createStagingAccessCookieValue } =
      await import("@/lib/staging-access/server");
    expect(isValidStagingBearerAuthorization(`Bearer ${token}`, enabled)).toBe(true);
    for (const wrong of [null, "", "Bearer", `Bearer ${"B".repeat(43)}`, `Basic ${token}`, `Bearer ${token}x`]) {
      expect(isValidStagingBearerAuthorization(wrong, enabled), `must refuse ${wrong}`).toBe(false);
    }
    const cookie = createStagingAccessCookieValue(enabled);
    expect(cookie).not.toContain(token);
    expect(isValidStagingAccessCookie(cookie ?? undefined, enabled)).toBe(true);
    expect(isValidStagingAccessCookie("v1.forged", enabled)).toBe(false);
  });

  it("locks the whole site apart from the bootstrap, the webhook and signed asset tickets", () => {
    const source = read("apps/platform-web/proxy.ts");
    expect(source).toContain("isStagingAccessRequired()");
    expect(source).toContain("isValidStagingAccessCookie");
    expect(source).toContain("stagingAccessNotFoundResponse");
    expect(source).toContain("STAGING_ACCESS_BOOTSTRAP_PATH");
  });

  it("never lets production inherit the staging bypass", async () => {
    const { isStagingAccessRequired } = await import("@/lib/staging-access/server");
    // The lock is only meaningful on the isolated staging contract, and a
    // missing flag must never be read as "unlocked production".
    expect(isStagingAccessRequired({ ...enabled, MVH_STAGING_ACCESS_REQUIRED: "false" })).toBe(false);
    expect(isStagingAccessRequired({ ...enabled, MVH_APP_ENVIRONMENT: "production-public" })).toBe(false);
    expect(isStagingAccessRequired({})).toBe(false);
  });

  it("uses a __Host- prefixed cookie so it cannot be set by a sibling host", async () => {
    const { STAGING_ACCESS_COOKIE_NAME } = await import("@/lib/staging-access/server");
    expect(STAGING_ACCESS_COOKIE_NAME.startsWith("__Host-")).toBe(true);
  });
});

/* ------------------------------------------------------------------ cookies */

describe("cookie hardening", () => {
  it("marks every security-sensitive cookie httpOnly", () => {
    for (const path of [
      "apps/platform-web/lib/admin/session.ts",
      "apps/platform-web/lib/school-access/session.ts",
      "apps/platform-web/app/api/internal/staging-access/bootstrap/route.ts"
    ]) {
      const source = read(path);
      expect(source, `${path} must set httpOnly`).toContain("httpOnly: true");
    }
  });

  it("scopes the admin session cookie tightly", () => {
    const source = read("apps/platform-web/lib/admin/session.ts");
    expect(source).toContain('sameSite: "strict"');
    expect(source).toContain('path: "/admin"');
  });

  it("keeps the staging cookie secure and host-locked", () => {
    const source = read("apps/platform-web/app/api/internal/staging-access/bootstrap/route.ts");
    expect(source).toContain("secure: true");
    expect(source).toContain("STAGING_ACCESS_COOKIE_NAME");
  });
});

/* --------------------------------------------------------------------- XSS */

describe("injection surface", () => {
  it("renders no raw HTML anywhere in the application", () => {
    const offenders: string[] = [];
    const walk = (directory: string) => {
      for (const entry of readdirSyncSafe(directory)) {
        const full = resolve(directory, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === ".next") continue;
          walk(full);
        } else if (/\.tsx?$/.test(entry.name)) {
          const source = readFileSync(full, "utf8");
          if (/dangerouslySetInnerHTML|\.innerHTML\s*=|document\.write\(/.test(source)) offenders.push(full);
        }
      }
    };
    walk(resolve(appRoot, "app"));
    walk(resolve(appRoot, "components"));
    walk(resolve(appRoot, "lib"));
    expect(offenders).toEqual([]);
  });

  it("produces a syntactically safe Content-Disposition for hostile filenames", () => {
    // The exact expression the download routes apply, exercised against the
    // characters that would otherwise escape the quoted filename parameter or
    // append an attacker-chosen header.
    const sanitize = (name: string) => name.replace(/["\\\r\n]/g, "");
    const hostile = [
      'invoice".pdf',
      'a"; filename="evil.exe',
      "report\r\nX-Injected: yes",
      "report\r\n\r\n<script>alert(1)</script>",
      'x"\r\nSet-Cookie: session=stolen',
      "back\\slash.pdf",
      "../../etc/passwd",
      "..\\..\\windows\\system32",
      'quote"and\\backslash\r\n.pdf'
    ];
    for (const name of hostile) {
      const header = `attachment; filename="${sanitize(name)}"`;
      // No CR/LF, so no additional header can be introduced.
      expect(header, `must not allow header injection via ${JSON.stringify(name)}`).not.toMatch(/[\r\n]/);
      // Exactly the two delimiting quotes survive, so the parameter cannot be closed early.
      expect((header.match(/"/g) ?? []).length, `unbalanced quotes for ${JSON.stringify(name)}`).toBe(2);
      expect(header).not.toContain("\\");
      // The header still parses as a single attachment disposition.
      expect(header).toMatch(/^attachment; filename="[^"\r\n\\]*"$/);
    }
    // A benign filename is preserved rather than mangled.
    expect(sanitize("Grade 7 Unit 3 Answer Key.pdf")).toBe("Grade 7 Unit 3 Answer Key.pdf");
  });

  it("sanitizes every filename interpolated into a Content-Disposition header", () => {
    for (const path of [
      "apps/platform-web/app/resources/[resourceId]/download/route.ts",
      "apps/platform-web/app/admin/resources/[resourceId]/files/[fileId]/route.ts",
      "apps/platform-web/app/media/[assetId]/route.ts"
    ]) {
      const source = read(path);
      const disposition = /Content-Disposition[^\n]*/.exec(source)?.[0] ?? "";
      if (!disposition.includes("filename")) continue;
      expect(disposition, `${path} must strip quotes and CRLF from the filename`).toContain('replace(/["\\\\\\r\\n]/g');
    }
  });
});

function readdirSyncSafe(directory: string) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readdirSync } = require("node:fs") as typeof import("node:fs");
  try {
    return readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}
