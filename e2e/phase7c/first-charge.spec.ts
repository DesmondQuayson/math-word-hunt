import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import Stripe from "stripe";

/**
 * The first real charge after the 24-hour trial (owner decision 2026-11-22).
 *
 * The trial's $0 invoice is not a payment, so it must not become the
 * subscription's first payment. A declined first $5.99 charge therefore pauses
 * access at once, with no renewal grace (the trial was the free period); a
 * successful retry restores access at once. Customers who have paid keep the
 * renewal grace: renewal-lifecycle.spec.ts proves that path stays unchanged.
 * Drives the real Pricing page, consent, Checkout hand-off, webhook and the
 * local database synchronizer, with the fixture billing provider.
 */

const url = process.env.SUPABASE_TEST_URL ?? "";
const secretKey = process.env.SUPABASE_TEST_SECRET_KEY ?? "";
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const apiVersion = process.env.STRIPE_API_VERSION ?? "";
const run = `first-charge-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
const email = `${run}@example.test`;
const password = "SyntheticAdult42!";
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

let admin: SupabaseClient;
let accountUser: User;
let customerId = "";
let subscriptionId = "";
let eventCounter = 0;
const nowSeconds = () => Math.floor(Date.now() / 1000);

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.locator("input[name=\"password\"]").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/(account)?$/);
}

async function deliver(request: APIRequestContext, type: string, object: Record<string, unknown>) {
  eventCounter += 1;
  const payload = JSON.stringify({
    id: `evt_${run.replaceAll("-", "")}n${eventCounter}`, object: "event", api_version: apiVersion,
    created: nowSeconds(), livemode: false, type, data: { object }
  });
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret, timestamp: nowSeconds() });
  const response = await request.post("/api/billing/webhook", { data: payload, headers: { "content-type": "application/json", "stripe-signature": signature } });
  return { status: response.status(), body: await response.json() as { received: boolean; state: string } };
}

async function fixture(request: APIRequestContext, body: Record<string, unknown>) {
  const response = await request.post("/api/internal/billing/fixture", { data: body });
  expect(response.status(), JSON.stringify(body)).toBe(200);
}

const invoiceObject = (id: string) => ({ id, object: "invoice", customer: customerId, parent: { subscription_details: { subscription: subscriptionId } } });

type CapturedEmail = Readonly<{ idempotencyKey: string; attempts: number; message: { from: string; to: string[]; subject: string; text: string; html: string } }>;
/** Confirmation emails the local capture stub received for this run's account (scripts/run-phase7c-e2e.mjs). */
async function emailsToAccount(): Promise<CapturedEmail[]> {
  const response = await fetch(process.env.EMAIL_CAPTURE_URL ?? "");
  return ((await response.json()) as CapturedEmail[]).filter((entry) => entry.message.to?.includes(email));
}

async function localSubscription() {
  const row = await admin.from("billing_subscriptions")
    .select("subscription_status, first_paid_at, last_paid_at, last_payment_failed_at, renewal_grace_ends_at")
    .eq("owner_consumer_id", accountUser.id).eq("stripe_subscription_id", subscriptionId).single();
  if (row.error) throw row.error;
  return row.data;
}

async function localEntitlement() {
  const row = await admin.from("consumer_game_entitlements").select("entitlement_state, grace_ends_at").eq("user_id", accountUser.id).single();
  if (row.error) throw row.error;
  return row.data;
}

async function productAccess(page: Page) {
  return (await page.request.get("/game/runtime/index.html")).status() === 200;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  expect(url).toMatch(/^http:\/\/127\.0\.0\.1:/);
  expect(webhookSecret).toMatch(/^whsec_/);
  admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const result = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (result.error || !result.data.user) throw result.error ?? new Error("Synthetic consumer account was not created.");
  accountUser = result.data.user;
});

test.afterAll(async () => {
  if (accountUser) {
    const deleted = await admin.auth.admin.deleteUser(accountUser.id);
    if (deleted.error) throw deleted.error;
  }
  for (const [table, column] of [
    ["consumer_accounts", "user_id"],
    ["consumer_game_entitlements", "user_id"],
    ["billing_customers", "owner_consumer_id"],
    ["billing_subscriptions", "owner_consumer_id"]
  ] as const) {
    expect((await admin.from(table).select(column, { count: "exact", head: true }).eq(column, accountUser.id)).count).toBe(0);
  }
});

test("the trial starts as before", async ({ page, request }) => {
  await signIn(page);
  await page.goto("/pricing");
  for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
  await page.getByRole("button", { name: "Start free trial" }).click();
  await expect(page).toHaveURL(/\/checkout\/status\?session_id=cs_fixture/);
  const sessionId = new URL(page.url()).searchParams.get("session_id") ?? "";
  const mapping = await admin.from("billing_customers").select("stripe_customer_id").eq("owner_consumer_id", accountUser.id).single();
  if (mapping.error) throw mapping.error;
  customerId = mapping.data.stripe_customer_id;
  const activation = await deliver(request, "checkout.session.completed", {
    id: sessionId, object: "checkout.session", customer: customerId,
    client_reference_id: accountUser.id, metadata: { mathnexa_account_id: accountUser.id }
  });
  expect(activation).toMatchObject({ status: 200, body: { state: "trial-active" } });
  const row = await admin.from("billing_subscriptions").select("stripe_subscription_id").eq("owner_consumer_id", accountUser.id).single();
  if (row.error) throw row.error;
  subscriptionId = row.data.stripe_subscription_id;
  expect(await productAccess(page)).toBe(true);
  // The trial confirmation email (2026-11-22) goes out after the webhook has answered: one, for this subscription.
  await expect.poll(async () => (await emailsToAccount()).length, { timeout: 15_000 }).toBe(1);
  const [confirmation] = await emailsToAccount();
  expect(confirmation.idempotencyKey).toBe(`mathnexa-subscription-confirmation/${subscriptionId}`);
  expect(confirmation.message.from).toBe("MathNexa <billing@auth.mathnexa.com>");
  expect(confirmation.message.subject).toBe("Your MathNexa free trial has started");
  expect(confirmation.message.text).toMatch(/Trial ends: \w{3}, \w{3} \d{1,2}, \d{4}, \d{1,2}:\d{2} [AP]M C[SD]T/);
  expect(confirmation.message.text).toContain("When the trial ends, your card is charged $5.99 USD, then $5.99 USD every month");
  expect(confirmation.message.text).toContain("open http://127.0.0.1:3000/subscription and choose \"Manage or cancel in Stripe\"");
  expect(confirmation.message.text).not.toContain(subscriptionId);
});

test("the trial's $0 invoice is not recorded as a payment", async ({ page, request }) => {
  await signIn(page);
  const trialInvoice = `in_${run.replaceAll("-", "")}trial`;
  await fixture(request, { action: "record-invoice", invoice: { id: trialInvoice, customerId, subscriptionId, paid: true, paidAt: new Date().toISOString(), amountPaidMinorUnits: 0 } });
  expect(await deliver(request, "invoice.paid", invoiceObject(trialInvoice))).toMatchObject({ status: 200, body: { state: "trial-active" } });
  expect(await localSubscription()).toMatchObject({ subscription_status: "trialing", first_paid_at: null, last_paid_at: null });
  expect(await productAccess(page)).toBe(true);
});

test("a declined first charge pauses access at once, with no renewal grace and a clear message", async ({ page, request }) => {
  await signIn(page);
  const start = new Date(Date.now() - 60_000);
  const firstInvoice = `in_${run.replaceAll("-", "")}first`;
  await fixture(request, { action: "mutate-subscription", subscriptionId, patch: { status: "past_due", trialStart: null, trialEnd: null, currentPeriodStart: start.toISOString(), currentPeriodEnd: new Date(start.getTime() + MONTH_MS).toISOString(), latestInvoiceId: firstInvoice } });
  await fixture(request, { action: "record-invoice", invoice: { id: firstInvoice, customerId, subscriptionId, paid: false, status: "open" } });
  const failed = await deliver(request, "invoice.payment_failed", invoiceObject(firstInvoice));
  expect(failed).toMatchObject({ status: 200, body: { state: "subscription-past-due" } });
  const sub = await localSubscription();
  expect(sub).toMatchObject({ subscription_status: "past_due", first_paid_at: null, renewal_grace_ends_at: null });
  expect(sub.last_payment_failed_at).not.toBeNull();
  expect(await localEntitlement()).toMatchObject({ entitlement_state: "subscription-past-due", grace_ends_at: null });
  expect(await productAccess(page)).toBe(false);
  await page.goto("/subscription");
  // The status notice (the page also names the state elsewhere).
  await expect(page.getByText("Payment requires attention", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Your card payment didn’t go through, so access is paused. To restore it, choose “Manage or cancel in Stripe” on your Subscription page and update your card. Access returns as soon as a payment succeeds; Stripe may also retry the card on its own. You can cancel there too.")).toBeVisible();
  // The way to fix it is on the same page.
  await expect(page.getByRole("button", { name: "Manage or cancel in Stripe" })).toBeVisible();
});

test("a successful retry restores access at once and records the real first payment", async ({ page, request }) => {
  await signIn(page);
  const retryInvoice = `in_${run.replaceAll("-", "")}first`;
  const paidAt = new Date(Date.now() - 5_000).toISOString();
  await fixture(request, { action: "mutate-subscription", subscriptionId, patch: { status: "active" } });
  await fixture(request, { action: "record-invoice", invoice: { id: retryInvoice, customerId, subscriptionId, paid: true, paidAt, amountPaidMinorUnits: 599 } });
  expect(await deliver(request, "invoice.paid", invoiceObject(retryInvoice))).toMatchObject({ status: 200, body: { state: "subscription-active" } });
  const sub = await localSubscription();
  expect(sub).toMatchObject({ subscription_status: "active", renewal_grace_ends_at: null });
  expect(sub.first_paid_at).not.toBeNull();
  expect(await localEntitlement()).toMatchObject({ entitlement_state: "subscription-active" });
  expect(await productAccess(page)).toBe(true);
  // Invoices (the $0 trial invoice, the declined and the paid first charge) never send another confirmation.
  expect((await emailsToAccount()).map((entry) => [entry.message.subject, entry.attempts])).toEqual([["Your MathNexa free trial has started", 1]]);
});
