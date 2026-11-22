import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import Stripe from "stripe";

/**
 * The subscription confirmation email can never stand between a customer and
 * what they started (2026-11-22). The local capture stub (scripts/run-phase7c-e2e.mjs)
 * answers 503 for addresses starting "email-failure-", like Resend being down:
 * the trial still activates, access opens at once, the failure is not retried,
 * and an exact webhook replay sends nothing again.
 */

const url = process.env.SUPABASE_TEST_URL ?? "";
const secretKey = process.env.SUPABASE_TEST_SECRET_KEY ?? "";
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const apiVersion = process.env.STRIPE_API_VERSION ?? "";
const run = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
const email = `email-failure-${run}@example.test`;
const password = "SyntheticAdult42!";

let admin: SupabaseClient;
let accountUser: User;
const nowSeconds = () => Math.floor(Date.now() / 1000);

type CapturedEmail = Readonly<{ idempotencyKey: string; attempts: number; failed: boolean; message: { to: string[]; subject: string } }>;
async function captured(): Promise<CapturedEmail[]> {
  const response = await fetch(process.env.EMAIL_CAPTURE_URL ?? "");
  return ((await response.json()) as CapturedEmail[]).filter((entry) => entry.message.to?.includes(email));
}

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.locator("input[name=\"password\"]").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/(account)?$/);
}

function signed(payload: string) {
  return Stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret, timestamp: nowSeconds() });
}
async function post(request: APIRequestContext, payload: string) {
  const response = await request.post("/api/billing/webhook", { data: payload, headers: { "content-type": "application/json", "stripe-signature": signed(payload) } });
  return { status: response.status(), body: await response.json() as { received: boolean; state: string } };
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  expect(url).toMatch(/^http:\/\/127\.0\.0\.1:/);
  expect(process.env.EMAIL_CAPTURE_URL ?? "").toMatch(/^http:\/\/127\.0\.0\.1:/);
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
});

test("a failed confirmation email never blocks the trial or its access, and is not repeated", async ({ page, request }) => {
  await signIn(page);
  await page.goto("/pricing");
  await expect(page.getByTestId("trial-end-estimate")).toBeVisible();
  for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
  await page.getByRole("button", { name: "Start free trial" }).click();
  await expect(page).toHaveURL(/\/checkout\/status\?session_id=cs_fixture/);
  const sessionId = new URL(page.url()).searchParams.get("session_id") ?? "";
  const mapping = await admin.from("billing_customers").select("stripe_customer_id").eq("owner_consumer_id", accountUser.id).single();
  if (mapping.error) throw mapping.error;

  const payload = JSON.stringify({
    id: `evt_emailfailure${run.replaceAll("-", "")}`, object: "event", api_version: apiVersion, created: nowSeconds(), livemode: false,
    type: "checkout.session.completed",
    data: { object: { id: sessionId, object: "checkout.session", customer: mapping.data.stripe_customer_id, client_reference_id: accountUser.id, metadata: { mathnexa_account_id: accountUser.id } } }
  });
  // The webhook answers as usual while the email provider is down.
  expect(await post(request, payload)).toMatchObject({ status: 200, body: { received: true, state: "trial-active" } });
  const entitlement = await admin.from("consumer_game_entitlements").select("entitlement_state").eq("user_id", accountUser.id).single();
  if (entitlement.error) throw entitlement.error;
  expect(entitlement.data.entitlement_state).toBe("trial-active");
  expect((await page.request.get("/game/runtime/index.html")).status()).toBe(200);

  // One attempt, refused by the "provider", not retried.
  await expect.poll(async () => (await captured()).length, { timeout: 15_000 }).toBe(1);
  expect((await captured())[0]).toMatchObject({ failed: true, attempts: 1, message: { subject: "Your MathNexa free trial has started" } });

  // An exact replay of the same Stripe event changes nothing and sends nothing.
  const replay = await post(request, payload);
  expect(replay.status).toBe(200);
  await page.waitForTimeout(2_000);
  expect((await captured()).map((entry) => entry.attempts)).toEqual([1]);
  expect((await page.request.get("/game/runtime/index.html")).status()).toBe(200);
});
