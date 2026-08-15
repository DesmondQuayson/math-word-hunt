import { describe, expect, it } from "vitest";
import { getPublicEnvironmentView, getServerEnvironment } from "./server";
const env = { NODE_ENV:"test", MVH_APP_ENVIRONMENT:"preview", MVH_APPLICATION_ORIGIN:"https://preview.example.invalid", MVH_SUPABASE_PROJECT_REF:"preview-only", MVH_STRIPE_MODE:"test", MVH_EMAIL_DELIVERY:"local-capture", MVH_MONITORING_MODE:"console", MVH_FIXTURE_POLICY:"allowed", MVH_DELETION_MODE:"dry-run", MVH_BUILD_ID:"phase4-test" } as NodeJS.ProcessEnv;
const liveProduction = {
  NODE_ENV:"production", MVH_APP_ENVIRONMENT:"production-platform", MVH_APPLICATION_ORIGIN:"https://mathnexa.com",
  MVH_SUBSCRIBER_MANAGEMENT_ORIGIN:"https://mathnexa-platform-production.vercel.app",
  MVH_SUPABASE_PROJECT_REF:"production-live", MVH_PRODUCTION_SUPABASE_PROJECT_REF:"production-live",
  MVH_PREVIEW_SUPABASE_PROJECT_REF:"preview-isolated", MVH_IDENTITY_MODEL:"consumer-v1",
  NEXT_PUBLIC_SUPABASE_URL:"https://production-live.supabase.co", SUPABASE_URL:"https://production-live.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"publishable-production-live-key", SUPABASE_SECRET_KEY:"secret-production-live-key",
  MVH_STRIPE_MODE:"live", MVH_COMMERCIAL_ACTIVATION:"live", MVH_EMAIL_DELIVERY:"transactional-verified",
  MVH_MONITORING_MODE:"console", MVH_FIXTURE_POLICY:"forbidden", MVH_DELETION_MODE:"dry-run",
  MVH_PILOT_STATE:"inactive", MVH_INVITATIONS_ENABLED:"false", MVH_LEGAL_REVIEW:"owner-approved",
  MVH_TERMS_VERSION:"2026-08-01", MVH_PRIVACY_VERSION:"2026-08-01",
  MVH_CANCELLATION_POLICY_VERSION:"2026-08-01", MVH_REFUND_POLICY_VERSION:"2026-08-01",
  MVH_SUPPORT_EMAIL:"support@mathnexa.com", BILLING_ENABLED:"true", BILLING_PROVIDER:"stripe",
  BILLING_LIVE_ACTIVATION:"owner-approved", BILLING_APP_BASE_URL:"https://mathnexa.com",
  BILLING_CHECKOUT_ENABLED:"false", BILLING_PORTAL_ENABLED:"true", BILLING_WEBHOOK_ENABLED:"true",
  BILLING_EMERGENCY_DEFAULT_DENY:"false", BILLING_RENEWAL_GRACE_DAYS:"7", BILLING_REFUND_REVIEW_DAYS:"7",
  BILLING_AUTOMATIC_REFUNDS:"false", STRIPE_MODE:"live", STRIPE_API_VERSION:"2026-07-29.dahlia",
  STRIPE_PUBLISHABLE_KEY:["pk", "live", "production12345"].join("_"), STRIPE_SECRET_KEY:["sk", "live", "production12345"].join("_"),
  STRIPE_WEBHOOK_SECRET:"whsec_production12345", STRIPE_PRODUCT_MATHNEXA:"prod_production123",
  STRIPE_PRICE_MATHNEXA_MONTHLY:"price_production123", STRIPE_PORTAL_CONFIGURATION_ID:"bpc_production123"
} as NodeJS.ProcessEnv;
describe("server environment", () => {
  it("publishes only non-sensitive preview state", () => expect(getPublicEnvironmentView(env)).toEqual({identity:"preview",previewBanner:true,indexable:false,operationalStatusVisible:true,publicProduction:false,productionPlatform:false,buildId:"phase4-test"}));
  it("fails closed for browser-style forged values", () => expect(getServerEnvironment({...env, MVH_APP_ENVIRONMENT:undefined, NEXT_PUBLIC_MVH_APP_ENVIRONMENT:"preview"})).toBeNull());
  it("does not expose provider identity", () => expect(JSON.stringify(getPublicEnvironmentView(env))).not.toContain("preview-only"));
  it("publishes an explicit provider-free public Production state", () => {
    const production = { NODE_ENV:"production", MVH_APP_ENVIRONMENT:"production-public", MVH_APPLICATION_ORIGIN:"https://mathnexa.com", MVH_STRIPE_MODE:"disabled", MVH_EMAIL_DELIVERY:"disabled", MVH_MONITORING_MODE:"console", MVH_FIXTURE_POLICY:"forbidden", MVH_DELETION_MODE:"disabled", MVH_BUILD_ID:"production-release", MVH_PILOT_STATE:"inactive", MVH_INVITATIONS_ENABLED:"false", BILLING_ENABLED:"false" } as NodeJS.ProcessEnv;
    expect(getServerEnvironment(production)).not.toBeNull();
    expect(getPublicEnvironmentView(production)).toEqual({identity:"production-public",previewBanner:false,indexable:true,operationalStatusVisible:false,publicProduction:true,productionPlatform:false,buildId:"production-release"});
  });
  it("rejects public Production when a Preview provider value is present", () => {
    const production = { NODE_ENV:"production", MVH_APP_ENVIRONMENT:"production-public", MVH_APPLICATION_ORIGIN:"https://mathnexa.com", MVH_STRIPE_MODE:"disabled", MVH_EMAIL_DELIVERY:"disabled", MVH_MONITORING_MODE:"console", MVH_FIXTURE_POLICY:"forbidden", MVH_DELETION_MODE:"disabled", MVH_PILOT_STATE:"inactive", MVH_INVITATIONS_ENABLED:"false", BILLING_ENABLED:"false", NEXT_PUBLIC_SUPABASE_URL:"https://preview.supabase.co" } as NodeJS.ProcessEnv;
    expect(getServerEnvironment(production)).toBeNull();
  });
  it("accepts only an isolated, provider-complete Production-platform identity", () => {
    const platform = {
      NODE_ENV:"test", MVH_APP_ENVIRONMENT:"production-platform", MVH_APPLICATION_ORIGIN:"http://127.0.0.1:3000",
      MVH_ALLOW_LOCAL_PRODUCTION_REHEARSAL:"true", MVH_SUPABASE_PROJECT_REF:"production-local",
      MVH_PRODUCTION_SUPABASE_PROJECT_REF:"production-local", MVH_PREVIEW_SUPABASE_PROJECT_REF:"preview-local",
      MVH_IDENTITY_MODEL:"consumer-v1", NEXT_PUBLIC_SUPABASE_URL:"http://127.0.0.1:54321",
      SUPABASE_URL:"http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"publishable-production-local-key",
      SUPABASE_SECRET_KEY:"secret-production-local-key", MVH_STRIPE_MODE:"disabled", MVH_EMAIL_DELIVERY:"local-capture",
      MVH_MONITORING_MODE:"console", MVH_FIXTURE_POLICY:"forbidden", MVH_DELETION_MODE:"dry-run",
      MVH_PILOT_STATE:"inactive", MVH_INVITATIONS_ENABLED:"false", BILLING_ENABLED:"false", MVH_BUILD_ID:"phase7b"
    } as NodeJS.ProcessEnv;
    expect(getServerEnvironment(platform)).toMatchObject({ identity:"production-platform", accountModel:"consumer", teacherToolsAvailable:false, billingAvailable:false });
    expect(getPublicEnvironmentView(platform)).toEqual({identity:"production-platform",previewBanner:false,indexable:false,operationalStatusVisible:false,publicProduction:false,productionPlatform:true,buildId:"phase7b"});
    expect(getServerEnvironment({...platform, MVH_PREVIEW_SUPABASE_PROJECT_REF:"production-local"})).toBeNull();
  });
  it("accepts Live billing only after every server-owned Production prerequisite passes", () => {
    expect(getServerEnvironment(liveProduction)).toMatchObject({
      identity:"production-platform", paymentMode:"live", billingAvailable:true, gameEntitlementRequired:true
    });
  });
  it.each([
    ["commercial activation", { MVH_COMMERCIAL_ACTIVATION:"disabled" }],
    ["owner activation", { BILLING_LIVE_ACTIVATION:"not-approved" }],
    ["verified email", { MVH_EMAIL_DELIVERY:"transactional-configured" }],
    ["canonical origin", { MVH_APPLICATION_ORIGIN:"https://mathnexa-platform-production.vercel.app" }],
    ["stable management alias", { MVH_SUBSCRIBER_MANAGEMENT_ORIGIN:"https://mathnexa.com" }],
    ["Live publishable key", { STRIPE_PUBLISHABLE_KEY:"pk_test_production12345" }],
    ["Live secret key", { STRIPE_SECRET_KEY:"sk_test_production12345" }],
    ["approved terms", { MVH_TERMS_VERSION:"stale" }]
  ])("fails closed when Live Production lacks %s", (_name, override) => {
    expect(getServerEnvironment({ ...liveProduction, ...override })).toBeNull();
  });
  it("keeps Checkout independent from Live billing availability", () => {
    expect(getServerEnvironment({ ...liveProduction, BILLING_CHECKOUT_ENABLED:"false" })).toMatchObject({
      paymentMode:"live", billingAvailable:true
    });
  });
  it("cannot activate Live billing from browser-controlled values", () => {
    const disabled = {
      ...liveProduction,
      MVH_STRIPE_MODE:"disabled", BILLING_ENABLED:"false", MVH_COMMERCIAL_ACTIVATION:"disabled",
      BILLING_LIVE_ACTIVATION:"not-approved", NEXT_PUBLIC_MVH_STRIPE_MODE:"live",
      NEXT_PUBLIC_BILLING_ENABLED:"true", NEXT_PUBLIC_MVH_COMMERCIAL_ACTIVATION:"live"
    };
    expect(getServerEnvironment(disabled)).toMatchObject({ paymentMode:"disabled", billingAvailable:false });
  });
});
