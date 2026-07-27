import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePhase5Readiness, formatPhase5Readiness } from "./phase5-readiness-contract.mjs";

const safe = {
  PHASE5_HOSTED_APPROVAL: "owner-approved", PHASE5_HOSTED_CHECKS_ENABLED: "true",
  PHASE5_HOSTED_READ_ONLY_APPROVAL: "owner-approved", PHASE5_EXTERNAL_MUTATIONS: "false",
  PHASE5_PREVIEW_CLASSIFICATION: "isolated-preview", MVH_PREVIEW_URL: "https://mvh-preview.example.net",
  MVH_APP_ENVIRONMENT: "preview", MVH_STRIPE_MODE: "test", MVH_EMAIL_DELIVERY: "capture",
  MVH_DELETION_MODE: "dry-run", BILLING_ENVIRONMENT: "preview", STRIPE_MODE: "test",
  SUPABASE_URL: "https://preview-ref.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
  SUPABASE_SECRET_KEY: "sb_secret_fixture", MVH_SUPABASE_PROJECT_REF: "preview-ref",
  VERCEL_AUTOMATION_BYPASS_SECRET: "automation_fixture",
  STRIPE_SECRET_KEY: "sk_test_fixture", STRIPE_WEBHOOK_SECRET: "whsec_fixture",
  STRIPE_PRODUCT_TEACHER_PRO: "prod_fixture", STRIPE_PRICE_TEACHER_PRO_MONTHLY: "price_monthly",
  STRIPE_PRICE_TEACHER_PRO_ANNUAL: "price_annual", STRIPE_PORTAL_CONFIGURATION_ID: "bpc_fixture"
};

test("no credentials or approvals is an honest pending state", () => {
  const result = evaluatePhase5Readiness({});
  assert.equal(result.status, "pending");
  assert.equal(result.errors.length, 0);
  assert.match(formatPhase5Readiness(result), /PENDING/);
});

test("complete isolated preview inputs can become ready without exposing values", () => {
  const result = evaluatePhase5Readiness(safe);
  assert.equal(result.status, "ready");
  const output = formatPhase5Readiness(result);
  assert.doesNotMatch(output, /sb_secret_fixture|automation_fixture|sk_test_fixture/);
});

test("hosted checks without owner approval fail closed", () => {
  const result = evaluatePhase5Readiness({ PHASE5_HOSTED_CHECKS_ENABLED: "true" });
  assert.equal(result.status, "blocked");
  assert.match(result.errors.join(" "), /without PHASE5_HOSTED_APPROVAL/);
});

test("live and production configuration is prohibited", () => {
  const result = evaluatePhase5Readiness({ ...safe, STRIPE_SECRET_KEY: ["sk", "live", "forbidden"].join("_"), MVH_APP_ENVIRONMENT: "production" });
  assert.equal(result.status, "blocked");
  assert.match(result.errors.join(" "), /live credentials/);
  assert.match(result.errors.join(" "), /production/);
});

test("approved runs reject placeholder, local, and credentialed preview URLs", () => {
  for (const url of ["https://preview.example.invalid", "http://127.0.0.1:3000", "https://user:pass@example.net/"]) {
    const result = evaluatePhase5Readiness({ ...safe, MVH_PREVIEW_URL: url });
    assert.equal(result.status, "blocked");
  }
});

test("external mutation flag cannot be enabled", () => {
  const result = evaluatePhase5Readiness({ ...safe, PHASE5_EXTERNAL_MUTATIONS: "true" });
  assert.equal(result.status, "blocked");
  assert.match(result.errors.join(" "), /must remain false/);
});
