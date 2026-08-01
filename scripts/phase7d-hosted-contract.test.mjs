import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildPhase7dEnvironment,
  buildPhase7dHostedStateVerificationSql,
  buildPhase7dVercelDeployArgs,
  buildVercelPreviewEnvironmentPayloads,
  evaluatePhase7dVercelDeployment,
  inspectPhase7dVercelEnvironment,
  isPhase7dVercelLocalLink,
  isSafePhase7dOrigin,
  isVercelStandardProtectionScope,
  PHASE7D_PREVIEW_SUPABASE_REF,
  PHASE7D_STAGING_ORIGIN,
  PHASE7D_STRIPE_API_VERSION,
  PHASE7D_STRIPE_PORTAL_ID,
  PHASE7D_STRIPE_PRICE_ID,
  PHASE7D_STRIPE_PRODUCT_ID,
  PHASE7D_TRIAL_SECONDS,
  PHASE7D_VERCEL_DEPLOYMENT_GATES,
  PHASE7D_VERCEL_PROJECT_ID,
  PHASE7D_VERCEL_PROJECT_NAME,
  PHASE7D_VERCEL_TEAM_ID,
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

test("Phase 7D deploys with Vercel's default non-production behavior", () => {
  const args = buildPhase7dVercelDeployArgs();
  assert.deepEqual(args.slice(0, 2), ["deploy", "."]);
  assert.equal(args.includes("--prod"), false);
  assert.equal(args.includes("--target"), false);
  assert.equal(args.includes("--skip-domain"), false);
  assert.equal(args.includes("alias"), false);
});

test("Phase 7D accepts only the isolated staging local link", () => {
  const correct = {
    projectId: PHASE7D_VERCEL_PROJECT_ID,
    projectName: PHASE7D_VERCEL_PROJECT_NAME,
    orgId: PHASE7D_VERCEL_TEAM_ID
  };
  assert.equal(isPhase7dVercelLocalLink(correct), true);
  assert.equal(isPhase7dVercelLocalLink({ ...correct, projectId: "prj_preview" }), false);
  assert.equal(isPhase7dVercelLocalLink({ ...correct, orgId: "team_other" }), false);
});

test("Phase 7D requires sensitive Preview-only variables and rejects Production scope", () => {
  const valid = inspectPhase7dVercelEnvironment([
    { key: "FIRST", type: "sensitive", target: ["preview"] },
    { key: "SECOND", type: "sensitive", target: ["preview"] }
  ], ["FIRST", "SECOND"]);
  assert.equal(valid.valid, true);
  assert.equal(inspectPhase7dVercelEnvironment([
    { key: "FIRST", type: "sensitive", target: ["production"] }
  ], ["FIRST"]).valid, false);
});

test("Phase 7D rejects and marks a Production deployment for deletion before aliasing", () => {
  const result = evaluatePhase7dVercelDeployment({
    deployment: { target: "production", readyState: "READY" },
    environmentVerified: true,
    protectionVerified: true,
    aliasAttached: true,
    aliasProtectionVerified: true
  });
  assert.equal(result.targetVerified, false);
  assert.equal(result.deleteRequired, true);
  assert.equal(result.aliasAllowed, false);
  assert.equal(result.lifecycleAllowed, false);
});

test("Phase 7D cannot attach an alias or begin lifecycle before every prior gate", () => {
  const deployment = { target: "preview", readyState: "READY" };
  assert.equal(evaluatePhase7dVercelDeployment({ deployment }).aliasAllowed, false);
  const verified = evaluatePhase7dVercelDeployment({
    deployment,
    environmentVerified: true,
    protectionVerified: true
  });
  assert.equal(verified.aliasAllowed, true);
  assert.equal(verified.lifecycleAllowed, false);
  assert.equal(evaluatePhase7dVercelDeployment({
    deployment,
    environmentVerified: true,
    protectionVerified: true,
    aliasAttached: true,
    aliasProtectionVerified: true
  }).lifecycleAllowed, true);
  assert.deepEqual(PHASE7D_VERCEL_DEPLOYMENT_GATES, [
    "preflight", "deploy", "target", "environment", "protection", "alias", "lifecycle"
  ]);
});

test("Phase 7D runner deletes rejected targets and orders alias and lifecycle after verification", () => {
  const source = readFileSync(new URL("./run-phase7d-hosted-staging.mjs", import.meta.url), "utf8");
  const targetGate = source.indexOf("if (initial.deleteRequired)");
  const rejectedDelete = source.indexOf("deleteRejectedVercelDeployment(deploymentId)", targetGate);
  const earlyAliasGate = source.indexOf("vercel-deployment-has-alias-before-verification", rejectedDelete);
  const uniqueProtection = source.indexOf("verifyVercelProtectionAt(deploymentUrl", rejectedDelete);
  const alias = source.indexOf('vercel(["alias", "set"', uniqueProtection);
  const aliasProtection = source.indexOf("verifyVercelProtectionAt(PHASE7D_STAGING_ORIGIN", alias);
  const lifecycleGate = source.indexOf("if (!finalGate.lifecycleAllowed)", aliasProtection);
  const hostedLifecycle = source.indexOf("lifecycle = await runPhase7dHostedLifecycle", lifecycleGate);
  assert.ok(targetGate >= 0 && rejectedDelete > targetGate);
  assert.ok(earlyAliasGate > rejectedDelete);
  assert.ok(uniqueProtection > earlyAliasGate);
  assert.ok(alias > uniqueProtection);
  assert.ok(aliasProtection > alias);
  assert.ok(lifecycleGate > aliasProtection);
  assert.ok(hostedLifecycle > lifecycleGate);
});

test("Phase 7D hosted state proof is read-only, consumer-only, and checks fixture cleanup", () => {
  const sql = buildPhase7dHostedStateVerificationSql();
  assert.match(sql, /identity_model[\s\S]*consumer-v1/);
  assert.match(sql, /auth\.users[\s\S]*example\.invalid/);
  assert.match(sql, /consumer_account_deletion_requests/);
  assert.match(sql, /billing_webhook_events/);
  assert.doesNotMatch(sql, /set_platform_identity_model|\binsert\s+into\b|\bupdate\s+public\b|\bdelete\s+from\b/i);
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
