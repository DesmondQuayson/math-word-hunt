import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import Stripe from "stripe";

/**
 * Standing regression suite for the commercial invariant behind the owner's
 * report: a successful recurring renewal must never be followed by "Subscription
 * ended". It drives the real product (sign in, checkout, product launch) against
 * the fixture billing provider and exercises trial -> payment 1 -> payment 2 ->
 * payment 3 (out of order) -> a renewal whose webhook never arrives -> cancel at
 * period end -> genuine expiration -> failed renewal -> recovery.
 */

const url = process.env.SUPABASE_TEST_URL ?? "";
const secretKey = process.env.SUPABASE_TEST_SECRET_KEY ?? "";
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const apiVersion = process.env.STRIPE_API_VERSION ?? "";
const run = `renewal-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
const email = `${run}@example.test`;
const password = "SyntheticAdult42!";
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

let admin: SupabaseClient;
let accountUser: User;
let customerId = "";
let subscriptionId = "";
let eventCounter = 0;
const nowSeconds = () => Math.floor(Date.now() / 1000);
const instant = (value: unknown) => typeof value === "string" ? Date.parse(value) : Number.NaN;

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Sign-in lands on Home since v1.2.2; the Account page is one click away.
  await expect(page).toHaveURL(/\/(account)?$/);
}

function signedEvent(type: string, object: Record<string, unknown>, createdSeconds: number) {
  eventCounter += 1;
  const payload = JSON.stringify({
    id: `evt_${run.replaceAll("-", "")}n${eventCounter}`,
    object: "event",
    api_version: apiVersion,
    created: createdSeconds,
    livemode: false,
    type,
    data: { object }
  });
  return {
    payload,
    signature: Stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret, timestamp: Math.floor(Date.now() / 1000) })
  };
}

async function deliver(request: APIRequestContext, type: string, object: Record<string, unknown>, createdSeconds: number) {
  const signed = signedEvent(type, object, createdSeconds);
  const response = await request.post("/api/billing/webhook", {
    data: signed.payload,
    headers: { "content-type": "application/json", "stripe-signature": signed.signature }
  });
  return { status: response.status(), body: await response.json() as { received: boolean; state: string } };
}

async function fixture(request: APIRequestContext, body: Record<string, unknown>) {
  const response = await request.post("/api/internal/billing/fixture", { data: body });
  expect(response.status(), JSON.stringify(body)).toBe(200);
  return response.json();
}

async function localSubscription() {
  const row = await admin.from("billing_subscriptions")
    .select("subscription_status, current_period_end, cancel_at_period_end, last_synchronization_source, last_synchronized_at, first_paid_at, last_paid_at, renewal_grace_ends_at")
    .eq("owner_consumer_id", accountUser.id).eq("stripe_subscription_id", subscriptionId).single();
  if (row.error) throw row.error;
  return row.data;
}

async function localEntitlement() {
  const row = await admin.from("consumer_game_entitlements")
    .select("entitlement_state, current_period_ends_at, grace_ends_at, trial_ends_at")
    .eq("user_id", accountUser.id).single();
  if (row.error) throw row.error;
  return row.data;
}

/** Real product access: the game runtime document and the MAP Prep launch. */
async function expectProductAccess(page: Page, allowed: boolean) {
  const runtime = await page.request.get("/game/runtime/index.html");
  expect(runtime.status(), "game runtime").toBe(allowed ? 200 : 401);
  const mapPrep = await page.request.get("/map-prep/launch", { maxRedirects: 0 });
  const location = mapPrep.headers().location ?? "";
  if (allowed) expect(location, "MAP Prep launch").not.toMatch(/\/subscription/);
  else expect(location, "MAP Prep launch").toMatch(/\/subscription\?next=%2Fmap-prep|\/subscription\?next=\/map-prep/);
  const play = await page.request.get("/play", { maxRedirects: 0 });
  const playLocation = play.headers().location ?? "";
  if (allowed) expect(playLocation, "play").toMatch(/\/game\/runtime\/index\.html/);
  else expect(playLocation, "play").toMatch(/\/subscription/);
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

test("trial grants real product access", async ({ page, request }) => {
  await signIn(page);
  await page.goto("/pricing");
  for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
  await page.getByRole("button", { name: "Accept terms and continue to Stripe" }).click();
  await expect(page).toHaveURL(/\/checkout\/status\?session_id=cs_fixture/);
  const sessionId = new URL(page.url()).searchParams.get("session_id") ?? "";
  const mapping = await admin.from("billing_customers").select("stripe_customer_id").eq("owner_consumer_id", accountUser.id).single();
  if (mapping.error) throw mapping.error;
  customerId = mapping.data.stripe_customer_id;

  const activation = await deliver(request, "checkout.session.completed", {
    id: sessionId, object: "checkout.session", customer: customerId,
    client_reference_id: accountUser.id, metadata: { mathnexa_account_id: accountUser.id }
  }, nowSeconds());
  expect(activation).toMatchObject({ status: 200, body: { state: "trial-active" } });
  const row = await admin.from("billing_subscriptions").select("stripe_subscription_id").eq("owner_consumer_id", accountUser.id).single();
  if (row.error) throw row.error;
  subscriptionId = row.data.stripe_subscription_id;
  expect(subscriptionId).toMatch(/^sub_fixture/);
  await expectProductAccess(page, true);
});

test("trial converts to the first paid period with no access gap", async ({ page, request }) => {
  await signIn(page);
  const start = new Date(Date.now() - 60 * 60 * 1000);
  const end = new Date(start.getTime() + MONTH_MS);
  await fixture(request, { action: "mutate-subscription", subscriptionId, patch: { status: "active", currentPeriodStart: start.toISOString(), currentPeriodEnd: end.toISOString(), latestInvoiceId: "in_fixturefirst" } });
  const converted = await deliver(request, "customer.subscription.updated", { id: subscriptionId, object: "subscription", customer: customerId, metadata: { mathnexa_account_id: accountUser.id } }, nowSeconds());
  expect(converted).toMatchObject({ status: 200, body: { state: "subscription-active" } });
  await fixture(request, { action: "record-invoice", invoice: { id: "in_fixturefirst", customerId, subscriptionId, paid: true, paidAt: new Date(start.getTime() + 60_000).toISOString(), amountPaidMinorUnits: 599 } });
  const paid = await deliver(request, "invoice.paid", { id: "in_fixturefirst", object: "invoice", customer: customerId, parent: { subscription_details: { subscription: subscriptionId } } }, nowSeconds());
  expect(paid).toMatchObject({ status: 200, body: { state: "subscription-active" } });
  const converted1 = await localSubscription();
  expect(converted1.subscription_status).toBe("active");
  expect(instant(converted1.current_period_end)).toBe(end.getTime());
  await expectProductAccess(page, true);
  await page.goto("/subscription");
  await expect(page.getByTestId("consumer-subscription-label")).toHaveText("Active");
  await expect(page.getByText(/Renews:/)).toBeVisible();
});

test("second successful recurring renewal keeps subscriber access", async ({ page, request }) => {
  await signIn(page);
  const start = new Date();
  const end = new Date(start.getTime() + MONTH_MS);
  await fixture(request, { action: "mutate-subscription", subscriptionId, patch: { currentPeriodStart: start.toISOString(), currentPeriodEnd: end.toISOString(), latestInvoiceId: "in_fixturerenewal2" } });
  await fixture(request, { action: "record-invoice", invoice: { id: "in_fixturerenewal2", customerId, subscriptionId, paid: true, paidAt: start.toISOString(), amountPaidMinorUnits: 599 } });
  const renewal = await deliver(request, "invoice.paid", { id: "in_fixturerenewal2", object: "invoice", customer: customerId, parent: { subscription_details: { subscription: subscriptionId } } }, nowSeconds());
  expect(renewal).toMatchObject({ status: 200, body: { state: "subscription-active" } });
  const renewed2 = await localSubscription();
  expect(renewed2.subscription_status).toBe("active");
  expect(instant(renewed2.current_period_end)).toBe(end.getTime());
  const entitled2 = await localEntitlement();
  expect(entitled2.entitlement_state).toBe("subscription-active");
  expect(instant(entitled2.current_period_ends_at)).toBe(end.getTime());
  await expectProductAccess(page, true);
  await page.goto("/game-access");
  await expect(page.getByText("Subscription active", { exact: true })).toBeVisible();
  await expect(page.getByText("Subscription ended", { exact: true })).toHaveCount(0);
});

test("third renewal converges when events arrive out of order and duplicated", async ({ page, request }) => {
  await signIn(page);
  const start = new Date();
  const end = new Date(start.getTime() + MONTH_MS);
  await fixture(request, { action: "mutate-subscription", subscriptionId, patch: { currentPeriodStart: start.toISOString(), currentPeriodEnd: end.toISOString(), latestInvoiceId: "in_fixturerenewal3" } });
  await fixture(request, { action: "record-invoice", invoice: { id: "in_fixturerenewal3", customerId, subscriptionId, paid: true, paidAt: start.toISOString(), amountPaidMinorUnits: 599 } });
  const later = nowSeconds();
  const earlier = later - 60;
  const paidFirst = await deliver(request, "invoice.paid", { id: "in_fixturerenewal3", object: "invoice", customer: customerId, parent: { subscription_details: { subscription: subscriptionId } } }, later);
  expect(paidFirst).toMatchObject({ status: 200, body: { state: "subscription-active" } });
  const lateUpdate = await deliver(request, "customer.subscription.updated", { id: subscriptionId, object: "subscription", customer: customerId, metadata: { mathnexa_account_id: accountUser.id } }, earlier);
  expect(lateUpdate).toMatchObject({ status: 200, body: { state: "stale_ignored" } });
  const duplicate = await deliver(request, "invoice.paid", { id: "in_fixturerenewal3", object: "invoice", customer: customerId, parent: { subscription_details: { subscription: subscriptionId } } }, later);
  expect(duplicate).toMatchObject({ status: 200, body: { state: "subscription-active" } });
  expect(instant((await localSubscription()).current_period_end)).toBe(end.getTime());
  expect((await admin.from("billing_subscriptions").select("id", { count: "exact", head: true }).eq("owner_consumer_id", accountUser.id)).count).toBe(1);
  await expectProductAccess(page, true);
});

test("a renewal whose webhook never arrived self-heals on the next request instead of saying Subscription ended", async ({ page, request }) => {
  // Stripe renewed; nothing reached the app. The local period is in the past.
  const start = new Date(Date.now() - 60_000);
  const end = new Date(start.getTime() + MONTH_MS);
  await fixture(request, { action: "mutate-subscription", subscriptionId, patch: { currentPeriodStart: start.toISOString(), currentPeriodEnd: end.toISOString(), latestInvoiceId: "in_fixturerenewal4" } });
  await fixture(request, { action: "record-invoice", invoice: { id: "in_fixturerenewal4", customerId, subscriptionId, paid: true, paidAt: start.toISOString(), amountPaidMinorUnits: 599 } });
  const staleEnd = new Date(Date.now() - 30_000).toISOString();
  const staleStart = new Date(Date.now() - 30_000 - MONTH_MS).toISOString();
  const staleRow = await admin.from("billing_subscriptions").update({ current_period_start: staleStart, current_period_end: staleEnd }).eq("stripe_subscription_id", subscriptionId);
  if (staleRow.error) throw staleRow.error;
  const staleEntitlement = await admin.from("consumer_game_entitlements").update({ current_period_ends_at: staleEnd }).eq("user_id", accountUser.id);
  if (staleEntitlement.error) throw staleEntitlement.error;
  const throttleReset = await admin.from("billing_customers").update({ last_reconciliation_attempt_at: null }).eq("owner_consumer_id", accountUser.id);
  if (throttleReset.error) throw throttleReset.error;

  await signIn(page);
  await page.goto("/account");
  // "Unavailable" contains "Available": assert the exact cell, not a substring.
  await expect(page.getByTestId("consumer-account-summary")).not.toContainText("Unavailable");
  await expect(page.getByTestId("consumer-account-summary")).toContainText("Available");
  await page.goto("/game-access");
  await expect(page.getByText("Subscription active", { exact: true })).toBeVisible();
  await expect(page.getByText(/couldn.t verify your subscription/i)).toHaveCount(0);
  const healed = await localSubscription();
  expect(healed).toMatchObject({ subscription_status: "active", last_synchronization_source: "reconciliation" });
  expect(instant(healed.current_period_end)).toBe(end.getTime());
  const healedEntitlement = await localEntitlement();
  expect(healedEntitlement.entitlement_state).toBe("subscription-active");
  expect(instant(healedEntitlement.current_period_ends_at)).toBe(end.getTime());
  await expectProductAccess(page, true);
  await page.goto("/subscription");
  await expect(page.getByTestId("consumer-subscription-label")).toHaveText("Active");
  await expect(page.getByText("Subscription ended", { exact: true })).toHaveCount(0);
});

test("cancel at period end keeps access until the paid boundary, then ends honestly", async ({ page, request }) => {
  await signIn(page);
  const current = await fixture(request, { action: "read-subscription", subscriptionId }) as { currentPeriodStart: string; currentPeriodEnd: string };
  await fixture(request, { action: "mutate-subscription", subscriptionId, patch: { cancelAtPeriodEnd: true, canceledAt: new Date().toISOString() } });
  const scheduled = await deliver(request, "customer.subscription.updated", { id: subscriptionId, object: "subscription", customer: customerId, metadata: { mathnexa_account_id: accountUser.id } }, nowSeconds());
  expect(scheduled).toMatchObject({ status: 200, body: { state: "subscription-canceled-through-period-end" } });
  await expectProductAccess(page, true);
  await page.goto("/subscription");
  await expect(page.getByTestId("consumer-subscription-label")).toHaveText("Active until period end");
  await expect(page.getByText(/Cancels:/)).toBeVisible();
  await page.goto("/pricing");
  await expect(page.getByRole("button", { name: "Accept terms and continue to Stripe" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Continue playing" })).toBeVisible();

  // The paid boundary passes and Stripe ends the subscription. No webhook lands;
  // the boundary passing locally triggers verification, which confirms the end.
  const endedAt = new Date(Date.now() - 10_000).toISOString();
  await fixture(request, { action: "mutate-subscription", subscriptionId, patch: { status: "canceled", endedAt, currentPeriodStart: current.currentPeriodStart, currentPeriodEnd: current.currentPeriodEnd } });
  const boundary = await admin.from("consumer_game_entitlements").update({ current_period_ends_at: endedAt }).eq("user_id", accountUser.id);
  if (boundary.error) throw boundary.error;
  const throttleReset = await admin.from("billing_customers").update({ last_reconciliation_attempt_at: null }).eq("owner_consumer_id", accountUser.id);
  if (throttleReset.error) throw throttleReset.error;
  await page.goto("/game-access");
  await expect(page.getByText("Subscription ended", { exact: true })).toBeVisible();
  expect(await localSubscription()).toMatchObject({ subscription_status: "canceled" });
  expect(await localEntitlement()).toMatchObject({ entitlement_state: "subscription-expired" });
  await expectProductAccess(page, false);
  // With no live subscription left, Pricing may offer a fresh Checkout again.
  await page.goto("/pricing");
  await expect(page.getByRole("button", { name: "Accept terms and continue to Stripe" })).toHaveCount(1);
  await page.goto("/subscription");
  await expect(page.getByTestId("consumer-subscription-label")).toHaveText("Ended");
});
