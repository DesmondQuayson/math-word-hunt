// READ-ONLY consumer billing diagnosis.
//
// Compares Stripe (webhook endpoint configuration, recent event delivery
// backlog, subscriptions) with the platform database (subscription projection,
// entitlement, webhook receipts). Performs no write anywhere: every Stripe call
// is a retrieve/list and every database call is a select. Output is redacted:
// no emails, no card data, no full customer or subscription ids, no secrets.
//
// Environment (process-only):
//   STRIPE_SECRET_KEY        sk_test_ or sk_live_ (must match --environment)
//   SUPABASE_URL             project URL
//   SUPABASE_SECRET_KEY      server-only key (read-only use here)
// Usage: node scripts/consumer-billing-diagnose.mjs --environment=test|live [--hours=168]
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const API_VERSION = "2026-07-29.dahlia";
const TERMINAL = new Set(["canceled", "incomplete_expired"]);
const args = new Map(process.argv.slice(2).map((arg) => { const [key, value = "true"] = arg.split("=", 2); return [key, value]; }));
const environment = args.get("--environment") ?? "test";
const hours = Number(args.get("--hours") ?? "168");
if (environment !== "test" && environment !== "live") throw new Error("--environment must be test or live");

const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
// A restricted read-only key (rk_) is preferred for live diagnosis; a secret key is accepted for test mode.
if (!key.startsWith(`sk_${environment}_`) && !key.startsWith(`rk_${environment}_`)) throw new Error(`STRIPE_SECRET_KEY must be sk_${environment}_ or rk_${environment}_ for --environment=${environment}`);
const dbUrl = process.env.SUPABASE_URL?.trim() ?? "";
const dbKey = process.env.SUPABASE_SECRET_KEY?.trim() ?? "";
if (!dbUrl || !dbKey) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required");

const stripe = new Stripe(key, { apiVersion: API_VERSION, maxNetworkRetries: 2 });
const db = createClient(dbUrl, dbKey, { auth: { persistSession: false, autoRefreshToken: false } });

const iso = (seconds) => typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null;
const suffix = (id) => id ? `…${String(id).slice(-6)}` : "—";
const prefix = (id) => id ? `${String(id).slice(0, 8)}…` : "—";
const day = (value) => value ? String(value).slice(0, 10) : "—";
const host = (url) => { try { const parsed = new URL(url); return `${parsed.host}${parsed.pathname}`; } catch { return "(unparseable)"; } };

function section(title) { console.log(`\n== ${title}`); }

async function webhookEndpoints() {
  section("Stripe webhook endpoints (this mode)");
  const endpoints = await stripe.webhookEndpoints.list({ limit: 20 });
  if (endpoints.data.length === 0) console.log("  NONE CONFIGURED");
  for (const endpoint of endpoints.data) {
    const events = endpoint.enabled_events ?? [];
    const wanted = ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "invoice.paid", "invoice.payment_succeeded", "invoice.payment_failed", "customer.deleted"];
    const missing = events.includes("*") ? [] : wanted.filter((type) => !events.includes(type) && !(type === "invoice.paid" && events.includes("invoice.payment_succeeded")) && !(type === "invoice.payment_succeeded" && events.includes("invoice.paid")));
    console.log(`  endpoint ${suffix(endpoint.id)}  status=${endpoint.status}  url=${host(endpoint.url)}  api_version=${endpoint.api_version ?? "(account default)"}  pinned_sdk=${API_VERSION}  match=${endpoint.api_version === API_VERSION}`);
    console.log(`    enabled_events=${events.includes("*") ? "* (all)" : events.length}  missing_for_this_app=${missing.length ? missing.join(",") : "none"}`);
  }
  return endpoints.data;
}

async function eventBacklog() {
  section(`Stripe events, last ${hours}h (pending_webhooks > 0 means Stripe has NOT received a 2xx yet)`);
  const since = Math.floor(Date.now() / 1000) - hours * 3600;
  const types = ["customer.subscription.updated", "customer.subscription.created", "customer.subscription.deleted", "invoice.paid", "invoice.payment_succeeded", "invoice.payment_failed", "checkout.session.completed"];
  const events = await stripe.events.list({ created: { gte: since }, types, limit: 100 });
  const byType = new Map();
  let undelivered = 0;
  const undeliveredSamples = [];
  for (const event of events.data) {
    const entry = byType.get(event.type) ?? { total: 0, pending: 0 };
    entry.total += 1;
    if (event.pending_webhooks > 0) { entry.pending += 1; undelivered += 1; if (undeliveredSamples.length < 8) undeliveredSamples.push(`${event.type} ${iso(event.created)} pending=${event.pending_webhooks} api_version=${event.api_version}`); }
    byType.set(event.type, entry);
  }
  console.log(`  events returned=${events.data.length}${events.has_more ? " (more exist)" : ""}  undelivered=${undelivered}`);
  for (const [type, entry] of [...byType.entries()].sort()) console.log(`  ${type.padEnd(32)} total=${entry.total} undelivered=${entry.pending}`);
  for (const sample of undeliveredSamples) console.log(`    UNDELIVERED ${sample}`);
  return { total: events.data.length, undelivered };
}

async function stripeSubscriptions() {
  section("Stripe subscriptions (all statuses)");
  const list = await stripe.subscriptions.list({ status: "all", limit: 100, expand: ["data.latest_invoice"] });
  const snapshots = list.data.map((subscription) => {
    const item = subscription.items?.data?.[0];
    const invoice = subscription.latest_invoice && typeof subscription.latest_invoice === "object" ? subscription.latest_invoice : null;
    return {
      id: subscription.id,
      customer: typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? null,
      owner: subscription.metadata?.mathnexa_account_id ?? null,
      status: subscription.status,
      periodEnd: iso(subscription.current_period_end ?? item?.current_period_end),
      cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
      endedAt: iso(subscription.ended_at),
      latestInvoiceStatus: invoice?.status ?? null,
      latestInvoicePaidAt: iso(invoice?.status_transitions?.paid_at),
      latestInvoiceAmountPaid: invoice?.amount_paid ?? null,
      created: iso(subscription.created)
    };
  });
  console.log(`  subscriptions=${snapshots.length}${list.has_more ? " (more exist)" : ""}`);
  for (const s of snapshots) {
    console.log(`  sub ${suffix(s.id)} owner=${prefix(s.owner)} status=${s.status} period_end=${day(s.periodEnd)} cancel_at_end=${s.cancelAtPeriodEnd} ended=${day(s.endedAt)} latest_invoice=${s.latestInvoiceStatus ?? "—"} paid_at=${day(s.latestInvoicePaidAt)} amount_paid=${s.latestInvoiceAmountPaid ?? "—"} created=${day(s.created)}`);
  }
  return snapshots;
}

async function localState(snapshots) {
  section("Local projection vs Stripe");
  const subscriptions = await db.from("billing_subscriptions")
    .select("owner_consumer_id, stripe_subscription_id, subscription_status, current_period_end, cancel_at_period_end, trial_end, latest_authoritative_event_created_at, updated_at")
    .eq("stripe_environment", environment).not("owner_consumer_id", "is", null);
  if (subscriptions.error) throw new Error("billing_subscriptions read failed");
  const entitlements = await db.from("consumer_game_entitlements").select("user_id, entitlement_state, current_period_ends_at, grace_ends_at, trial_ends_at");
  if (entitlements.error) throw new Error("consumer_game_entitlements read failed");
  const byUser = new Map(entitlements.data.map((row) => [row.user_id, row]));
  const localById = new Map(subscriptions.data.map((row) => [row.stripe_subscription_id, row]));
  const nowMs = Date.now();
  const report = { checked: 0, matched: 0, mismatched: 0, missingLocally: 0, paidButLocallyDenied: 0 };
  for (const remote of snapshots) {
    report.checked += 1;
    const local = localById.get(remote.id);
    if (!local) { report.missingLocally += 1; console.log(`  sub ${suffix(remote.id)} MISSING LOCALLY (stripe ${remote.status})`); continue; }
    const entitlement = byUser.get(local.owner_consumer_id);
    const state = entitlement?.entitlement_state ?? "none";
    const locallyGranted = (["subscription-active", "subscription-canceled-through-period-end"].includes(state) && entitlement?.current_period_ends_at && Date.parse(entitlement.current_period_ends_at) > nowMs) ||
      (state === "subscription-grace-period" && entitlement?.grace_ends_at && Date.parse(entitlement.grace_ends_at) > nowMs) ||
      (state === "trial-active" && entitlement?.trial_ends_at && Date.parse(entitlement.trial_ends_at) > nowMs);
    const remotelyEntitled = !TERMINAL.has(remote.status) && ((remote.status === "active" && remote.periodEnd && Date.parse(remote.periodEnd) > nowMs) || remote.status === "trialing");
    const samePeriod = (local.current_period_end === null && remote.periodEnd === null) || (local.current_period_end && remote.periodEnd && Date.parse(local.current_period_end) === Date.parse(remote.periodEnd));
    const sameStatus = local.subscription_status === remote.status;
    const matched = sameStatus && samePeriod && Boolean(locallyGranted) === Boolean(remotelyEntitled);
    if (matched) report.matched += 1; else report.mismatched += 1;
    if (remotelyEntitled && !locallyGranted) report.paidButLocallyDenied += 1;
    console.log(`  sub ${suffix(remote.id)} owner=${prefix(local.owner_consumer_id)} ${matched ? "MATCHED   " : "MISMATCHED"}  STRIPE status=${remote.status} period_end=${day(remote.periodEnd)}  LOCAL status=${local.subscription_status} period_end=${day(local.current_period_end)} last_event=${day(local.latest_authoritative_event_created_at)}  ENTITLEMENT=${state} ends=${day(entitlement?.current_period_ends_at)} granted=${Boolean(locallyGranted)}`);
  }
  const receipts = await db.from("billing_webhook_events").select("event_type, processing_state, failure_class, received_at, event_created_at, api_version").eq("stripe_environment", environment).order("received_at", { ascending: false }).limit(200);
  if (receipts.error) throw new Error("billing_webhook_events read failed");
  section("Local webhook receipts (latest 200)");
  const stateCounts = new Map();
  let newest = null; let oldest = null;
  const versions = new Set();
  for (const row of receipts.data) {
    const k = `${row.event_type} ${row.processing_state}${row.failure_class ? `/${row.failure_class}` : ""}`;
    stateCounts.set(k, (stateCounts.get(k) ?? 0) + 1);
    newest = newest ?? row.received_at; oldest = row.received_at;
    if (row.api_version) versions.add(row.api_version);
  }
  console.log(`  receipts=${receipts.data.length} newest=${day(newest)} oldest=${day(oldest)} api_versions_seen=${[...versions].join(",") || "—"}`);
  for (const [k, count] of [...stateCounts.entries()].sort()) console.log(`  ${k.padEnd(60)} ${count}`);
  return report;
}

let endpoints; let backlog; let snapshots; let report;
try {
  endpoints = await webhookEndpoints();
  backlog = await eventBacklog();
  snapshots = await stripeSubscriptions();
  report = await localState(snapshots);
} catch (error) {
  // Never echo a provider error verbatim: Stripe embeds a masked copy of the
  // key in authentication errors. Report the class only.
  const code = error?.code ?? error?.type ?? String(error?.message ?? "unknown").split(":")[0];
  console.log(`
DIAGNOSIS ABORTED: ${String(code).replace(/sk_(test|live)_S+/g, "[key]")}`);
  process.exit(2);
}
section("Summary");
console.log(`  webhook_endpoints=${endpoints.length} events_checked=${backlog.total} undelivered_events=${backlog.undelivered}`);
console.log(`  subscribers_checked=${report.checked} matched=${report.matched} mismatched=${report.mismatched} missing_locally=${report.missingLocally} PAID_BUT_LOCALLY_DENIED=${report.paidButLocallyDenied}`);
console.log("  No writes were made.");
