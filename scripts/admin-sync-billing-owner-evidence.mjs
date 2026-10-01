/**
 * READ-ONLY evidence for the owner-approved production "Sync with Stripe" test.
 *
 * Launched by scripts/invoke-admin-sync-billing-owner-evidence.ps1 with the
 * production project ref, database password and service key, plus (when the
 * vault holds it) the RESTRICTED read-only live Stripe key. Run once before the
 * owner presses Sync with Stripe and once after (with OWNER_EVIDENCE_SINCE set
 * to the "before" timestamp). Writes nothing anywhere:
 *
 *  - database: SELECT statements only, through the session pooler;
 *  - Stripe: retrieve/list calls only, and only with an rk_live_ key.
 *
 * Output: the owner account's status, entitlement, billing projection and sync
 * timestamps (Stripe/row identifiers reduced to 6-character suffixes), digests
 * of the owner's rows and of every OTHER customer's rows, operation and audit
 * counts, webhook receipts, and (with the key) Stripe's own view plus any
 * charge, refund or subscription event for the customer since OWNER_EVIDENCE_SINCE.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const STAGING_PROJECT_REF = "gcmuhzxkwvfireyrearl";
const PRODUCTION_QUIZ_ID_PREFIXES = Object.freeze(["83d9252f", "42215d2a", "5b8bdc39", "1d80b325", "e01a72e2", "3e25faa1", "339aa712", "7654e5e9"]);
const POOLER_HOSTS = ["aws-0-us-east-2.pooler.supabase.com", "aws-1-us-east-2.pooler.supabase.com"];
const STRIPE_API_VERSION = "2026-07-29.dahlia";
const supabaseCli = resolve("node_modules/supabase/dist/supabase.js");
const secrets = [];
const evidence = { label: process.env.OWNER_EVIDENCE_LABEL || "snapshot", takenAt: new Date().toISOString() };

function redact(text) {
  let value = String(text ?? "");
  for (const secret of secrets) if (secret) value = value.split(secret).join("[redacted]");
  return value.replace(/postgresql:\/\/\S+/g, "postgresql://[redacted]").replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[sbkey]").replace(/rk_live_[A-Za-z0-9]+/g, "[rkkey]");
}
function check(condition, message) {
  if (!condition) throw new Error(message);
}
function required(name, pattern) {
  const value = (process.env[name] ?? "").trim();
  check(pattern.test(value), `missing-or-malformed-${name}`);
  secrets.push(value, encodeURIComponent(value));
  return value;
}
for (const name of Object.keys(process.env)) {
  check(!/^MVH_STAGING|^STAGING_|_STAGING$|^SUPABASE_DB_PASSWORD$|^SUPABASE_SECRET_KEY$/.test(name), `refusing: variable ${name} is present in this process`);
  check(!/^STRIPE_/.test(name) || name === "STRIPE_LIVE_READONLY_KEY", `refusing: ${name} is present; only the restricted read-only key may be used`);
}
const ref = required("SUPABASE_PRODUCTION_PROJECT_REF", /^[A-Za-z]{20}$/).toLowerCase();
check(ref !== STAGING_PROJECT_REF, "refusing: the production project ref is the staging project");
const email = (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();
check(/^[^\s@'"\\;]+@[^\s@'"\\;]+\.[^\s@'"\\;]+$/.test(email) && email.length <= 254, "OWNER_EMAIL is missing or malformed");
const sinceText = (process.env.OWNER_EVIDENCE_SINCE ?? "").trim();
const since = sinceText ? new Date(sinceText) : null;
check(!sinceText || (!Number.isNaN(since.getTime()) && since.getTime() < Date.now()), "OWNER_EVIDENCE_SINCE must be a past ISO timestamp");

function cli(commandArgs) {
  const result = spawnSync(process.execPath, [supabaseCli, ...commandArgs, "--yes"], {
    encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" }
  });
  return { ok: result.status === 0, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}
function parseRows(output) {
  const starts = [output.indexOf("["), output.indexOf("{")].filter((index) => index !== -1);
  check(starts.length > 0, `query-output-unreadable:${redact(output).slice(-300)}`);
  const parsed = JSON.parse(output.slice(Math.min(...starts), Math.max(output.lastIndexOf("]"), output.lastIndexOf("}")) + 1));
  return Array.isArray(parsed) ? parsed : parsed.rows ?? parsed.result ?? parsed.data ?? [];
}
function connect() {
  const password = required("SUPABASE_PRODUCTION_DB_PASSWORD", /^.{12,}$/);
  for (const host of POOLER_HOSTS) {
    const url = `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${host}:5432/postgres`;
    if (cli(["db", "query", "--db-url", url, "-o", "json", "select 1 as ok"]).ok) {
      secrets.push(url);
      return (query) => {
        check(/^\s*(select|with)\b/i.test(query), "read-only-guard: only SELECT statements are allowed");
        const result = cli(["db", "query", "--db-url", url, "-o", "json", query]);
        check(result.ok, `query-failed:${redact(result.output).slice(-400)}`);
        return parseRows(result.output);
      };
    }
  }
  throw new Error("production-database-unreachable");
}

async function identify(sql) {
  const database = sql(`select (select count(*) from public.consumer_accounts)::int as accounts,
    (select string_agg(stable_key || ':' || status, ',' order by stable_key) from public.game_catalog_entries) as games,
    (select count(*) from public.content_resources where resource_type in ('quiz','quiz_pdf') and left(id::text, 8) in (${PRODUCTION_QUIZ_ID_PREFIXES.map((prefix) => `'${prefix}'`).join(",")}))::int as production_quizzes`)[0];
  const secretKey = required("SUPABASE_PRODUCTION_SECRET_KEY", /^(sb_secret_|eyJ).{16,}/);
  const client = createClient(`https://${ref}.supabase.co`, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const accounts = await client.from("consumer_accounts").select("user_id", { count: "exact", head: true });
  const games = await client.from("game_catalog_entries").select("stable_key,status").order("stable_key");
  check(!accounts.error && !games.error, "production-api-rejected-the-vault-service-key");
  check(database.accounts === accounts.count && database.games === games.data.map((row) => `${row.stable_key}:${row.status}`).join(","), "pooler-database-and-production-api-differ");
  check(database.production_quizzes === PRODUCTION_QUIZ_ID_PREFIXES.length, "production-quiz-fingerprint-missing-refusing");
  evidence.environment = "PRODUCTION";
}

const suffix = (value) => (typeof value === "string" && value ? `..${value.slice(-6)}` : null);
const iso = (seconds) => (typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null);

async function stripeView(customerId) {
  const key = (process.env.STRIPE_LIVE_READONLY_KEY ?? "").trim();
  if (!key) return { available: false, reason: "no STRIPE_LIVE_READONLY_KEY in the vault" };
  check(/^rk_live_[A-Za-z0-9]+$/.test(key), "refusing: STRIPE_LIVE_READONLY_KEY must be a restricted rk_live_ key");
  secrets.push(key);
  const stripe = new Stripe(key, { apiVersion: STRIPE_API_VERSION, maxNetworkRetries: 2 });
  const view = { available: true };
  const attempt = async (name, run) => {
    try { view[name] = await run(); } catch (error) { view[name] = { error: redact(error?.type ?? error?.code ?? "request-failed"), status: error?.statusCode ?? null }; }
  };
  await attempt("customer", async () => {
    const customer = await stripe.customers.retrieve(customerId);
    return { deleted: Boolean(customer.deleted), livemode: customer.livemode ?? null };
  });
  await attempt("subscriptions", async () => {
    const list = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 20 });
    return list.data.map((subscription) => {
      const item = subscription.items?.data?.[0];
      return {
        subscription: suffix(subscription.id), status: subscription.status, livemode: subscription.livemode,
        cancelAtPeriodEnd: subscription.cancel_at_period_end, cancelAt: iso(subscription.cancel_at), canceledAt: iso(subscription.canceled_at), endedAt: iso(subscription.ended_at),
        currentPeriodStart: iso(subscription.current_period_start ?? item?.current_period_start), currentPeriodEnd: iso(subscription.current_period_end ?? item?.current_period_end),
        latestInvoice: suffix(typeof subscription.latest_invoice === "string" ? subscription.latest_invoice : subscription.latest_invoice?.id)
      };
    });
  });
  if (since) {
    const gte = Math.floor(since.getTime() / 1000);
    await attempt("chargesSince", async () => {
      const list = await stripe.charges.list({ customer: customerId, created: { gte }, limit: 100 });
      return { count: list.data.length, charges: list.data.map((charge) => ({ charge: suffix(charge.id), status: charge.status, amount: charge.amount, refunded: charge.amount_refunded, created: iso(charge.created) })) };
    });
    await attempt("refundsSinceAccountWide", async () => {
      const list = await stripe.refunds.list({ created: { gte }, limit: 100 });
      return { count: list.data.length };
    });
    await attempt("customerEventsSince", async () => {
      const list = await stripe.events.list({ created: { gte }, limit: 100 });
      const mine = list.data.filter((event) => event.data?.object?.customer === customerId || event.data?.object?.id === customerId);
      return { accountWideEvents: list.data.length, customerEvents: mine.map((event) => ({ type: event.type, created: iso(event.created) })) };
    });
  }
  return view;
}

async function main() {
  const sql = connect();
  await identify(sql);
  const matches = sql(`select id::text as id from auth.users where lower(email) = '${email}'`);
  check(matches.length === 1, `owner-account-not-found-or-ambiguous:${matches.length}`);
  const id = matches[0].id;
  check(/^[0-9a-f-]{36}$/.test(id), "owner-id-malformed");
  secrets.push(id);
  const row = sql(`select
    (select to_jsonb(a) - 'user_id' from public.consumer_accounts a where user_id = '${id}') as account,
    exists(select 1 from public.admin_users where user_id = '${id}' and revoked_at is null) as is_admin_identity,
    (select to_jsonb(e) - 'user_id' - 'source_reference_hash' - 'trial_redemption_checkout_hash' from public.consumer_game_entitlements e where user_id = '${id}') as entitlement,
    (select count(*) from public.consumer_complimentary_entitlements where owner_user_id = '${id}' and revoked_at is null and expires_at > statement_timestamp())::int as complimentary_active,
    (select jsonb_agg((to_jsonb(c) - 'id' - 'owner_teacher_id' - 'owner_consumer_id' - 'stripe_customer_id') || jsonb_build_object('customer', '..' || right(stripe_customer_id, 6))) from public.billing_customers c where owner_consumer_id = '${id}') as customers,
    (select jsonb_agg((to_jsonb(s) - 'id' - 'owner_teacher_id' - 'owner_consumer_id' - 'billing_customer_id' - 'stripe_subscription_id' - 'stripe_price_id' - 'latest_invoice_id') || jsonb_build_object('subscription', '..' || right(stripe_subscription_id, 6), 'latest_invoice', '..' || right(latest_invoice_id, 6)) order by s.updated_at desc) from public.billing_subscriptions s where owner_consumer_id = '${id}') as subscriptions`)[0];
  evidence.owner = {
    accountFound: true,
    isAdminIdentity: row.is_admin_identity,
    account: row.account,
    entitlement: row.entitlement,
    complimentaryActive: row.complimentary_active,
    customers: row.customers,
    subscriptions: row.subscriptions
  };
  evidence.digests = sql(`select
    md5(coalesce((select string_agg(to_jsonb(s)::text, ',' order by s.id) from public.billing_subscriptions s where owner_consumer_id = '${id}'), '')) as owner_subscriptions,
    md5(coalesce((select string_agg(to_jsonb(e)::text, ',' order by e.user_id) from public.consumer_game_entitlements e where user_id = '${id}'), '')) as owner_entitlement,
    md5(coalesce((select string_agg(to_jsonb(c)::text, ',' order by c.id) from public.billing_customers c where owner_consumer_id = '${id}'), '')) as owner_customer,
    md5(coalesce((select string_agg(to_jsonb(a)::text, ',' order by a.user_id) from public.consumer_accounts a where user_id = '${id}'), '')) as owner_account,
    md5(coalesce((select string_agg(to_jsonb(s)::text, ',' order by s.id) from public.billing_subscriptions s where owner_consumer_id is distinct from '${id}'), '')) as other_subscriptions,
    md5(coalesce((select string_agg(to_jsonb(e)::text, ',' order by e.user_id) from public.consumer_game_entitlements e where user_id <> '${id}'), '')) as other_entitlements,
    md5(coalesce((select string_agg(to_jsonb(c)::text, ',' order by c.id) from public.billing_customers c where owner_consumer_id is distinct from '${id}'), '')) as other_customers,
    md5(coalesce((select string_agg(to_jsonb(a)::text, ',' order by a.user_id) from public.consumer_accounts a where user_id <> '${id}'), '')) as other_accounts,
    md5(coalesce((select string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text) from public.consumer_complimentary_entitlements x), '')) as complimentary_all`)[0];
  evidence.counts = sql(`select
    (select count(*) from public.consumer_accounts)::int as accounts,
    (select count(*) from auth.users)::int as auth_users,
    (select count(*) from public.consumer_game_entitlements)::int as entitlements,
    (select count(*) from public.billing_customers)::int as billing_customers,
    (select count(*) from public.billing_subscriptions)::int as subscriptions,
    (select count(*) from public.billing_webhook_events)::int as webhook_events,
    (select max(received_at) from public.billing_webhook_events) as latest_webhook_received_at,
    (select count(*) from public.admin_account_operations)::int as operations,
    (select count(*) from public.admin_account_operations where target_user_id = '${id}')::int as owner_operations,
    (select count(*) from public.admin_audit_log)::int as audit_rows,
    (select count(*) from public.admin_audit_log where target = '${id}')::int as owner_audit_rows`)[0];
  evidence.ownerOperations = sql(`select operation, operation_state, error_code, created_at, completed_at, before_snapshot, after_snapshot
    from public.admin_account_operations where target_user_id = '${id}' order by created_at`);
  if (since) {
    evidence.since = since.toISOString();
    evidence.ownerAuditSince = sql(`select action, created_at, metadata - 'operation_id' as metadata from public.admin_audit_log
      where target = '${id}' and created_at >= '${since.toISOString()}' order by created_at, action`);
    evidence.adminAuditSince = sql(`select action, count(*)::int as rows from public.admin_audit_log
      where created_at >= '${since.toISOString()}' group by action order by action`);
    evidence.webhooksSince = sql(`select event_type, processing_state, count(*)::int as rows from public.billing_webhook_events
      where received_at >= '${since.toISOString()}' group by 1, 2 order by 1, 2`);
  }
  const customer = sql(`select stripe_customer_id from public.billing_customers where owner_consumer_id = '${id}' and stripe_environment = 'live'`);
  if (customer.length === 1) {
    secrets.push(customer[0].stripe_customer_id);
    evidence.stripe = await stripeView(customer[0].stripe_customer_id);
  } else {
    evidence.stripe = { available: false, reason: `live billing customers for the owner: ${customer.length}` };
  }
}

try {
  await main();
  evidence.result = "PASS";
} catch (error) {
  evidence.result = "FAIL";
  evidence.error = redact(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
process.stdout.write(`${redact(JSON.stringify(evidence, null, 2))}\n`);
