import { describe, expect, it } from "vitest";
import { parseEnvironmentRegistry } from "./registry";

const preview = { appEnvironment: "preview", applicationOrigin: "https://preview.example.invalid", dataProjectIdentity: "preview-only", paymentMode: "test", emailDelivery: "transactional-verified", monitoringMode: "console", fixturePolicy: "allowed", deletionMode: "dry-run" };
const productionPublic = { appEnvironment: "production-public", applicationOrigin: "https://mathnexa.com", paymentMode: "disabled", emailDelivery: "disabled", monitoringMode: "console", fixturePolicy: "forbidden", deletionMode: "disabled", billingEnabled: "false", pilotState: "inactive", invitationsEnabled: "false" };
const productionPlatform = {
  appEnvironment: "production-platform", applicationOrigin: "https://accounts.mathnexa.test",
  dataProjectIdentity: "mathnexa-production", productionDataProjectIdentity: "mathnexa-production",
  previewDataProjectIdentity: "mathnexa-preview", identityModel: "consumer-v1",
  identityProviderConfigurationPresent: true, paymentMode: "disabled", emailDelivery: "transactional-configured",
  monitoringMode: "console", fixturePolicy: "forbidden", deletionMode: "dry-run",
  billingEnabled: "false", pilotState: "inactive", invitationsEnabled: "false"
};
describe("environment registry", () => {
  it("accepts a complete preview contract", () => expect(parseEnvironmentRegistry(preview)?.previewBanner).toBe(true));
  it.each([
    ["missing", {}], ["ambiguous production", { ...preview, appEnvironment: "production" }], ["live payment", { ...preview, paymentMode: "live" }],
    ["unsafe origin", { ...preview, applicationOrigin: "javascript:alert(1)" }], ["fixtures disabled", { ...preview, fixturePolicy: "forbidden" }]
  ])("fails closed for %s", (_name, value) => expect(parseEnvironmentRegistry(value)).toBeNull());
  it.each(["disabled", "local-capture", "transactional-configured", "transactional-verified"])("represents the %s Auth email state truthfully", (emailDelivery) => {
    expect(parseEnvironmentRegistry({ ...preview, emailDelivery })?.emailDelivery).toBe(emailDelivery);
  });
  it("rejects the obsolete ambiguous capture value", () => expect(parseEnvironmentRegistry({ ...preview, emailDelivery: "capture" })).toBeNull());
  it("accepts a provider-free public Production contract", () => expect(parseEnvironmentRegistry(productionPublic)).toMatchObject({
    identity: "production-public",
    dataProjectIdentity: null,
    authenticationAvailable: false,
    teacherToolsAvailable: false,
    pilotAvailable: false,
    invitationsAvailable: false,
    billingAvailable: false,
    sensitiveOperationsAllowed: false,
    searchIndexingAllowed: true
  }));
  it.each([
    ["data project", { dataProjectIdentity: "preview-only" }],
    ["provider configuration", { restrictedProviderConfigurationPresent: true }],
    ["billing", { billingEnabled: "true" }],
    ["pilot", { pilotState: "active" }],
    ["invitations", { invitationsEnabled: "true" }],
    ["email", { emailDelivery: "transactional-verified" }],
    ["fixtures", { fixturePolicy: "allowed" }],
    ["deletion", { deletionMode: "dry-run" }],
    ["non-HTTPS origin", { applicationOrigin: "http://mathnexa.com" }]
  ])("rejects public Production with %s enabled", (_name, override) => {
    expect(parseEnvironmentRegistry({ ...productionPublic, ...override })).toBeNull();
  });
  it("accepts an isolated consumer Production-platform contract with billing disabled", () => {
    expect(parseEnvironmentRegistry(productionPlatform)).toMatchObject({
      identity: "production-platform",
      authenticationAvailable: true,
      consumerAccountsAvailable: true,
      teacherToolsAvailable: false,
      gameEntitlementRequired: true,
      billingAvailable: false,
      pilotAvailable: false,
      invitationsAvailable: false,
      accountModel: "consumer"
    });
  });
  it.each([
    ["missing identity provider", { identityProviderConfigurationPresent: false }],
    ["Preview project", { dataProjectIdentity: "mathnexa-preview" }],
    ["project mismatch", { productionDataProjectIdentity: "other-production" }],
    ["Preview collision", { previewCredentialCollision: true }],
    ["teacher identity", { identityModel: "legacy-teacher" }],
    ["billing", { billingEnabled: "true" }],
    ["Stripe", { paymentMode: "test" }],
    ["pilot", { pilotState: "active" }],
    ["invitations", { invitationsEnabled: "true" }],
    ["fixtures", { fixturePolicy: "allowed" }],
    ["public HTTP", { applicationOrigin: "http://mathnexa.com" }]
  ])("rejects Production-platform with %s", (_name, override) => {
    expect(parseEnvironmentRegistry({ ...productionPlatform, ...override })).toBeNull();
  });
  it("allows loopback only behind the explicit local rehearsal input", () => {
    const loopback = { ...productionPlatform, applicationOrigin: "http://127.0.0.1:3000" };
    expect(parseEnvironmentRegistry(loopback)).toBeNull();
    expect(parseEnvironmentRegistry({ ...loopback, allowInsecureLoopback: true })?.identity).toBe("production-platform");
  });
});
