import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildPhase7dEnvironment,
  buildPhase7dHostedStateVerificationSql,
  buildPhase7dVercelDeployArgs,
  buildVercelProductionEnvironmentPayloads,
  evaluatePhase7dVercelDeployment,
  hasNoPhase7dCustomDomains,
  inspectPhase7dVercelEnvironment,
  isPhase7dVercelDeploymentSource,
  isPhase7dVercelLocalLink,
  isSafePhase7dOrigin,
  isVercelStandardProtectionScope,
  PHASE7D_BRANCH,
  PHASE7D_PREVIEW_SUPABASE_REF,
  PHASE7D_SECRET_NAMES,
  PHASE7D_STAGING_ORIGIN,
  PHASE7D_SYNTHETIC_TABLES,
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
  stagingAccessToken: "A".repeat(43),
  buildId: "phase7d-example",
  emailVerified: false
};

test("Phase 7D uses only the isolated automatic staging origin", () => {
  assert.equal(PHASE7D_STAGING_ORIGIN, "https://mathnexa-platform-staging.vercel.app");
  assert.equal(isSafePhase7dOrigin(PHASE7D_STAGING_ORIGIN), true);
  assert.equal(isSafePhase7dOrigin("https://mathnexa.com"), false);
});

test("Phase 7D preserves the existing Standard Protection control without relying on it for alias access", () => {
  assert.equal(isVercelStandardProtectionScope("prod_deployment_urls_and_all_previews"), true);
  assert.equal(isVercelStandardProtectionScope("all_except_custom_domains"), true);
  assert.equal(isVercelStandardProtectionScope("preview"), false);
});

test("Phase 7D recovers exactly one metadata-bound automation bypass", () => {
  const first = "a".repeat(32);
  const second = "b".repeat(32);
  const metadata = { scope: "automation-bypass", isEnvVar: true };
  assert.equal(recoverVercelAutomationBypassSecret({ [first]: metadata }), first);
  assert.equal(recoverVercelAutomationBypassSecret({ [first]: metadata, [second]: metadata }), null);
});

test("Phase 7D sends every staging variable as an individual sensitive Production payload", () => {
  const payloads = buildVercelProductionEnvironmentPayloads({ FIRST: "one", SECOND: "two" });
  assert.deepEqual(payloads, [
    { key: "FIRST", value: "one", type: "sensitive", target: ["production"] },
    { key: "SECOND", value: "two", type: "sensitive", target: ["production"] }
  ]);
  assert.equal(new Set(payloads.map(({ key }) => key)).size, payloads.length);
  assert.equal(Object.isFrozen(payloads[0]), true);
});

test("Phase 7D deploys explicitly to Production only in the isolated staging project", () => {
  const args = buildPhase7dVercelDeployArgs();
  assert.deepEqual(args.slice(0, 2), ["deploy", "."]);
  assert.equal(args.includes("--prod"), true);
  assert.equal(args.includes("--target"), false);
  assert.equal(args[args.indexOf("--project") + 1], PHASE7D_VERCEL_PROJECT_NAME);
  assert.equal(args.includes("alias"), false);
});

test("Phase 7D accepts only the isolated project link and exact branch commit metadata", () => {
  const link = { projectId: PHASE7D_VERCEL_PROJECT_ID, projectName: PHASE7D_VERCEL_PROJECT_NAME, orgId: PHASE7D_VERCEL_TEAM_ID };
  assert.equal(isPhase7dVercelLocalLink(link), true);
  assert.equal(isPhase7dVercelLocalLink({ ...link, projectId: "prj_other" }), false);
  const deployment = { meta: { githubCommitSha: "abc", githubCommitRef: PHASE7D_BRANCH } };
  assert.equal(isPhase7dVercelDeploymentSource(deployment, "abc"), true);
  assert.equal(isPhase7dVercelDeploymentSource(deployment, "def"), false);
});

test("Phase 7D requires complete sensitive Production variables while allowing retained Preview entries", () => {
  const entries = [
    { key: "FIRST", type: "sensitive", target: ["production"] },
    { key: "SECOND", type: "sensitive", target: ["production"] },
    { key: "FIRST", type: "sensitive", target: ["preview"] }
  ];
  const result = inspectPhase7dVercelEnvironment(entries, ["FIRST", "SECOND"]);
  assert.equal(result.valid, true);
  assert.equal(result.productionCount, 2);
  assert.equal(result.previewCount, 1);
  assert.equal(inspectPhase7dVercelEnvironment(entries.slice(1), ["FIRST", "SECOND"]).valid, false);
});

test("Phase 7D rejects custom domains", () => {
  assert.equal(hasNoPhase7dCustomDomains([]), true);
  assert.equal(hasNoPhase7dCustomDomains([{ name: "mathnexa-platform-staging.vercel.app" }]), true);
  assert.equal(hasNoPhase7dCustomDomains([{ name: "mathnexa.com" }]), false);
});

test("Phase 7D lifecycle cannot start before Production, source, domain, environment, and access-lock gates pass", () => {
  const deployment = { target: "production", readyState: "READY" };
  assert.equal(evaluatePhase7dVercelDeployment({ deployment }).lifecycleAllowed, false);
  const complete = evaluatePhase7dVercelDeployment({
    deployment,
    environmentVerified: true,
    sourceVerified: true,
    noCustomDomains: true,
    anonymousLocked: true,
    authorizedAccess: true
  });
  assert.equal(complete.targetVerified, true);
  assert.equal(complete.deleteRequired, false);
  assert.equal(complete.lifecycleAllowed, true);
  assert.equal(evaluatePhase7dVercelDeployment({ ...complete, deployment: { target: "preview", readyState: "READY" } }).deleteRequired, true);
  assert.deepEqual(PHASE7D_VERCEL_DEPLOYMENT_GATES, [
    "preflight", "environment", "deploy", "target", "source", "domains", "access-lock", "lifecycle"
  ]);
});

test("Phase 7D runner cannot start lifecycle before the application access-lock acceptance gate", () => {
  const source = readFileSync(new URL("./run-phase7d-hosted-staging.mjs", import.meta.url), "utf8");
  const accessLock = source.indexOf("access = await verifyStagingAccessLockAt");
  const internalGate = source.indexOf("if (!finalGate.lifecycleAllowed)", accessLock);
  const deployment = source.lastIndexOf("await deployVercel");
  const lifecycle = source.indexOf("lifecycle = await runPhase7dHostedLifecycle", deployment);
  assert.ok(accessLock >= 0 && internalGate > accessLock);
  assert.ok(deployment > internalGate && lifecycle > deployment);
  assert.doesNotMatch(source, /vercel\(\["alias", "set"/);
});

test("Phase 7D lifecycle distinguishes accessible success and error outcomes without copy-dependent locators", () => {
  const source = readFileSync(new URL("./phase7d-hosted-lifecycle.mjs", import.meta.url), "utf8");
  assert.match(source, /\[role="status"\], \[role="alert"\]/);
  assert.match(source, /page\.locator\("form"\)\.first\(\)/);
  assert.match(source, /page\.locator\("form"\)\.first\(\)\.getByRole\("alert"\)/);
  assert.match(source, /page\.goto\(`\$\{PHASE7D_STAGING_ORIGIN\}\/sign-in`\)/);
  assert.match(source, /input\[name="email"\][\s\S]*fill\(PHASE7D_RESEND_TEST_RECIPIENT\)/);
  assert.match(source, /getAttribute\("role"\) === "status"/);
  assert.doesNotMatch(source, /getByRole\("status"\)\.waitFor/);
  assert.doesNotMatch(source, /await page\.getByRole\("alert"\)\.waitFor/);
});

test("Phase 7D waits for authoritative Resend delivery instead of message-body availability alone", () => {
  const source = readFileSync(new URL("./phase7d-hosted-lifecycle.mjs", import.meta.url), "utf8");
  assert.match(source, /Boolean\(value\?\.html\) && \["sent", "delivered"\]\.includes\(value\?\.last_event\)/);
  assert.match(source, /confirmation-email-not-delivered/);
  assert.match(source, /recovery-email-not-delivered/);
});

test("Phase 7D completes the conditional Stripe Checkout postal-code field", () => {
  const source = readFileSync(new URL("./phase7d-hosted-lifecycle.mjs", import.meta.url), "utf8");
  assert.match(source, /input\[name="postalCode"\], input\[autocomplete="postal-code"\]/);
  assert.match(source, /postalCode\.count\(\)\) await postalCode\.fill\("42424"\)/);
});

test("Phase 7D uses the directly verified Resend STARTTLS transport", () => {
  const source = readFileSync(new URL("./run-phase7d-hosted-staging.mjs", import.meta.url), "utf8");
  assert.match(source, /smtp_host: "smtp\.resend\.com"/);
  assert.match(source, /smtp_port: "587"/);
  assert.match(source, /smtp_user: "resend"/);
  assert.match(source, /smtpSecurity: "STARTTLS"/);
  assert.match(source, /smtp_max_frequency: 60/);
  assert.match(source, /rate_limit_email_sent: 30/);
  assert.match(source, /Number\(auth\.rate_limit_email_sent\) !== 30/);
  assert.doesNotMatch(source, /smtp_port: "465"/);
});

test("Phase 7D hosted state proof is read-only, consumer-only, and checks fixture cleanup", () => {
  const sql = buildPhase7dHostedStateVerificationSql();
  assert.match(sql, /identity_model[\s\S]*consumer-v1/);
  assert.match(sql, /auth\.users[\s\S]*example\.invalid/);
  assert.match(sql, /billing_webhook_events/);
  assert.doesNotMatch(sql, /set_platform_identity_model|\binsert\s+into\b|\bupdate\s+public\b|\bdelete\s+from\b/i);
});

test("Phase 7D cleanup inventories the canonical consumer deletion-request table", () => {
  assert.equal(PHASE7D_SYNTHETIC_TABLES.includes("consumer_account_deletion_requests"), true);
  assert.equal(PHASE7D_SYNTHETIC_TABLES.includes("consumer_deletion_requests"), false);
});

test("Phase 7D environment is consumer-only, locked, test-billing configuration", () => {
  const value = buildPhase7dEnvironment(input);
  assert.equal(value.MVH_APP_ENVIRONMENT, "production-platform");
  assert.equal(value.MVH_IDENTITY_MODEL, "consumer-v1");
  assert.equal(value.MVH_PREVIEW_SUPABASE_PROJECT_REF, PHASE7D_PREVIEW_SUPABASE_REF);
  assert.notEqual(value.MVH_PREVIEW_SUPABASE_PROJECT_REF, value.MVH_SUPABASE_PROJECT_REF);
  assert.equal(value.MVH_STAGING_ACCESS_REQUIRED, "true");
  assert.equal(value.MVH_STAGING_ACCESS_TOKEN, input.stagingAccessToken);
  assert.equal(PHASE7D_SECRET_NAMES.includes("MVH_STAGING_ACCESS_TOKEN"), true);
  assert.equal(value.MVH_STRIPE_MODE, "test");
  assert.equal(value.STRIPE_API_VERSION, PHASE7D_STRIPE_API_VERSION);
  assert.equal(value.STRIPE_PRODUCT_MATHNEXA, PHASE7D_STRIPE_PRODUCT_ID);
  assert.equal(value.STRIPE_PRICE_MATHNEXA_MONTHLY, PHASE7D_STRIPE_PRICE_ID);
  assert.equal(value.STRIPE_PORTAL_CONFIGURATION_ID, PHASE7D_STRIPE_PORTAL_ID);
  assert.equal(value.MVH_FIXTURE_POLICY, "forbidden");
  assert.equal(value.MVH_INVITATIONS_ENABLED, "false");
  assert.equal(value.BILLING_AUTOMATIC_REFUNDS, "false");
  assert.equal(PHASE7D_TRIAL_SECONDS, 86_400);
  assert.equal("STRIPE_PRODUCT_TEACHER_PRO" in value, false);
});

test("verified email is an explicit post-evidence state", () => {
  assert.equal(buildPhase7dEnvironment(input).MVH_EMAIL_DELIVERY, "transactional-configured");
  assert.equal(buildPhase7dEnvironment({ ...input, emailVerified: true }).MVH_EMAIL_DELIVERY, "transactional-verified");
});

test("sanitizer removes provider, bypass, and staging credentials", () => {
  const staging = "Z".repeat(43);
  const redacted = redactPhase7dText(
    `sbp_secret re_secret pk_test_secret sk_test_secret whsec_secret x-vercel-protection-bypass=secret token=${staging}`,
    [staging]
  );
  assert.doesNotMatch(redacted, /sbp_secret|re_secret|pk_test_secret|sk_test_secret|whsec_secret|bypass=secret|Z{43}/);
});
