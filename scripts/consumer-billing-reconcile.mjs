// Consumer subscription drift audit and reconciliation.
//
// Dry run by default. Compares every local consumer subscription projection
// with the authoritative Stripe subscription and prints a redacted report:
//   MATCHED / MISMATCHED / SELF-REPAIRABLE / AMBIGUOUS / REQUIRES HUMAN REVIEW
// Nothing is written unless --apply is given. Live credentials are refused
// unless --environment=live is given explicitly, and --apply against live
// additionally requires --owner-approved.
//
// Environment (process-only; never paste into chat or commit):
//   SUPABASE_URL, SUPABASE_SECRET_KEY      server-only database access
//   STRIPE_SECRET_KEY                       sk_test_ (default) or sk_live_ with --environment=live
//   STRIPE_PRODUCT_MATHNEXA, STRIPE_PRICE_MATHNEXA_MONTHLY
//   STRIPE_LEGACY_PRICE_IDS_MATHNEXA_MONTHLY (optional, comma separated)
//   BILLING_RENEWAL_GRACE_DAYS              default 7
//
// Output never contains emails, card data, customer ids, or full subscription ids.
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const API_VERSION = "2026-07-29.dahlia";
const TERMINAL = new Set(["canceled", "incomplete_expired"]);
const KNOWN = new Set(["active", "trialing", "incomplete", "incomplete_expired", "past_due", "unpaid", "paused", "canceled"]);

const args = new Map(process.argv.slice(2).map((arg) => { const [key, value = "true"] = arg.split("=", 2); return [key, value]; }));
const apply = args.has("--apply");
const environment = args.get("--environment") ?? "test";
const ownerFilter = args.get("--owner") ?? null;
const limit = Number(args.get("--limit") ?? "500");
if (environment !== "test" && environment !== "live") throw new Error("--environment must be test or live");
if (environment === "live" && apply && !args.has("--owner-approved")) throw new Error("Applying to live requires --owner-approved after an explicit owner decision");

const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
if (!key.startsWith(`sk_${environment}_`)) throw new Error(`STRIPE_SECRET_KEY must be an sk_${environment}_ key for --environment=${environment}`);
const dbUrl = process.env.SUPABASE_URL?.trim() ?? "";
const dbKey = process.env.SUPABASE_SECRET_KEY?.trim() ?? "";
if (!dbUrl || !dbKey) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required");
const productId = process.env.STRIPE_PRODUCT_MATHNEXA?.trim() ?? "";
const priceId = process.env.STRIPE_PRICE_MATHNEXA_MONTHLY?.trim() ?? "";
if (!productId.startsWith("prod_") || !priceId.startsWith("price_")) throw new Error("STRIPE_PRODUCT_MATHNEXA and STRIPE_PRICE_MATHNEXA_MONTHLY are required");
const acceptedPrices = new Set([priceId, ...(process.env.STRIPE_LEGACY_PRICE_IDS_MATHNEXA_MONTHLY ?? "").split(",").map((value) => value.trim()).filter(Boolean)]);
const graceDays = Number(process.env.BILLING_RENEWAL_GRACE_DAYS ?? "7");

const stripe = new Stripe(key, { apiVersion: API_VERSION });
const db = createClient(dbUrl, dbKey, { auth: { persistSession: false, autoRefreshToken: false } });

const iso = (seconds) => typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null;
const redactOwner = (id) => `${String(id).slice(0, 8)}…`;
const redactSub = (id) => id ? `…${String(id).slice(-6)}` : "—";
const sameInstant = (left, right) => (left === null && right === null) || (left !== null && right !== null && Date.parse(left) === Date.parse(right));

function snapshot(subscription) {
  const item = subscription.items?.data?.[0];
  const raw = subscription;
  return {
    id: subscription.id,
    status: subscription.status,
    priceId: item?.price?.id ?? null,
    productId: typeof item?.price?.product === "string" ? item.price.product : item?.price?.product?.id ?? null,
    quantity: item?.quantity ?? null,
    currentPeriodStart: iso(raw.current_period_start ?? item?.current_period_start),
    currentPeriodEnd: iso(raw.current_period_end ?? item?.current_period_end),
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
    canceledAt: iso(subscription.canceled_at),
    endedAt: iso(subscription.ended_at),
    trialStart: iso(subscription.trial_start),
    trialEnd: iso(subscription.trial_end),
    latestInvoiceId: typeof subscription.latest_invoice === "string" ? subscription.latest_invoice : subscription.latest_invoice?.id ?? null,
    ownerUserId: subscription.metadata?.mathnexa_account_id ?? null
  };
}

async function main() {
  let query = db.from("billing_customers").select("owner_consumer_id, stripe_customer_id").eq("stripe_environment", environment).not("owner_consumer_id", "is", null).limit(limit);
  if (ownerFilter) query = query.eq("owner_consumer_id", ownerFilter);
  const customers = await query;
  if (customers.error) throw new Error("Unable to read billing customers");

  const report = { checked: 0, matched: 0, mismatched: 0, selfRepairable: 0, ambiguous: 0, humanReview: 0, applied: 0, applyFailed: 0 };
  const lines = [];

  for (const customer of customers.data) {
    report.checked += 1;
    const owner = customer.owner_consumer_id;
    const local = await db.from("billing_subscriptions")
      .select("stripe_subscription_id, subscription_status, current_period_end, cancel_at_period_end, trial_end, last_synchronized_at")
      .eq("owner_consumer_id", owner).eq("stripe_environment", environment);
    if (local.error) throw new Error("Unable to read billing subscriptions");
    const entitlement = await db.from("consumer_game_entitlements").select("entitlement_state, current_period_ends_at, grace_ends_at, trial_ends_at").eq("user_id", owner).maybeSingle();
    if (entitlement.error) throw new Error("Unable to read entitlements");

    let remote;
    try {
      const listed = await stripe.subscriptions.list({ customer: customer.stripe_customer_id, status: "all", limit: 100 });
      remote = listed.data.map(snapshot);
    } catch {
      report.humanReview += 1;
      lines.push(`${redactOwner(owner)}  HUMAN REVIEW  provider read failed`);
      continue;
    }

    const live = remote.filter((subscription) => !TERMINAL.has(subscription.status));
    const unknown = remote.filter((subscription) => !KNOWN.has(subscription.status));
    const foreign = remote.filter((subscription) => subscription.ownerUserId !== owner || !acceptedPrices.has(subscription.priceId) || subscription.productId !== productId || subscription.quantity !== 1);
    if (live.length > 1 || unknown.length > 0 || foreign.length > 0) {
      report.ambiguous += 1;
      lines.push(`${redactOwner(owner)}  AMBIGUOUS  live=${live.length} unknownStatus=${unknown.length} foreign=${foreign.length}`);
      continue;
    }

    const current = live[0] ?? null;
    const localCurrent = local.data.find((row) => !TERMINAL.has(row.subscription_status)) ?? null;
    const localById = new Map(local.data.map((row) => [row.stripe_subscription_id, row]));
    const differences = [];
    for (const subscription of remote) {
      const row = localById.get(subscription.id);
      if (!row) { differences.push(`${redactSub(subscription.id)} missing locally (${subscription.status})`); continue; }
      if (row.subscription_status !== subscription.status) differences.push(`${redactSub(subscription.id)} status local=${row.subscription_status} stripe=${subscription.status}`);
      if (!sameInstant(row.current_period_end, subscription.currentPeriodEnd)) differences.push(`${redactSub(subscription.id)} period_end local=${row.current_period_end ?? "—"} stripe=${subscription.currentPeriodEnd ?? "—"}`);
      if (row.cancel_at_period_end !== subscription.cancelAtPeriodEnd) differences.push(`${redactSub(subscription.id)} cancel_at_period_end local=${row.cancel_at_period_end} stripe=${subscription.cancelAtPeriodEnd}`);
    }
    if (localCurrent && (!current || current.id !== localCurrent.stripe_subscription_id)) differences.push(`local current ${redactSub(localCurrent.stripe_subscription_id)} is not live at Stripe`);
    const state = entitlement.data?.entitlement_state ?? "none";
    const nowMs = Date.now();
    const locallyGranted = (["subscription-active", "subscription-canceled-through-period-end"].includes(state) && entitlement.data?.current_period_ends_at && Date.parse(entitlement.data.current_period_ends_at) > nowMs) ||
      (state === "subscription-grace-period" && entitlement.data?.grace_ends_at && Date.parse(entitlement.data.grace_ends_at) > nowMs) ||
      (state === "trial-active" && entitlement.data?.trial_ends_at && Date.parse(entitlement.data.trial_ends_at) > nowMs);
    const remotelyEntitled = current && ((current.status === "active" && current.currentPeriodEnd && Date.parse(current.currentPeriodEnd) > nowMs) || (current.status === "trialing" && current.trialEnd && Date.parse(current.trialEnd) > nowMs));
    if (Boolean(remotelyEntitled) !== Boolean(locallyGranted)) differences.push(`entitlement local=${state}${locallyGranted ? "(granted)" : "(denied)"} stripe=${current ? current.status : "none"}`);

    if (differences.length === 0) { report.matched += 1; lines.push(`${redactOwner(owner)}  MATCHED  ${current ? `${current.status} through ${current.currentPeriodEnd}` : "no live subscription"}`); continue; }
    report.mismatched += 1;
    report.selfRepairable += 1;
    lines.push(`${redactOwner(owner)}  MISMATCHED (self-repairable)  ${differences.join("; ")}`);

    if (apply) {
      const ordered = [...remote].sort((left, right) => (TERMINAL.has(left.status) ? 0 : 1) - (TERMINAL.has(right.status) ? 0 : 1));
      let failed = false;
      for (const subscription of ordered) {
        let paidAt = null;
        if (!TERMINAL.has(subscription.status) && subscription.latestInvoiceId) {
          try {
            const invoice = await stripe.invoices.retrieve(subscription.latestInvoiceId);
            if (invoice.status === "paid" && (invoice.amount_paid ?? 0) > 0) paidAt = iso(invoice.status_transitions?.paid_at);
          } catch { paidAt = null; }
        }
        const both = subscription.currentPeriodStart && subscription.currentPeriodEnd;
        const result = await db.rpc("synchronize_consumer_billing_subscription", {
          p_source: "reconciliation", p_event_record_id: null, p_event_type: null, p_owner_user_id: owner, p_stripe_environment: environment,
          p_stripe_customer_id: customer.stripe_customer_id, p_stripe_subscription_id: subscription.id, p_stripe_price_id: subscription.priceId ?? "",
          p_subscription_status: subscription.status, p_current_period_start: both ? subscription.currentPeriodStart : null, p_current_period_end: both ? subscription.currentPeriodEnd : null,
          p_cancel_at_period_end: subscription.cancelAtPeriodEnd, p_canceled_at: subscription.canceledAt, p_ended_at: subscription.endedAt,
          p_trial_start: subscription.trialStart, p_trial_end: subscription.trialEnd, p_latest_invoice_id: subscription.latestInvoiceId, p_latest_invoice_paid_at: paidAt,
          p_observed_at: new Date().toISOString(), p_grace_days: graceDays, p_emergency_default_deny: false
        });
        if (result.error) { failed = true; lines.push(`${redactOwner(owner)}  APPLY FAILED  ${redactSub(subscription.id)} ${result.error.message}`); break; }
        lines.push(`${redactOwner(owner)}  APPLIED  ${redactSub(subscription.id)} -> ${result.data}`);
      }
      if (failed) report.applyFailed += 1; else report.applied += 1;
    }
  }

  console.log(`Consumer subscription drift audit (${environment}, ${apply ? "APPLY" : "DRY RUN"})`);
  for (const line of lines) console.log(`  ${line}`);
  console.log("");
  console.log(`TOTAL SUBSCRIBERS CHECKED  ${report.checked}`);
  console.log(`MATCHED                    ${report.matched}`);
  console.log(`MISMATCHED                 ${report.mismatched}`);
  console.log(`SELF-REPAIRABLE            ${report.selfRepairable}`);
  console.log(`AMBIGUOUS                  ${report.ambiguous}`);
  console.log(`REQUIRES HUMAN REVIEW      ${report.humanReview}`);
  if (apply) console.log(`APPLIED / FAILED           ${report.applied} / ${report.applyFailed}`);
  else console.log("No writes were made. Re-run with --apply (and --owner-approved for live) to repair the mismatched rows.");
  process.exitCode = report.applyFailed > 0 ? 1 : 0;
}

await main();
