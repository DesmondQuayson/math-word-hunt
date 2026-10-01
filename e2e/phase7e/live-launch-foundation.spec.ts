import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import Stripe from "stripe";

const url = process.env.SUPABASE_TEST_URL ?? "";
const secretKey = process.env.SUPABASE_TEST_SECRET_KEY ?? "";
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const apiVersion = process.env.STRIPE_API_VERSION ?? "";
const run = `phase7e-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
const email = `${run}@example.test`;
const password = "SyntheticAdult42!";
let admin: SupabaseClient;
let accountUser: User;

async function signIn(page: Page, next = "/account") {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email address").fill(email);
  await page.locator("input[name=\"password\"]").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // A completed sign-in honours only the server allowlist
  // (lib/auth/safe-redirect.ts). /account is on it; /pricing is not, so that
  // sign-in falls back to Home (POST_AUTH_DESTINATION, "/" since b13ce5e,
  // v1.2.2) - never to the unlisted path and never off-site.
  const landing = next === "/account" ? "/account" : "/";
  await page.waitForURL((current) => current.origin === "http://127.0.0.1:3000" &&
    current.pathname === landing && current.search === "", { timeout: 30_000 });
  if (next !== landing) await page.goto(next);
}

function signedEvent(event: Record<string, unknown>) {
  const payload = JSON.stringify(event);
  return { payload, signature: Stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret, timestamp: Number(event.created) }) };
}

test.beforeAll(async () => {
  expect(url).toMatch(/^http:\/\/127\.0\.0\.1:/);
  admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const result = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (result.error || !result.data.user) throw result.error ?? new Error("Synthetic account unavailable");
  accountUser = result.data.user;
});

test.afterAll(async () => {
  if (accountUser) {
    let deletionError: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const deleted = await admin.auth.admin.deleteUser(accountUser.id);
      if (!deleted.error) { deletionError = null; break; }
      deletionError = deleted.error;
      const remaining = await admin.auth.admin.getUserById(accountUser.id);
      if (!remaining.data.user) { deletionError = null; break; }
    }
    if (deletionError) throw deletionError;
  }
  for (const [table, column] of [
    ["consumer_accounts", "user_id"], ["consumer_game_entitlements", "user_id"],
    ["billing_customers", "owner_consumer_id"], ["billing_subscriptions", "owner_consumer_id"],
    ["consumer_commercial_acceptances", "owner_user_id"], ["consumer_checkout_acceptance_bindings", "owner_user_id"],
    ["consumer_refund_requests", "owner_user_id"]
  ] as const) {
    expect((await admin.from(table).select(column, { count: "exact", head: true }).eq(column, accountUser.id)).count).toBe(0);
  }
});

test("requires versioned affirmative consent before exact-trial Setup Checkout", async ({ page, request }) => {
  await signIn(page, "/pricing");
  await expect(page.getByRole("heading", { name: "$5.99 USD per month" })).toBeVisible();
  await expect(page.getByText(/Trial access ends exactly 24 hours after activation/)).toBeVisible();
  await expect(page.getByText(/does not promise an exact card-charge minute/)).toBeVisible();
  // No Pro plan copy ("Pro" as a word; the footer's "Products" heading is not plan copy).
  expect(await page.getByText(/\bPro\b/).allTextContents()).toEqual([]);
  const checkboxes = page.getByRole("checkbox");
  await expect(checkboxes).toHaveCount(7);
  expect(await checkboxes.evaluateAll((inputs) => inputs.every((input) => (input as HTMLInputElement).required))).toBe(true);
  await page.getByRole("button", { name: "Start free trial" }).click();
  await expect(page).toHaveURL(/\/pricing$/);
  // Consent is enforced by the server too: with the browser's required check
  // removed, six of seven consents are refused before anything is recorded.
  await checkboxes.evaluateAll((inputs) => inputs.forEach((input) => input.removeAttribute("required")));
  for (const checkbox of (await checkboxes.all()).slice(0, 6)) await checkbox.check();
  await page.getByRole("button", { name: "Start free trial" }).click();
  await expect(page).toHaveURL(/\/subscription\?consent=required&next=(?:\/|%2F)subscription$/);
  await expect(page.getByText("Affirmative consent is required.", { exact: true })).toBeVisible();
  for (const [table, column] of [["consumer_commercial_acceptances", "owner_user_id"], ["billing_customers", "owner_consumer_id"]] as const) {
    expect((await admin.from(table).select(column, { count: "exact", head: true }).eq(column, accountUser.id)).count, table).toBe(0);
  }
  await page.goto("/pricing");
  await expect(checkboxes).toHaveCount(7);
  for (const checkbox of await checkboxes.all()) await checkbox.check();
  await page.getByRole("button", { name: "Start free trial" }).click();
  await expect(page).toHaveURL(/\/checkout\/status\?session_id=cs_fixture/);
  const sessionId = new URL(page.url()).searchParams.get("session_id") ?? "";

  const acceptance = await admin.from("consumer_commercial_acceptances")
    .select("id,stripe_environment,amount_minor_units,trial_seconds,terms_version,privacy_version")
    .eq("owner_user_id", accountUser.id).single();
  if (acceptance.error) throw acceptance.error;
  expect(acceptance.data).toMatchObject({ stripe_environment: "test", amount_minor_units: 599, trial_seconds: 86_400, terms_version: "2026-08-01", privacy_version: "2026-08-01" });
  expect((await admin.from("consumer_checkout_acceptance_bindings").select("id", { count: "exact", head: true }).eq("acceptance_id", acceptance.data.id)).count).toBe(1);

  const mapping = await admin.from("billing_customers").select("stripe_customer_id").eq("owner_consumer_id", accountUser.id).single();
  if (mapping.error) throw mapping.error;
  const created = Math.floor(Date.now() / 1000);
  const signed = signedEvent({ id: `evt_${run.replaceAll("-", "")}`, object: "event", api_version: apiVersion, created, livemode: false, type: "checkout.session.completed", data: { object: { id: sessionId, object: "checkout.session", customer: mapping.data.stripe_customer_id, client_reference_id: accountUser.id, metadata: { mathnexa_account_id: accountUser.id } } } });
  const webhook = await request.post("/api/billing/webhook", { data: signed.payload, headers: { "stripe-signature": signed.signature } });
  expect(webhook.status()).toBe(200);
  expect(await webhook.json()).toMatchObject({ state: "trial-active" });
  const entitlement = await admin.from("consumer_game_entitlements").select("trial_started_at,trial_ends_at").eq("user_id", accountUser.id).single();
  expect(Date.parse(entitlement.data?.trial_ends_at) - Date.parse(entitlement.data?.trial_started_at)).toBe(86_400_000);
});

test("keeps authenticated cancellation available after deletion request and on rollback route", async ({ page }) => {
  // Uses the trial the first test activates. After any failure Playwright
  // starts a new worker, whose beforeAll creates a new account with no
  // subscription; fail fast with that explanation instead of a 2-minute timeout.
  const current = await admin.from("billing_subscriptions").select("subscription_status").eq("owner_consumer_id", accountUser.id).maybeSingle();
  expect(current.data?.subscription_status, "the first test must activate the fixture trial for this account").toBe("trialing");
  await signIn(page);
  await page.getByRole("button", { name: "Request account deletion" }).click();
  await expect(page).toHaveURL(/\/account\?deletion=requested$/);
  await expect(page.getByText(/billing management remains available until cancellation is secured/i)).toBeVisible();
  await page.goto("/subscriber-management");
  await expect(page.getByRole("heading", { name: "Manage or cancel your subscription" })).toBeVisible();
  await expect(page.getByText(/Production platform alias even if mathnexa\.com is rolled back/i)).toBeVisible();
  await expect(page.getByText("Billing management remains available.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open Stripe billing management" }).click();
  await expect(page).toHaveURL(/\/subscriber-management\?billing=fixture-portal$/);
  // A deletion request blocks new Checkout ("Deletion requests" in Terms).
  await page.goto("/pricing");
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Start free trial|Continue to secure checkout/ })).toHaveCount(0);
});

test("rejects unsigned and mixed-mode webhooks and exposes no restricted product routes", async ({ request, page }) => {
  const unsigned = await request.post("/api/billing/webhook", { data: "{}" });
  expect(unsigned.status()).toBe(400);
  expect(await unsigned.json()).toMatchObject({ received: false, state: "invalid-signature" });
  const created = Math.floor(Date.now() / 1000);
  const forgedPayload = JSON.stringify({ id: `evt_${run.replaceAll("-", "")}forged`, object: "event", api_version: apiVersion, created, livemode: false, type: "checkout.session.completed", data: { object: { id: "cs_fixtureforged", object: "checkout.session" } } });
  // Signed with a different secret (derived at run time; no secret-shaped literal in source).
  const forged = await request.post("/api/billing/webhook", { data: forgedPayload, headers: { "stripe-signature": Stripe.webhooks.generateTestHeaderString({ payload: forgedPayload, secret: `${webhookSecret}rotated`, timestamp: created }) } });
  expect(forged.status()).toBe(400);
  expect(await forged.json()).toMatchObject({ received: false, state: "invalid-signature" });
  const live = signedEvent({ id: `evt_${run.replaceAll("-", "")}live`, object: "event", api_version: apiVersion, created, livemode: true, type: "customer.subscription.updated", data: { object: { id: "sub_livefixture", customer: "cus_livefixture" } } });
  const mixed = await request.post("/api/billing/webhook", { data: live.payload, headers: { "stripe-signature": live.signature } });
  expect(mixed.status()).toBe(400);
  expect(await mixed.json()).toMatchObject({ received: false, state: "live-event-rejected" });
  for (const path of ["/teacher", "/student", "/classes", "/organization", "/assignments", "/pilot", "/invitations"]) expect((await request.get(path)).status(), path).toBe(404);
  const terms = await page.goto("/terms");
  expect(terms?.status()).toBe(200);
  // The built-in Terms or a CMS-published version (the phase8f suite publishes one).
  await expect(page.getByRole("heading", { level: 1, name: /^MathNexa (subscription )?terms$/ })).toBeVisible();
  // /Pro/ also matched ordinary words such as the site footer's "Products" heading (48ec054,
  // 2026-08-26). A plan leak is "Pro" as a word, or an explicit Pro / Teacher Pro plan phrase in any case.
  expect(await page.getByText(/\bPro\b/).allTextContents()).toEqual([]);
  expect(await page.getByText(/teacher[\s-]+pro\b|\bpro\s+(?:plan|tier|monthly|annual|subscription|features?)\b/i).allTextContents()).toEqual([]);
  await page.goto("/privacy");
  await expect(page.getByText(/No educational or gameplay-progress profile/)).toBeVisible();
});
