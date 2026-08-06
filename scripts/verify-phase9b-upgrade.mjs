import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

const cli = resolve("node_modules/supabase/dist/supabase.js");
function supabase(args, capture = false) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result.stdout ?? "";
}

supabase(["db", "reset", "--local", "--version", "20260804020000", "--no-seed"]);
const status = JSON.parse(execFileSync(process.execPath, [cli, "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }));
const db = createClient(status.API_URL, status.SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const userId = "9b900000-0000-4000-8000-000000000001";
const email = "phase9b-upgrade@example.invalid";

const mode = await db.rpc("set_platform_identity_model", { p_identity_model: "consumer-v1" });
if (mode.error) throw mode.error;
const created = await db.auth.admin.createUser({ id: userId, email, password: "SyntheticUpgrade42!", email_confirm: true });
if (created.error) throw created.error;
const projectedAccount = await db.from("consumer_accounts").select("created_at").eq("user_id", userId).single();
if (projectedAccount.error) throw projectedAccount.error;
const eventTime = new Date(Date.parse(projectedAccount.data.created_at) + 1_000).toISOString();
const periodEnd = new Date(Date.parse(eventTime) + 30 * 24 * 60 * 60 * 1_000).toISOString();
const account = await db.from("consumer_accounts").update({ trial_redeemed_at: eventTime }).eq("user_id", userId);
if (account.error) throw account.error;
const entitlement = await db.from("consumer_game_entitlements").insert({ user_id: userId, entitlement_state: "subscription-active", current_period_ends_at: periodEnd, authoritative_version: 7 });
if (entitlement.error) throw entitlement.error;
const acceptance = await db.from("consumer_commercial_acceptances").insert({
  owner_user_id: userId, stripe_environment: "live", product_key: "mathnexa-monthly",
  amount_minor_units: 599, currency: "usd", billing_interval: "month", trial_seconds: 86400,
  terms_version: "2026-08-01", privacy_version: "2026-08-01", cancellation_policy_version: "2026-08-01", refund_policy_version: "2026-08-01",
  subscription_terms_accepted: true, automatic_renewal_accepted: true, trial_accepted: true,
  monthly_price_accepted: true, cancellation_policy_accepted: true, refund_policy_accepted: true,
  privacy_and_terms_accepted: true, accepted_at: eventTime
}).select("id").single();
if (acceptance.error) throw acceptance.error;
const checkoutHash = createHash("sha256").update("phase9b-upgrade-checkout").digest("hex");
const binding = await db.from("consumer_checkout_acceptance_bindings").insert({ acceptance_id: acceptance.data.id, owner_user_id: userId, stripe_environment: "live", setup_checkout_hash: checkoutHash, bound_at: eventTime });
if (binding.error) throw binding.error;

async function fingerprint() {
  const [accounts, entitlements, acceptances, bindings] = await Promise.all([
    db.from("consumer_accounts").select("user_id,account_status,email_confirmed_at,trial_redeemed_at,deletion_requested_at,deletion_completed_at,created_at,updated_at").eq("user_id", userId),
    db.from("consumer_game_entitlements").select("user_id,entitlement_state,trial_started_at,trial_ends_at,current_period_ends_at,grace_ends_at,authoritative_version,source_reference_hash,created_at,updated_at").eq("user_id", userId),
    db.from("consumer_commercial_acceptances").select("owner_user_id,stripe_environment,product_key,amount_minor_units,currency,billing_interval,trial_seconds,terms_version,privacy_version,cancellation_policy_version,refund_policy_version,subscription_terms_accepted,automatic_renewal_accepted,trial_accepted,monthly_price_accepted,cancellation_policy_accepted,refund_policy_accepted,privacy_and_terms_accepted,accepted_at").eq("owner_user_id", userId),
    db.from("consumer_checkout_acceptance_bindings").select("owner_user_id,stripe_environment,setup_checkout_hash,bound_at").eq("owner_user_id", userId)
  ]);
  for (const result of [accounts, entitlements, acceptances, bindings]) if (result.error) throw result.error;
  return createHash("sha256").update(JSON.stringify([accounts.data, entitlements.data, acceptances.data, bindings.data])).digest("hex");
}

const before = await fingerprint();
supabase(["migration", "up", "--local"]);
const after = await fingerprint();
if (after !== before) throw new Error(`Upgrade changed protected representative records (${before.slice(0, 12)} != ${after.slice(0, 12)}).`);

let capability = null;
for (let attempt = 0; attempt < 10; attempt += 1) {
  const result = await db.from("consumer_game_entitlements").select("capability_key").eq("user_id", userId).single();
  if (!result.error) { capability = result.data?.capability_key; break; }
  if (attempt === 9) throw result.error;
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
}
if (capability !== "MATHNEXA_ALL_ACCESS") throw new Error("Upgrade did not reconcile the exact all-access capability.");
let catalog = null;
for (let attempt = 0; attempt < 50; attempt += 1) {
  const result = await db.from("game_catalog_entries").select("stable_key,slug,launch_type,canonical_route,status,display_order").eq("stable_key", "math-vocabulary-hunt").single();
  if (!result.error) { catalog = result.data; break; }
  if (attempt === 49) throw result.error;
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
}
if (JSON.stringify(catalog) !== JSON.stringify({ stable_key: "math-vocabulary-hunt", slug: "math-vocabulary-hunt", launch_type: "canonical", canonical_route: "/play", status: "published", display_order: 1 })) {
  throw new Error("Canonical game catalog reconciliation failed.");
}

const deleted = await db.auth.admin.deleteUser(userId);
if (deleted.error) throw deleted.error;
for (const [table, column] of [
  ["consumer_accounts", "user_id"], ["consumer_game_entitlements", "user_id"],
  ["consumer_commercial_acceptances", "owner_user_id"], ["consumer_checkout_acceptance_bindings", "owner_user_id"]
]) {
  const result = await db.from(table).select(column, { count: "exact", head: true }).eq(column, userId);
  if (result.error || result.count !== 0) throw result.error ?? new Error(`Upgrade fixture cleanup failed for ${table}.`);
}
console.log(`Phase 9B upgrade-from-current passed: protected fingerprint ${before.slice(0, 12)} remained exact; capability/catalog reconciled; synthetic cleanup is zero.`);
