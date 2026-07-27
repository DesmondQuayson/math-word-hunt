import { describe, expect, it } from "vitest";
import { parseEnvironmentRegistry } from "./registry";

const preview = { appEnvironment: "preview", applicationOrigin: "https://preview.example.invalid", dataProjectIdentity: "preview-only", paymentMode: "test", emailDelivery: "capture", monitoringMode: "console", fixturePolicy: "allowed", deletionMode: "dry-run" };
describe("environment registry", () => {
  it("accepts a complete preview contract", () => expect(parseEnvironmentRegistry(preview)?.previewBanner).toBe(true));
  it.each([
    ["missing", {}], ["production", { ...preview, appEnvironment: "production" }], ["live payment", { ...preview, paymentMode: "live" }],
    ["unsafe origin", { ...preview, applicationOrigin: "javascript:alert(1)" }], ["fixtures disabled", { ...preview, fixturePolicy: "forbidden" }]
  ])("fails closed for %s", (_name, value) => expect(parseEnvironmentRegistry(value)).toBeNull());
});
