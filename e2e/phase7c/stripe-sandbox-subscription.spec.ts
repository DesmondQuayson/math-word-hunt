import { createHash } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import Stripe from "stripe";

const url = process.env.SUPABASE_TEST_URL ?? "";
const secretKey = process.env.SUPABASE_TEST_SECRET_KEY ?? "";
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const apiVersion = process.env.STRIPE_API_VERSION ?? "";
const run = `phase7c-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
const email = `${run}@example.test`;
const password = "SyntheticAdult42!";
let admin: SupabaseClient;
let accountUser: User;
let sessionId = "";
let trialEnd = "";

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

function signedEvent(event: Record<string, unknown>) {
  const payload = JSON.stringify(event);
  return {
    payload,
    signature: Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
      timestamp: Number(event.created)
    })
  };
}

test.beforeAll(async () => {
  expect(url).toMatch(/^http:\/\/127\.0\.0\.1:/);
  expect(webhookSecret).toMatch(/^whsec_/);
  admin = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const result = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      role: "teacher",
      school: "forged",
      progress: 100
    }
  });
  if (result.error || !result.data.user) {
    throw result.error ?? new Error("Synthetic consumer account was not created.");
  }
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
    ["billing_subscriptions", "owner_consumer_id"],
    ["teacher_profiles", "user_id"],
    ["teacher_classes", "owner_teacher_id"],
    ["teacher_activities", "owner_teacher_id"]
  ] as const) {
    expect((await admin.from(table).select(column, { count: "exact", head: true }).eq(column, accountUser.id)).count).toBe(0);
  }
});

test("Setup Checkout collects a payment method and activates one exact server-owned trial", async ({ page, request }) => {
  await signIn(page);
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { name: "$5.99 USD per month" })).toBeVisible();
  await expect(page.getByText(/first \$5\.99 charge occurs exactly 24 hours/i)).toBeVisible();
  await page.getByRole("button", { name: "Add payment method and start trial" }).click();
  await expect(page).toHaveURL(/\/checkout\/status\?session_id=cs_fixture/);
  sessionId = new URL(page.url()).searchParams.get("session_id") ?? "";
  expect(sessionId).toMatch(/^cs_fixture[A-Za-z0-9]+$/);
  await expect(page.getByText("Payment method saved", { exact: true })).toBeVisible();

  const mapping = await admin
    .from("billing_customers")
    .select("stripe_customer_id, owner_consumer_id")
    .eq("owner_consumer_id", accountUser.id)
    .single();
  if (mapping.error) throw mapping.error;
  const created = Math.floor(Date.now() / 1000);
  const signed = signedEvent({
    id: `evt_${run.replaceAll("-", "")}`,
    object: "event",
    api_version: apiVersion,
    created,
    livemode: false,
    type: "checkout.session.completed",
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        customer: mapping.data.stripe_customer_id,
        client_reference_id: accountUser.id,
        metadata: { mathnexa_account_id: accountUser.id }
      }
    }
  });
  const webhook = await request.post("/api/billing/webhook", {
    data: signed.payload,
    headers: {
      "content-type": "application/json",
      "stripe-signature": signed.signature
    }
  });
  expect(webhook.status()).toBe(200);
  expect(await webhook.json()).toMatchObject({ received: true, state: "trial-active" });

  const subscription = await admin
    .from("billing_subscriptions")
    .select("stripe_subscription_id, subscription_status, trial_end, current_period_start, current_period_end, first_paid_at")
    .eq("owner_consumer_id", accountUser.id)
    .single();
  if (subscription.error) throw subscription.error;
  expect(subscription.data.subscription_status).toBe("trialing");
  expect(subscription.data.first_paid_at).toBeNull();
  expect(Date.parse(subscription.data.trial_end) - Date.parse(subscription.data.current_period_start)).toBe(24 * 60 * 60 * 1000);
  trialEnd = subscription.data.trial_end;

  const entitlement = await admin
    .from("consumer_game_entitlements")
    .select("entitlement_state, trial_started_at, trial_ends_at")
    .eq("user_id", accountUser.id)
    .single();
  if (entitlement.error) throw entitlement.error;
  expect(entitlement.data.entitlement_state).toBe("trial-active");
  expect(Date.parse(entitlement.data.trial_ends_at) - Date.parse(entitlement.data.trial_started_at)).toBe(24 * 60 * 60 * 1000);

  await page.reload();
  await expect(page.getByText("24-hour trial active", { exact: true })).toBeVisible();
  await expect(page.locator(`time[datetime="${trialEnd}"]`)).toBeVisible();
  await page.goto("/play?access=active&trialEndsAt=2099-01-01");
  await expect(page.getByRole("heading", { name: "Game access verified" })).toBeVisible();
  const canonical = await page.request.get("/game/runtime/index.html");
  expect(canonical.status()).toBe(200);
  expect(createHash("sha256").update(await canonical.body()).digest("hex")).toBe(
    "10d0e49cd5decf316615a10f6bde37dc89796b2d8817eb1cf5d9ee25d263747e"
  );
});

test("webhook replay protection is idempotent and conflicting bodies fail closed", async ({ request }) => {
  const customer = await admin
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("owner_consumer_id", accountUser.id)
    .single();
  const created = Math.floor(Date.now() / 1000);
  const eventId = `evt_${run.replaceAll("-", "")}replay`;
  const original = signedEvent({
    id: eventId,
    object: "event",
    api_version: apiVersion,
    created,
    livemode: false,
    type: "checkout.session.completed",
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        customer: customer.data?.stripe_customer_id,
        client_reference_id: accountUser.id,
        metadata: { mathnexa_account_id: accountUser.id }
      }
    }
  });
  const first = await request.post("/api/billing/webhook", {
    data: original.payload,
    headers: { "stripe-signature": original.signature }
  });
  expect(first.status()).toBe(200);
  const duplicate = await request.post("/api/billing/webhook", {
    data: original.payload,
    headers: { "stripe-signature": original.signature }
  });
  expect(duplicate.status()).toBe(200);
  expect(await duplicate.json()).toMatchObject({ state: "processed" });

  const altered = signedEvent({
    ...JSON.parse(original.payload),
    data: { object: { id: sessionId, object: "checkout.session", tampered: true } }
  });
  const conflict = await request.post("/api/billing/webhook", {
    data: altered.payload,
    headers: { "stripe-signature": altered.signature }
  });
  expect(conflict.status()).toBe(409);
  expect(await conflict.json()).toMatchObject({ state: "manual-review" });
});

test("Customer Portal is owner-bound and returns to subscription status", async ({ page }) => {
  await signIn(page);
  await page.goto("/subscription");
  await expect(page.getByTestId("consumer-subscription-summary")).toContainText("trialing");
  await page.getByRole("button", { name: "Manage billing in Stripe" }).click();
  await expect(page).toHaveURL(/\/subscription\?billing=fixture-portal$/);
});

test("browser timestamps and storage cannot extend an expired trial", async ({ page, context }) => {
  const endedAt = new Date(Date.now() - 60_000);
  const startedAt = new Date(endedAt.getTime() - 24 * 60 * 60 * 1000);
  const expired = await admin
    .from("consumer_game_entitlements")
    .update({
      entitlement_state: "trial-expired",
      trial_started_at: startedAt.toISOString(),
      trial_ends_at: endedAt.toISOString(),
      current_period_ends_at: null,
      grace_ends_at: null
    })
    .eq("user_id", accountUser.id);
  if (expired.error) throw expired.error;

  await context.addCookies([{
    name: "game_access",
    value: "active",
    url: "http://127.0.0.1:3000"
  }]);
  await page.addInitScript(() => {
    localStorage.setItem("gameAccess", "active");
    localStorage.setItem("trialEndsAt", "2099-01-01T00:00:00.000Z");
  });
  await signIn(page);
  await page.goto("/play?access=active&trialEndsAt=2099-01-01T00:00:00.000Z");
  await expect(page.getByRole("heading", { name: "Game access required" })).toBeVisible();
  await expect(page.getByText("Trial ended", { exact: true })).toBeVisible();
  const deniedAsset = await page.request.get("/game/runtime/index.html");
  expect(deniedAsset.status()).toBe(401);
  expect(await deniedAsset.json()).toMatchObject({
    error: "game-access-denied",
    reason: "trial-ended"
  });
});

test("billing UI remains accessible and education-data routes stay unavailable", async ({ page, request }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.goto("/pricing");
  await expect(page.locator("h1")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await expect(page.getByText(/teacher pro/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /annual/i })).toHaveCount(0);
  for (const path of ["/teacher", "/student", "/classes", "/organization", "/assignments"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(404);
  }
  const oversized = await request.post("/api/billing/webhook", {
    data: "x".repeat(64 * 1024 + 1),
    headers: { "stripe-signature": "forged" }
  });
  expect(oversized.status()).toBe(413);
});
