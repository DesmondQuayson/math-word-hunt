import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPhase7dEnvironment,
  buildVercelPreviewEnvironmentPayloads,
  isSafePhase7dOrigin,
  isVercelStandardProtectionScope,
  PHASE7D_PREVIEW_SUPABASE_REF,
  PHASE7D_STAGING_ORIGIN,
  PHASE7D_STRIPE_API_VERSION,
  PHASE7D_STRIPE_PORTAL_ID,
  PHASE7D_STRIPE_PRICE_ID,
  PHASE7D_STRIPE_PRODUCT_ID,
  PHASE7D_TRIAL_SECONDS,
  recoverVercelAutomationBypassSecret,
  redactPhase7dText
} from "./phase7d-hosted-contract.mjs";

const input = {
  supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co",
  supabasePublishableKey: "sb_publishable_staging_example",
  supabaseSecretKey: "sb_secret_staging_example",
  supabaseProjectRef: "abcdefghijklmnopqrst",
  stripePublishableKey: "pk_test_stagingexample",
  stripeSecretKey: "sk_test_stagingexample",
  stripeWebhookSecret: "whsec_stagingexample",
  buildId: "phase7d-example",
  emailVerified: false
};

test("Phase 7D uses the isolated protected staging origin and never the public domain", () => {
  assert.equal(isSafePhase7dOrigin(PHASE7D_STAGING_ORIGIN), true);
  assert.equal(isSafePhase7dOrigin("https://mathnexa.com"), false);
});

test("Phase 7D recognizes current and legacy Standard Protection API scopes", () => {
  assert.equal(isVercelStandardProtectionScope("prod_deployment_urls_and_all_previews"), true);
  assert.equal(isVercelStandardProtectionScope("all_except_custom_domains"), true);
  assert.equal(isVercelStandardProtectionScope("preview"), false);
  assert.equal(isVercelStandardProtectionScope("all"), false);
  assert.equal(isVercelStandardProtectionScope(undefined), false);
});

test("Phase 7D recovers exactly one metadata-bound automation bypass without ambiguity", () => {
  const first = "a".repeat(32);
  const second = "b".repeat(32);
  const metadata = { scope: "automation-bypass", isEnvVar: true };
  assert.equal(recoverVercelAutomationBypassSecret({ [first]: metadata }), first);
  assert.equal(recoverVercelAutomationBypassSecret({ [first]: metadata, [second]: metadata }), null);
  assert.equal(recoverVercelAutomationBypassSecret({ short: metadata }), null);
  assert.equal(recoverVercelAutomationBypassSecret({ [first]: { ...metadata, scope: "shareable-link" } }), null);
  assert.equal(recoverVercelAutomationBypassSecret({ [first]: { ...metadata, isEnvVar: false } }), null);
  assert.equal(recoverVercelAutomationBypassSecret(null), null);
});

test("Phase 7D sends staging variables as individual sensitive Preview payloads", () => {
  const payloads = buildVercelPreviewEnvironmentPayloads({ FIRST: "one", SECOND: "two" });
  assert.deepEqual(payloads, [
    { key: "FIRST", value: "one", type: "sensitive", target: ["preview"] },
    { key: "SECOND", value: "two", type: "sensitive", target: ["preview"] }
  ]);
  assert.equal(new Set(payloads.map(({ key }) => key)).size, payloads.length);
  assert.equal(Object.isFrozen(payloads[0]), true);
  assert.equal(Object.isFrozen(payloads[0].target), true);
});

test("Phase 7D environment is consumer-only, non-indexable, test-billing configuration", () => {
  const value = buildPhase7dEnvironment(input);
  assert.equal(value.MVH_APP_ENVIRONMENT, "production-platform");
  assert.equal(value.MVH_IDENTITY_MODEL, "consumer-v1");
  assert.equal(value.MVH_PREVIEW_SUPABASE_PROJECT_REF, PHASE7D_PREVIEW_SUPABASE_REF);
  assert.notEqual(value.MVH_PREVIEW_SUPABASE_PROJECT_REF, value.MVH_SUPABASE_PROJECT_REF);
  assert.equal(value.MVH_STRIPE_MODE, "test");
  assert.equal(value.STRIPE_MODE, "test");
  assert.equal(value.STRIPE_API_VERSION, PHASE7D_STRIPE_API_VERSION);
  assert.equal(value.STRIPE_PRODUCT_MATHNEXA, PHASE7D_STRIPE_PRODUCT_ID);
  assert.equal(value.STRIPE_PRICE_MATHNEXA_MONTHLY, PHASE7D_STRIPE_PRICE_ID);
  assert.equal(value.STRIPE_PORTAL_CONFIGURATION_ID, PHASE7D_STRIPE_PORTAL_ID);
  assert.equal(value.MVH_FIXTURE_POLICY, "forbidden");
  assert.equal(value.MVH_PILOT_STATE, "inactive");
  assert.equal(value.MVH_INVITATIONS_ENABLED, "false");
  assert.equal(value.BILLING_AUTOMATIC_REFUNDS, "false");
  assert.equal(PHASE7D_TRIAL_SECONDS, 86_400);
  assert.equal("STRIPE_PRODUCT_TEACHER_PRO" in value, false);
  assert.equal("STRIPE_PRICE_TEACHER_PRO_ANNUAL" in value, false);
});

test("verified email is an explicit post-evidence state", () => {
  assert.equal(buildPhase7dEnvironment(input).MVH_EMAIL_DELIVERY, "transactional-configured");
  assert.equal(buildPhase7dEnvironment({ ...input, emailVerified: true }).MVH_EMAIL_DELIVERY, "transactional-verified");
});

test("sanitizer removes provider and bypass credentials", () => {
  const text = "sbp_secret re_secret pk_test_secret sk_test_secret whsec_secret x-vercel-protection-bypass=secret";
  const redacted = redactPhase7dText(text);
  assert.doesNotMatch(redacted, /sbp_secret|re_secret|pk_test_secret|sk_test_secret|whsec_secret|bypass=secret/);
});
