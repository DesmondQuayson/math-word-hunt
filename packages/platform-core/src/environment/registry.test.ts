import { describe, expect, it } from "vitest";
import { parseEnvironmentRegistry } from "./registry";

const preview = { appEnvironment: "preview", applicationOrigin: "https://preview.example.invalid", dataProjectIdentity: "preview-only", paymentMode: "test", emailDelivery: "transactional-verified", monitoringMode: "console", fixturePolicy: "allowed", deletionMode: "dry-run" };
const productionPublic = { appEnvironment: "production-public", applicationOrigin: "https://mathnexa.com", paymentMode: "disabled", emailDelivery: "disabled", monitoringMode: "console", fixturePolicy: "forbidden", deletionMode: "disabled", billingEnabled: "false", pilotState: "inactive", invitationsEnabled: "false" };
describe("environment registry", () => {
  it("accepts a complete preview contract", () => expect(parseEnvironmentRegistry(preview)?.previewBanner).toBe(true));
  it.each([
    ["missing", {}], ["production", { ...preview, appEnvironment: "production" }], ["live payment", { ...preview, paymentMode: "live" }],
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
});
