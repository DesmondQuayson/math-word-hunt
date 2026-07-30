import { describe, expect, it } from "vitest";
import { getPublicEnvironmentView, getServerEnvironment } from "./server";
const env = { NODE_ENV:"test", MVH_APP_ENVIRONMENT:"preview", MVH_APPLICATION_ORIGIN:"https://preview.example.invalid", MVH_SUPABASE_PROJECT_REF:"preview-only", MVH_STRIPE_MODE:"test", MVH_EMAIL_DELIVERY:"local-capture", MVH_MONITORING_MODE:"console", MVH_FIXTURE_POLICY:"allowed", MVH_DELETION_MODE:"dry-run", MVH_BUILD_ID:"phase4-test" } as NodeJS.ProcessEnv;
describe("server environment", () => {
  it("publishes only non-sensitive preview state", () => expect(getPublicEnvironmentView(env)).toEqual({identity:"preview",previewBanner:true,indexable:false,operationalStatusVisible:true,buildId:"phase4-test"}));
  it("fails closed for browser-style forged values", () => expect(getServerEnvironment({...env, MVH_APP_ENVIRONMENT:undefined, NEXT_PUBLIC_MVH_APP_ENVIRONMENT:"preview"})).toBeNull());
  it("does not expose provider identity", () => expect(JSON.stringify(getPublicEnvironmentView(env))).not.toContain("preview-only"));
});
