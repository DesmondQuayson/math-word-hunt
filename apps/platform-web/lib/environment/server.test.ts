import { describe, expect, it } from "vitest";
import { getPublicEnvironmentView, getServerEnvironment } from "./server";
const env = { NODE_ENV:"test", MVH_APP_ENVIRONMENT:"preview", MVH_APPLICATION_ORIGIN:"https://preview.example.invalid", MVH_SUPABASE_PROJECT_REF:"preview-only", MVH_STRIPE_MODE:"test", MVH_EMAIL_DELIVERY:"local-capture", MVH_MONITORING_MODE:"console", MVH_FIXTURE_POLICY:"allowed", MVH_DELETION_MODE:"dry-run", MVH_BUILD_ID:"phase4-test" } as NodeJS.ProcessEnv;
describe("server environment", () => {
  it("publishes only non-sensitive preview state", () => expect(getPublicEnvironmentView(env)).toEqual({identity:"preview",previewBanner:true,indexable:false,operationalStatusVisible:true,publicProduction:false,buildId:"phase4-test"}));
  it("fails closed for browser-style forged values", () => expect(getServerEnvironment({...env, MVH_APP_ENVIRONMENT:undefined, NEXT_PUBLIC_MVH_APP_ENVIRONMENT:"preview"})).toBeNull());
  it("does not expose provider identity", () => expect(JSON.stringify(getPublicEnvironmentView(env))).not.toContain("preview-only"));
  it("publishes an explicit provider-free public Production state", () => {
    const production = { NODE_ENV:"production", MVH_APP_ENVIRONMENT:"production-public", MVH_APPLICATION_ORIGIN:"https://mathnexa.com", MVH_STRIPE_MODE:"disabled", MVH_EMAIL_DELIVERY:"disabled", MVH_MONITORING_MODE:"console", MVH_FIXTURE_POLICY:"forbidden", MVH_DELETION_MODE:"disabled", MVH_BUILD_ID:"production-release", MVH_PILOT_STATE:"inactive", MVH_INVITATIONS_ENABLED:"false", BILLING_ENABLED:"false" } as NodeJS.ProcessEnv;
    expect(getServerEnvironment(production)).not.toBeNull();
    expect(getPublicEnvironmentView(production)).toEqual({identity:"production-public",previewBanner:false,indexable:true,operationalStatusVisible:false,publicProduction:true,buildId:"production-release"});
  });
  it("rejects public Production when a Preview provider value is present", () => {
    const production = { NODE_ENV:"production", MVH_APP_ENVIRONMENT:"production-public", MVH_APPLICATION_ORIGIN:"https://mathnexa.com", MVH_STRIPE_MODE:"disabled", MVH_EMAIL_DELIVERY:"disabled", MVH_MONITORING_MODE:"console", MVH_FIXTURE_POLICY:"forbidden", MVH_DELETION_MODE:"disabled", MVH_PILOT_STATE:"inactive", MVH_INVITATIONS_ENABLED:"false", BILLING_ENABLED:"false", NEXT_PUBLIC_SUPABASE_URL:"https://preview.supabase.co" } as NodeJS.ProcessEnv;
    expect(getServerEnvironment(production)).toBeNull();
  });
});
