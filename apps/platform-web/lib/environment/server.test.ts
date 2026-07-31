import { describe, expect, it } from "vitest";
import { getPublicEnvironmentView, getServerEnvironment } from "./server";
const env = { NODE_ENV:"test", MVH_APP_ENVIRONMENT:"preview", MVH_APPLICATION_ORIGIN:"https://preview.example.invalid", MVH_SUPABASE_PROJECT_REF:"preview-only", MVH_STRIPE_MODE:"test", MVH_EMAIL_DELIVERY:"local-capture", MVH_MONITORING_MODE:"console", MVH_FIXTURE_POLICY:"allowed", MVH_DELETION_MODE:"dry-run", MVH_BUILD_ID:"phase4-test" } as NodeJS.ProcessEnv;
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
});
