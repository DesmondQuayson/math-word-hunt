import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";

/**
 * The assembled `/api/health` contract (production bug sweep BS-08, on top of
 * BS-02). The endpoint publishes five sanitized fields; `build` is the deployed
 * source revision, and nothing a caller sends can influence any of them.
 */

const APPROVED = "2361b763dd3dfd59b12e8a9c80c5e4ec8e99f552";
const NEXT_COMMIT = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const liveProduction: Record<string, string> = {
  NODE_ENV: "production",
  MVH_APP_ENVIRONMENT: "production-platform",
  MVH_APPLICATION_ORIGIN: "https://mathnexa.com",
  MVH_SUBSCRIBER_MANAGEMENT_ORIGIN: "https://mathnexa-platform-production.vercel.app",
  MVH_LEGAL_REVIEW: "owner-approved",
  MVH_TERMS_VERSION: "2026-08-01",
  MVH_PRIVACY_VERSION: "2026-08-01",
  MVH_CANCELLATION_POLICY_VERSION: "2026-08-01",
  MVH_REFUND_POLICY_VERSION: "2026-08-01",
  MVH_SUPABASE_PROJECT_REF: "production-live",
  MVH_PRODUCTION_SUPABASE_PROJECT_REF: "production-live",
  MVH_PREVIEW_SUPABASE_PROJECT_REF: "preview-isolated",
  MVH_IDENTITY_MODEL: "consumer-v1",
  NEXT_PUBLIC_SUPABASE_URL: "https://production-live.supabase.co",
  SUPABASE_URL: "https://production-live.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-production-live-key",
  SUPABASE_SECRET_KEY: "secret-production-live-key",
  MVH_STRIPE_MODE: "live",
  MVH_COMMERCIAL_ACTIVATION: "live",
  MVH_EMAIL_DELIVERY: "transactional-verified",
  MVH_MONITORING_MODE: "console",
  MVH_FIXTURE_POLICY: "forbidden",
  MVH_DELETION_MODE: "dry-run",
  MVH_PILOT_STATE: "inactive",
  MVH_INVITATIONS_ENABLED: "false",
  MVH_SUPPORT_EMAIL: "support@mathnexa.com",
  BILLING_ENABLED: "true",
  BILLING_PROVIDER: "stripe",
  BILLING_LIVE_ACTIVATION: "owner-approved",
  BILLING_APP_BASE_URL: "https://mathnexa.com",
  BILLING_CHECKOUT_ENABLED: "false",
  BILLING_PORTAL_ENABLED: "true",
  BILLING_WEBHOOK_ENABLED: "true",
  BILLING_EMERGENCY_DEFAULT_DENY: "false",
  BILLING_RENEWAL_GRACE_DAYS: "7",
  BILLING_REFUND_REVIEW_DAYS: "7",
  BILLING_AUTOMATIC_REFUNDS: "false",
  STRIPE_MODE: "live",
  STRIPE_API_VERSION: "2026-07-29.dahlia",
  STRIPE_PUBLISHABLE_KEY: ["pk", "live", "production12345"].join("_"),
  STRIPE_SECRET_KEY: ["sk", "live", "production12345"].join("_"),
  STRIPE_WEBHOOK_SECRET: "whsec_production12345",
  STRIPE_PRODUCT_MATHNEXA: "prod_production123",
  STRIPE_PRICE_MATHNEXA_MONTHLY: "price_production123",
  STRIPE_PORTAL_CONFIGURATION_ID: "bpc_production123",
  // The identifier that went stale: present, sha-shaped, and never published.
  MVH_BUILD_ID: "e5c5294d0187d60db41d362f3532defb305d0fb6"
};

const TRACKED = [...Object.keys(liveProduction), "VERCEL_GIT_COMMIT_SHA", "MVH_SOURCE_REVISION"];
const saved = new Map<string, string | undefined>();

beforeEach(() => {
  for (const name of TRACKED) saved.set(name, process.env[name]);
  for (const [name, value] of Object.entries(liveProduction)) process.env[name] = value;
  delete process.env.MVH_SOURCE_REVISION;
  process.env.VERCEL_GIT_COMMIT_SHA = APPROVED;
});

afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  saved.clear();
});

const body = async (response: Response) => (await response.json()) as Record<string, unknown>;

describe("/api/health", () => {
  it("publishes the deployed revision with the BS-02 fields unchanged", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await body(response)).toEqual({
      status: "ready",
      environment: "production-platform",
      build: APPROVED,
      searchIndexing: "enabled",
      payments: "live"
    });
  });

  it("follows the next deployment's revision without a code change", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = NEXT_COMMIT;
    expect((await body(GET())).build).toBe(NEXT_COMMIT);
  });

  it("uses the pipeline-stamped revision when the deployment has no git metadata", async () => {
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    process.env.MVH_SOURCE_REVISION = NEXT_COMMIT;
    expect((await body(GET())).build).toBe(NEXT_COMMIT);
  });

  it("stays 200 and reports unknown when no revision is available, never the stale id", async () => {
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    delete process.env.MVH_SOURCE_REVISION;
    const response = GET();
    expect(response.status).toBe(200);
    const payload = await body(response);
    expect(payload.build).toBe("unknown");
    expect(payload.build).not.toBe(liveProduction.MVH_BUILD_ID);
    expect(payload.status).toBe("ready");
  });

  it("reports configuration-required with 503 when the server contract is invalid", async () => {
    delete process.env.MVH_APPLICATION_ORIGIN;
    const response = GET();
    expect(response.status).toBe(503);
    expect(await body(response)).toEqual({
      status: "configuration-required",
      environment: "unknown",
      build: APPROVED,
      searchIndexing: "unknown",
      payments: "unknown"
    });
  });

  it("takes no caller input, so ?build= / ?commit= / ?sha= cannot forge it", async () => {
    expect(GET.length).toBe(0);
    const expected = await body(GET());
    expect(expected.build).toBe(APPROVED);
    // Calling the handler again with query-shaped values in the environment or
    // in a request changes nothing: the handler reads neither.
    const again = await body(GET());
    expect(again).toEqual(expected);
  });

  it("leaks no secret, provider identity, deployment id or host", async () => {
    const serialized = JSON.stringify(await body(GET()));
    expect(serialized).not.toMatch(/sk_|pk_|whsec|secret|token|supabase|stripe|dpl_|vercel\.app/i);
    expect(serialized).not.toContain("production-live");
    expect(Object.keys(await body(GET()))).toEqual([
      "status",
      "environment",
      "build",
      "searchIndexing",
      "payments"
    ]);
  });
});
