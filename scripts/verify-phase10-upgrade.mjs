import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

const cli = resolve("node_modules/supabase/dist/supabase.js");
function supabase(args, capture = false) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "true" },
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit"
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result.stdout ?? "";
}

supabase(["db", "reset", "--local", "--version", "20260805120000", "--no-seed"]);
const status = JSON.parse(supabase(["status", "-o", "json"], true));
const db = createClient(status.API_URL, status.SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const ownerUserId = "10a00000-0000-4000-8000-000000000001";
const customerUserId = "10c00000-0000-4000-8000-000000000001";
const password = "SyntheticUpgrade42!";

const mode = await db.rpc("set_platform_identity_model", { p_identity_model: "consumer-v1" });
if (mode.error) throw mode.error;
for (const [id, email] of [[ownerUserId, "phase10-owner@example.invalid"], [customerUserId, "phase10-customer@example.invalid"]]) {
  const created = await db.auth.admin.createUser({ id, email, password, email_confirm: true });
  if (created.error) throw created.error;
}
const owner = await db.from("admin_users").insert({ user_id: ownerUserId, role: "owner", mfa_enrolled: true }).select("id").single();
if (owner.error) throw owner.error;
const entitlement = await db.from("consumer_game_entitlements").insert({
  user_id: customerUserId, capability_key: "MATHNEXA_ALL_ACCESS", entitlement_state: "subscription-active",
  current_period_ends_at: new Date(Date.now() + 86_400_000).toISOString(), authoritative_version: 10
});
if (entitlement.error) throw entitlement.error;
const acceptance = await db.from("consumer_commercial_acceptances").insert({
  owner_user_id: customerUserId, stripe_environment: "live", product_key: "mathnexa-monthly",
  amount_minor_units: 599, currency: "usd", billing_interval: "month", trial_seconds: 86400,
  terms_version: "2026-08-01", privacy_version: "2026-08-01", cancellation_policy_version: "2026-08-01", refund_policy_version: "2026-08-01",
  subscription_terms_accepted: true, automatic_renewal_accepted: true, trial_accepted: true,
  monthly_price_accepted: true, cancellation_policy_accepted: true, refund_policy_accepted: true,
  privacy_and_terms_accepted: true, accepted_at: new Date().toISOString()
}).select("id").single();
if (acceptance.error) throw acceptance.error;
const binding = await db.from("consumer_checkout_acceptance_bindings").insert({
  acceptance_id: acceptance.data.id, owner_user_id: customerUserId, stripe_environment: "live",
  setup_checkout_hash: createHash("sha256").update("phase10-upgrade-checkout").digest("hex"), bound_at: new Date().toISOString()
});
if (binding.error) throw binding.error;
const grade = await db.rpc("create_content_grade", {
  p_actor_admin_id: owner.data.id, p_grade_number: 6, p_title: "Phase 10 preserved Grade",
  p_slug: "phase-10-preserved-grade", p_sort_order: 6
});
if (grade.error) throw grade.error;

const protectedQueries = [
  ["admin_users", "id,user_id,role,mfa_enrolled,revoked_at,created_at"],
  ["consumer_accounts", "user_id,account_status,email_confirmed_at,trial_redeemed_at,deletion_requested_at,deletion_completed_at,created_at,updated_at"],
  ["consumer_game_entitlements", "user_id,capability_key,entitlement_state,trial_started_at,trial_ends_at,current_period_ends_at,grace_ends_at,authoritative_version,source_reference_hash,created_at,updated_at"],
  ["consumer_commercial_acceptances", "owner_user_id,stripe_environment,product_key,amount_minor_units,currency,billing_interval,trial_seconds,terms_version,privacy_version,cancellation_policy_version,refund_policy_version,subscription_terms_accepted,automatic_renewal_accepted,trial_accepted,monthly_price_accepted,cancellation_policy_accepted,refund_policy_accepted,privacy_and_terms_accepted,accepted_at"],
  ["consumer_checkout_acceptance_bindings", "owner_user_id,stripe_environment,setup_checkout_hash,bound_at"],
  ["content_grades", "id,grade_number,title,slug,sort_order,publication_state,lock_version,created_by,updated_by,created_at,updated_at,archived_at"]
];
async function fingerprint() {
  const results = [];
  for (const [table, columns] of protectedQueries) {
    const result = await db.from(table).select(columns).order(table === "consumer_accounts" || table === "consumer_game_entitlements" ? "user_id" : table === "admin_users" || table === "content_grades" ? "id" : "owner_user_id");
    if (result.error) throw result.error;
    results.push([table, result.data]);
  }
  return createHash("sha256").update(JSON.stringify(results)).digest("hex");
}

const before = await fingerprint();
supabase(["migration", "up", "--local"]);
const after = await fingerprint();
if (after !== before) throw new Error(`Phase 10 upgrade changed protected representative records (${before.slice(0, 12)} != ${after.slice(0, 12)}).`);

async function refreshedCount(table, expected) {
  let latest;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    latest = await db.from(table).select("id", { count: "exact", head: true });
    if (!latest.error && (latest.count ?? 0) >= expected) return latest.count ?? 0;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw latest?.error ?? new Error(`${table} was not upgraded safely.`);
}
await refreshedCount("admin_mfa_challenges", 0);
await refreshedCount("game_catalog_entry_versions", 1);
let canonical;
for (let attempt = 0; attempt < 50; attempt += 1) {
  canonical = await db.from("game_catalog_entries").select("stable_key,launch_type,canonical_route,status,lock_version").eq("stable_key", "math-vocabulary-hunt").single();
  if (!canonical.error) break;
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
}
if (canonical.error || JSON.stringify(canonical.data) !== JSON.stringify({ stable_key: "math-vocabulary-hunt", launch_type: "canonical", canonical_route: "/play", status: "published", lock_version: 1 })) {
  throw canonical.error ?? new Error("Canonical game protection did not survive the Phase 10 upgrade.");
}

supabase(["db", "reset", "--local"]);
console.log(`Phase 10 upgrade-from-current passed: owner, customer, entitlement, commercial-consent, and unrelated-content fingerprint ${before.slice(0, 12)} remained exact; additive structures reconciled; final local reset is clean.`);
