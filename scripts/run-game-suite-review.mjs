import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import {
  cleanPlatformGeneratedNextState,
  registerVerificationNextProcess,
  stopVerificationNextProcess,
  waitForLocalSupabaseAuth
} from "./verification-processes.mjs";

const origin = "http://127.0.0.1:3000";
const cli = resolve("node_modules/supabase/dist/supabase.js");
const status = JSON.parse(execFileSync(process.execPath, [cli, "status", "-o", "json"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"]
}));

for (const key of ["API_URL", "PUBLISHABLE_KEY", "SECRET_KEY"]) {
  if (typeof status[key] !== "string" || status[key].length < 10) {
    throw new Error(`Local Supabase status is missing ${key}.`);
  }
}
if (status.API_URL !== "http://127.0.0.1:55321") {
  throw new Error("Owner review is restricted to the local Supabase stack.");
}

const admin = createClient(status.API_URL, status.SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});
await waitForLocalSupabaseAuth(admin);
const identity = await admin.rpc("set_platform_identity_model", { p_identity_model: "consumer-v1" });
if (identity.error) throw identity.error;

const run = `owner-review-${Date.now()}`;
const subscriberEmail = `${run}-subscriber@example.test`;
const ownerEmail = `${run}-owner@example.test`;
const password = "LocalOwnerReview42!";
const [subscriberCreated, ownerCreated] = await Promise.all([
  admin.auth.admin.createUser({ email: subscriberEmail, password, email_confirm: true }),
  admin.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true })
]);
if (subscriberCreated.error || !subscriberCreated.data.user) {
  throw subscriberCreated.error ?? new Error("Local review subscriber could not be created.");
}
if (ownerCreated.error || !ownerCreated.data.user) {
  throw ownerCreated.error ?? new Error("Local review owner could not be created.");
}

const startsAt = new Date();
const account = await admin.from("consumer_accounts")
  .update({ trial_redeemed_at: startsAt.toISOString() })
  .eq("user_id", subscriberCreated.data.user.id);
if (account.error) throw account.error;
const entitlement = await admin.from("consumer_game_entitlements").insert({
  user_id: subscriberCreated.data.user.id,
  entitlement_state: "trial-active",
  trial_started_at: startsAt.toISOString(),
  trial_ends_at: new Date(startsAt.getTime() + 86_400_000).toISOString()
});
if (entitlement.error) throw entitlement.error;
const ownerRow = await admin.from("admin_users")
  .insert({ user_id: ownerCreated.data.user.id, role: "owner", mfa_enrolled: true })
  .select("id")
  .single();
if (ownerRow.error) throw ownerRow.error;

const catalog = await admin.from("game_catalog_entries")
  .select("id,stable_key,status,lock_version")
  .in("stable_key", ["number-cross", "number-logic", "crosscalc"])
  .order("stable_key");
if (catalog.error) throw catalog.error;
if (catalog.data.length !== 3) throw new Error("The local four-game catalog is incomplete.");
for (const entry of catalog.data) {
  if (entry.status === "published") continue;
  const transitioned = await admin.rpc("transition_game_catalog_entry", {
    p_actor_admin_id: ownerRow.data.id,
    p_catalog_entry_id: entry.id,
    p_expected_lock_version: entry.lock_version,
    p_status: "published"
  });
  if (transitioned.error) throw transitioned.error;
}

const environment = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  SUPABASE_URL: status.API_URL,
  SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: status.SECRET_KEY,
  APP_BASE_URL: origin,
  MVH_APPLICATION_ORIGIN: origin,
  MVH_SUBSCRIBER_MANAGEMENT_ORIGIN: origin,
  MVH_APP_ENVIRONMENT: "production-platform",
  MVH_ALLOW_LOCAL_PRODUCTION_REHEARSAL: "true",
  MVH_IDENTITY_MODEL: "consumer-v1",
  MVH_SUPABASE_PROJECT_REF: "production-local",
  MVH_PRODUCTION_SUPABASE_PROJECT_REF: "production-local",
  MVH_PREVIEW_SUPABASE_PROJECT_REF: "preview-local",
  MVH_STRIPE_MODE: "test",
  MVH_FIXTURE_POLICY: "forbidden",
  MVH_BUILD_ID: "game-suite-owner-review-local",
  MVH_ADMIN_ENABLED: "true",
  MVH_ADMIN_CSRF_SECRET: "game-suite-owner-review-csrf-secret",
  MVH_ADMIN_SESSION_MINUTES: "15",
  MVH_GAME_DELIVERY_SECRET: "game-suite-owner-review-delivery-secret",
  MVH_PILOT_STATE: "inactive",
  MVH_INVITATIONS_ENABLED: "false",
  MVH_EMAIL_DELIVERY: "local-capture",
  MVH_MONITORING_MODE: "console",
  MVH_DELETION_MODE: "dry-run",
  MVH_SUPPORT_EMAIL: "support@example.invalid",
  BILLING_ENABLED: "true",
  BILLING_PROVIDER: "fixture",
  BILLING_CHECKOUT_ENABLED: "true",
  BILLING_PORTAL_ENABLED: "true",
  BILLING_WEBHOOK_ENABLED: "true",
  BILLING_EMERGENCY_DEFAULT_DENY: "false",
  BILLING_RENEWAL_GRACE_DAYS: "7",
  BILLING_REFUND_REVIEW_DAYS: "7",
  BILLING_AUTOMATIC_REFUNDS: "false",
  BILLING_APP_BASE_URL: origin,
  STRIPE_MODE: "test",
  STRIPE_API_VERSION: "2026-07-29.dahlia",
  STRIPE_PUBLISHABLE_KEY: "pk_test_fixture12345",
  STRIPE_SECRET_KEY: "sk_test_fixture12345",
  STRIPE_WEBHOOK_SECRET: "whsec_fixture12345",
  STRIPE_PRODUCT_MATHNEXA: "prod_mathnexa123",
  STRIPE_PRICE_MATHNEXA_MONTHLY: "price_mathnexa123",
  STRIPE_PORTAL_CONFIGURATION_ID: "bpc_mathnexa123"
};

await cleanPlatformGeneratedNextState();
const app = spawn(process.execPath, [
  resolve("node_modules/next/dist/bin/next"),
  "dev",
  resolve("apps/platform-web"),
  "--hostname",
  "127.0.0.1",
  "--port",
  "3000"
], { env: environment, stdio: ["ignore", "inherit", "inherit"] });
registerVerificationNextProcess(app);

const deadline = Date.now() + 45_000;
while (Date.now() < deadline) {
  if (app.exitCode !== null) throw new Error("The local owner-review app exited before readiness.");
  try {
    const response = await fetch(`${origin}/`);
    if (response.status < 500) break;
  } catch { /* Next is starting. */ }
  await new Promise((done) => setTimeout(done, 200));
}
if (Date.now() >= deadline) throw new Error("The local owner-review app did not become ready.");

console.log("Local-only four-game owner review is ready.");
console.log(`${origin}/games`);
console.log(`${origin}/game/runtime/index.html`);
console.log(`${origin}/games/number-logic/play`);
console.log(`${origin}/games/number-cross/play`);
console.log(`${origin}/games/crosscalc/play`);

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await stopVerificationNextProcess(app);
}
process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
await once(app, "exit");
