import { createHash } from "node:crypto";

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import Stripe from "stripe";

/**
 * A returning customer whose one trial is used subscribes again (2026-11-22).
 *
 * Stripe test mode showed MathNexa's old request ("default_incomplete", no
 * trial) left this first $5.99 invoice unattempted until the subscription
 * expired, so the customer saved a card and never got access. The fixed request
 * ("allow_incomplete") charges the saved card at once; the fixture provider
 * mirrors that by answering "active". This proves the product turns that
 * answer into access, a paid period and no second trial, through the real
 * Pricing page, consent step, Checkout hand-off and webhook.
 *
 * The account's trial was redeemed by an earlier checkout (a different
 * checkout hash), as it is for any real returning customer.
 */

const url = process.env.SUPABASE_TEST_URL ?? "";
const secretKey = process.env.SUPABASE_TEST_SECRET_KEY ?? "";
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const apiVersion = process.env.STRIPE_API_VERSION ?? "";
const run = `resubscribe-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
const email = `${run}@example.test`;
const password = "SyntheticAdult42!";

let admin: SupabaseClient;
let accountUser: User;
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
    id: `evt_${run.replaceAll("-", "")}n${eventCounter}`,
    object: "event",
    api_version: apiVersion,
    created: nowSeconds(),
    livemode: false,
    type,
    data: { object }
  });
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret, timestamp: nowSeconds() });
  const response = await request.post("/api/billing/webhook", { data: payload, headers: { "content-type": "application/json", "stripe-signature": signature } });
  return { status: response.status(), body: await response.json() as { received: boolean; state: string } };
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  expect(url).toMatch(/^http:\/\/127\.0\.0\.1:/);
  expect(webhookSecret).toMatch(/^whsec_/);
  admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const result = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (result.error || !result.data.user) throw result.error ?? new Error("Synthetic consumer account was not created.");
  accountUser = result.data.user;
  // The one trial was redeemed by an earlier checkout, as for any returning customer.
  const redeemed = await admin.from("consumer_accounts").update({
    trial_redeemed_at: new Date().toISOString(),
    trial_redemption_checkout_hash: createHash("sha256").update(`cs_fixture_earlier_${run}`).digest("hex")
  }).eq("user_id", accountUser.id);
  if (redeemed.error) throw redeemed.error;
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

test("a returning customer whose trial is used subscribes again and has access at once, with no second trial", async ({ page, request }) => {
  await signIn(page);
  await page.goto("/pricing");
  // Trial used: the existing Checkout without a trial, never "Start free trial".
  await expect(page.getByRole("button", { name: "Start free trial" })).toHaveCount(0);
  for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
  await page.getByRole("button", { name: "Continue to secure checkout" }).click();
  await expect(page).toHaveURL(/\/checkout\/status\?session_id=cs_fixture/);
  const sessionId = new URL(page.url()).searchParams.get("session_id") ?? "";
  const mapping = await admin.from("billing_customers").select("stripe_customer_id").eq("owner_consumer_id", accountUser.id).single();
  if (mapping.error) throw mapping.error;

  const activation = await deliver(request, "checkout.session.completed", {
    id: sessionId, object: "checkout.session", customer: mapping.data.stripe_customer_id,
    client_reference_id: accountUser.id, metadata: { mathnexa_account_id: accountUser.id }
  });
  expect(activation).toMatchObject({ status: 200, body: { state: "subscription-active" } });

  const subscription = await admin.from("billing_subscriptions").select("subscription_status, trial_end").eq("owner_consumer_id", accountUser.id).single();
  if (subscription.error) throw subscription.error;
  expect(subscription.data).toMatchObject({ subscription_status: "active", trial_end: null });
  const entitlement = await admin.from("consumer_game_entitlements").select("entitlement_state, trial_ends_at").eq("user_id", accountUser.id).single();
  if (entitlement.error) throw entitlement.error;
  expect(entitlement.data).toMatchObject({ entitlement_state: "subscription-active", trial_ends_at: null });

  // Real product access, at once.
  const runtime = await page.request.get("/game/runtime/index.html");
  expect(runtime.status()).toBe(200);
  const launch = await page.request.get("/map-prep/launch", { maxRedirects: 0 });
  expect(launch.headers().location ?? "").not.toMatch(/\/subscription/);
  // And no further Checkout is offered while the subscription is live.
  await page.goto("/pricing");
  await expect(page.getByRole("button", { name: /^(Start free trial|Continue to secure checkout)$/ })).toHaveCount(0);
});
