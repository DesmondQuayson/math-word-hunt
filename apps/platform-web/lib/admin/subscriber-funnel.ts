import "server-only";

import Stripe from "stripe";

import { isWebAnalyticsEnabled } from "@/lib/analytics/web-analytics-config";
import { STRIPE_API_VERSION } from "@/lib/billing/config";
import { tryGetConsumerBillingConfiguration } from "@/lib/billing/consumer-config";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

import {
  computeSubscriberFunnel,
  isReservedTestAddress,
  summarizeSubscriberFunnel,
  type FunnelInput,
  type FunnelInvoice,
  type FunnelPeriod,
  type FunnelRefund,
  type SubscriberFunnelSnapshot
} from "./subscriber-funnel-model";

type Row = Record<string, unknown>;
type Query = PromiseLike<{ data: unknown; error: unknown }>;

const str = (value: unknown): string => typeof value === "string" ? value : "";
const iso = (value: unknown): string | null => typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
const PAGE = 1_000;
const MAX_ROWS = 50_000;
const STRIPE_TIMEOUT_MS = 8_000;
const MAX_INVOICES = 5_000;
const MAX_REFUNDS = 2_000;

/** Every row of a select, a page at a time (the API returns at most 1,000 rows per request). */
async function allRows(page: (from: number, to: number) => Query): Promise<Row[] | null> {
  const collected: Row[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error || !Array.isArray(data)) return null;
    collected.push(...(data as Row[]));
    if (data.length < PAGE) return collected;
  }
  return collected;
}

/** Reserved test addresses among sign-in accounts. Addresses are checked here and never kept or returned. */
async function reservedTestAccounts(client: NonNullable<ReturnType<typeof createServiceSupabaseClient>>): Promise<Set<string> | null> {
  const ids = new Set<string>();
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: PAGE });
    if (error || !data) return null;
    for (const user of data.users) if (isReservedTestAddress(user.email)) ids.add(user.id);
    if (data.users.length < PAGE) return ids;
  }
  return ids;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

/**
 * Read-only: invoices of the customers MathNexa created, from Stripe itself
 * (the authority for what was charged, declined and paid). Returns null with
 * a reason when Stripe is not configured, is the local fixture, or fails.
 */
async function stripeInvoices(customers: ReadonlyMap<string, string>): Promise<{ invoices: FunnelInvoice[] | null; note: string | null }> {
  const config = tryGetConsumerBillingConfiguration();
  if (!config) return { invoices: null, note: "Billing is not configured here, so payments and revenue come only from server records." };
  if (config.provider !== "stripe") return { invoices: null, note: "Local billing fixture: Stripe invoices are not available, so payments and revenue come only from server records." };
  const stripe = new Stripe(config.secretKey, { apiVersion: STRIPE_API_VERSION, maxNetworkRetries: 1, timeout: STRIPE_TIMEOUT_MS });
  try {
    const invoices = await withTimeout((async () => {
      const collected: FunnelInvoice[] = [];
      for await (const invoice of stripe.invoices.list({ limit: 100 })) {
        if (collected.length >= MAX_INVOICES) break;
        const customer = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? "";
        const ownerId = customers.get(customer);
        if (!ownerId || invoice.livemode !== (config.stripeMode === "live")) continue;
        const raw = invoice as unknown as Row;
        const parent = (raw.parent ?? {}) as Row;
        const details = (parent.subscription_details ?? {}) as Row;
        const subscription = details.subscription ?? raw.subscription;
        const paidAtSeconds = Number(((raw.status_transitions ?? {}) as Row).paid_at);
        collected.push({
          ownerId,
          subscriptionId: typeof subscription === "string" ? subscription : str((subscription as Row | null)?.id) || null,
          createdAt: new Date(invoice.created * 1000).toISOString(),
          paidAt: Number.isFinite(paidAtSeconds) && paidAtSeconds > 0 ? new Date(paidAtSeconds * 1000).toISOString() : null,
          status: invoice.status ?? null,
          amountDueMinorUnits: invoice.amount_due,
          amountPaidMinorUnits: invoice.amount_paid,
          attemptCount: invoice.attempt_count
        });
      }
      return collected;
    })(), STRIPE_TIMEOUT_MS * 2);
    return { invoices, note: null };
  } catch {
    return { invoices: null, note: "Stripe could not be read just now, so payment failures, recoveries and revenue are not shown. Reload to try again." };
  }
}

/**
 * Read-only: refunds Stripe completed for the customers MathNexa created.
 * Returns null when Stripe is not configured, is the local fixture, fails, or
 * the key may not read refunds; the view then says refunds are not available.
 */
async function stripeRefunds(customers: ReadonlyMap<string, string>): Promise<FunnelRefund[] | null> {
  const config = tryGetConsumerBillingConfiguration();
  if (!config || config.provider !== "stripe") return null;
  const stripe = new Stripe(config.secretKey, { apiVersion: STRIPE_API_VERSION, maxNetworkRetries: 1, timeout: STRIPE_TIMEOUT_MS });
  try {
    return await withTimeout((async () => {
      const collected: FunnelRefund[] = [];
      let seen = 0;
      for await (const refund of stripe.refunds.list({ limit: 100, expand: ["data.charge"] })) {
        seen += 1;
        if (seen > MAX_REFUNDS) break;
        const charge = refund.charge;
        if (refund.status !== "succeeded" || !charge || typeof charge === "string") continue;
        if (charge.livemode !== (config.stripeMode === "live")) continue;
        const customer = typeof charge.customer === "string" ? charge.customer : charge.customer?.id ?? "";
        const ownerId = customers.get(customer);
        if (!ownerId) continue;
        collected.push({ ownerId, createdAt: new Date(refund.created * 1000).toISOString(), amountMinorUnits: refund.amount });
      }
      return collected;
    })(), STRIPE_TIMEOUT_MS * 2);
  } catch {
    return null;
  }
}

export async function loadSubscriberFunnel(period: FunnelPeriod, now = new Date()): Promise<SubscriberFunnelSnapshot> {
  const config = tryGetConsumerBillingConfiguration();
  const environment: "live" | "test" = config?.stripeMode ?? (isProductionPlatformMode() ? "live" : "test");
  const client = createServiceSupabaseClient();
  const unavailable = computeSubscriberFunnel({
    accounts: [], adminIds: new Set(), testIds: new Set(), subscriptions: [], acceptances: [], stripePagesOpened: [], conversions: [],
    refundRequests: [], invoices: null, invoiceNote: null, refunds: null, conversionLogStartedAt: null, webAnalytics: isWebAnalyticsEnabled() ? "enabled" : "not-enabled",
    adClickAccounts: null
  }, period, environment, now);
  if (!client) return { ...unavailable, state: "unavailable" };

  const [accounts, admins, subscriptions, customers, acceptances, bindings, conversions, refunds, adClicks, settings, testIds] = await Promise.all([
    allRows((from, to) => client.from("consumer_accounts").select("user_id,created_at,email_confirmed_at,trial_redeemed_at").order("created_at").range(from, to)),
    allRows((from, to) => client.from("admin_users").select("user_id").is("revoked_at", null).range(from, to)),
    allRows((from, to) => client.from("billing_subscriptions").select("owner_consumer_id,stripe_environment,subscription_status,trial_end,first_paid_at,last_paid_at,canceled_at,created_at").not("owner_consumer_id", "is", null).order("created_at").range(from, to)),
    allRows((from, to) => client.from("billing_customers").select("owner_consumer_id,stripe_environment,stripe_customer_id").not("owner_consumer_id", "is", null).range(from, to)),
    allRows((from, to) => client.from("consumer_commercial_acceptances").select("owner_user_id,stripe_environment,accepted_at").order("accepted_at").range(from, to)),
    allRows((from, to) => client.from("consumer_checkout_acceptance_bindings").select("owner_user_id,stripe_environment,bound_at").order("bound_at").range(from, to)),
    allRows((from, to) => client.from("ads_conversion_events").select("user_id,event_name,occurred_at,stripe_environment").order("occurred_at").range(from, to)),
    allRows((from, to) => client.from("consumer_refund_requests").select("owner_user_id,requested_at").order("requested_at").range(from, to)),
    // Only which accounts came from an ad; the click identifiers themselves are never read here.
    allRows((from, to) => client.from("ad_click_attributions").select("user_id").range(from, to)),
    client.from("ads_conversion_settings").select("tracking_started_at").limit(1).maybeSingle(),
    reservedTestAccounts(client).catch(() => null)
  ]);
  const sameEnvironment = (row: Row) => row.stripe_environment === undefined || row.stripe_environment === null || row.stripe_environment === environment;
  const failures = [accounts, admins, subscriptions, customers, acceptances, bindings, conversions, refunds, adClicks].filter((rows) => rows === null).length + (settings.error ? 1 : 0);
  if (!accounts) return { ...unavailable, state: "unavailable" };

  const customerOwners = new Map((customers ?? []).filter(sameEnvironment).map((row) => [str(row.stripe_customer_id), str(row.owner_consumer_id)]));
  const [{ invoices, note }, stripeRefundList] = await Promise.all([stripeInvoices(customerOwners), stripeRefunds(customerOwners)]);
  const input: FunnelInput = {
    accounts: accounts.map((row) => ({ id: str(row.user_id), createdAt: str(row.created_at), emailConfirmedAt: iso(row.email_confirmed_at), trialRedeemedAt: iso(row.trial_redeemed_at) })),
    adminIds: new Set((admins ?? []).map((row) => str(row.user_id))),
    testIds,
    subscriptions: (subscriptions ?? []).filter(sameEnvironment).map((row) => ({
      ownerId: str(row.owner_consumer_id), status: str(row.subscription_status), trialEnd: iso(row.trial_end), firstPaidAt: iso(row.first_paid_at),
      lastPaidAt: iso(row.last_paid_at), canceledAt: iso(row.canceled_at), createdAt: str(row.created_at)
    })),
    acceptances: (acceptances ?? []).filter(sameEnvironment).map((row) => ({ ownerId: str(row.owner_user_id), at: str(row.accepted_at) })),
    stripePagesOpened: (bindings ?? []).filter(sameEnvironment).map((row) => ({ ownerId: str(row.owner_user_id), at: str(row.bound_at) })),
    conversions: (conversions ?? []).filter(sameEnvironment).map((row) => ({ ownerId: str(row.user_id), eventName: str(row.event_name), at: str(row.occurred_at) })),
    refundRequests: (refunds ?? []).map((row) => ({ ownerId: str(row.owner_user_id), at: str(row.requested_at) })),
    invoices,
    invoiceNote: note,
    refunds: stripeRefundList,
    conversionLogStartedAt: iso((settings.data as Row | null)?.tracking_started_at),
    webAnalytics: isWebAnalyticsEnabled() ? "enabled" : "not-enabled",
    adClickAccounts: adClicks ? new Set(adClicks.map((row) => str(row.user_id))) : null
  };
  return { ...computeSubscriberFunnel(input, period, environment, now, failures), summary: summarizeSubscriberFunnel(input, environment, now) };
}
