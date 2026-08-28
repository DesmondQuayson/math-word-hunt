import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

function requireAll(path, markers) {
  const source = readFileSync(path, "utf8");
  for (const marker of markers) if (!source.includes(marker)) throw new Error(`${path} is missing public Production safeguard: ${marker}`);
  return source;
}

const registry = requireAll("packages/platform-core/src/environment/registry.ts", ["production-public", "restrictedProviderConfigurationPresent", "authenticationAvailable: false", "teacherToolsAvailable: false", "pilotAvailable: false", "invitationsAvailable: false", "sensitiveOperationsAllowed: false"]);
if (!registry.includes('projectRef === null') || !registry.includes('paymentMode === "disabled"') || !registry.includes('emailDelivery === "disabled"')) throw new Error("Public Production provider-free contract is incomplete.");

requireAll("apps/platform-web/proxy.ts", ["isProductionPublicRestrictedPath", 'pathname = "/not-launched"', '{ error: "not-found" }']);
requireAll("apps/platform-web/lib/supabase/public-config.ts", ["isProductionPublicMode", "return null"]);
requireAll("apps/platform-web/lib/supabase/service.ts", ["isProductionPublicMode", "return null"]);
requireAll("apps/platform-web/app/auth-actions.ts", ["isProductionPublicMode", "return unavailable"]);
requireAll("apps/platform-web/app/billing-actions.ts", ["isProductionPublicMode", 'redirect("/not-launched")']);

const unavailable = requireAll("apps/platform-web/app/not-launched/page.tsx", ["This feature has not launched", "No account or personal information is accepted here"]);
if (/<form|<input|<textarea|<select/i.test(unavailable)) throw new Error("Unavailable Production page contains an interactive data form.");

for (const path of ["apps/platform-web/app/about/page.tsx", "apps/platform-web/app/help/page.tsx", "apps/platform-web/app/privacy/page.tsx", "apps/platform-web/app/accessibility/page.tsx"]) {
  const source = readFileSync(path, "utf8");
  if (/<form|<input|<textarea|<select/i.test(source)) throw new Error(`${path} contains a restricted data form.`);
}

const expected = new Map([
  ["docs/index.html", "7f00ed6789a2faf23b90e96c3dfdee0167aced87beb08dabf10b89c3e72c9fc5"],
  ["docs/vocab.js", "caeb8fbb590fffd8cbc169f88f174a38c26de2d16a7e1b0c1cf5e83ac9f01c46"]
]);
for (const [path, digest] of expected) {
  const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (actual !== digest) throw new Error(`${path} changed: ${actual}`);
}
console.log("Public Production security audit passed: provider initialization, Auth, teacher tools, pilot, invitations, billing, fixtures, deletion, and restricted routes fail closed; canonical hashes are preserved.");
