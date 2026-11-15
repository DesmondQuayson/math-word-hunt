import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";

/**
 * Google Ads conversion measurement, end to end, against the real product and
 * the fixture billing provider:
 *
 *   ad click -> registration -> email confirmation -> trial -> first payment
 *   -> the file Google Ads imports
 *
 * What it proves: each conversion is recorded once and only when it is real
 * (never for a page load, a return-page visit, the $0 trial invoice, a failed
 * payment, a replay or a renewal); a first payment is caught when its event is
 * late, out of order, or never arrives; the file carries the click identifier
 * and no personal data; and a visitor who said no is never measured.
 * Runs in Chromium, WebKit (Safari's engine) and two phone profiles.
 */

const url = process.env.SUPABASE_TEST_URL ?? "";
const secretKey = process.env.SUPABASE_TEST_SECRET_KEY ?? "";
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const apiVersion = process.env.STRIPE_API_VERSION ?? "";
const feedPassword = process.env.MVH_ADS_FEED_PASSWORD ?? "";
const mailUrl = process.env.ADS_E2E_MAIL_URL ?? "";
const schedulerSecret = process.env.CRON_SECRET ?? "";
const password = "SyntheticAdult42!";
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const FEED = "/api/internal/ads/google-ads-conversions.csv";
const AD_CLICK_COOKIE = "mathnexa-ad-click";

type Signed = { payload: string; signature: string };
type LedgerRow = { id: string; event_name: string; occurred_at: string; value_minor_units: number | null; currency: string | null; stripe_environment: string | null };

let admin: SupabaseClient;
let run = "";
let eventCounter = 0;
const nowSeconds = () => Math.floor(Date.now() / 1000);
const clickId = (label: string) => `Cj0KCQjw-${label}_${run.replaceAll("-", "_")}`;

function signedEvent(type: string, object: Record<string, unknown>, createdSeconds: number): Signed {
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
  return { payload, signature: Stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret, timestamp: nowSeconds() }) };
}

async function send(request: APIRequestContext, signed: Signed) {
  const response = await request.post("/api/billing/webhook", {
    data: signed.payload,
    headers: { "content-type": "application/json", "stripe-signature": signed.signature }
  });
  return { status: response.status(), body: await response.json() as { received: boolean; state: string } };
}

const deliver = (request: APIRequestContext, type: string, object: Record<string, unknown>, createdSeconds: number) =>
  send(request, signedEvent(type, object, createdSeconds));

async function fixture(request: APIRequestContext, body: Record<string, unknown>) {
  const response = await request.post("/api/internal/billing/fixture", { data: body });
  expect(response.status(), JSON.stringify(body)).toBe(200);
  return response.json();
}

async function userIdFor(email: string): Promise<string> {
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) throw listed.error;
  const user = listed.data.users.find((candidate) => candidate.email === email);
  if (!user) throw new Error(`No auth user for ${email}`);
  return user.id;
}

async function ledger(userId: string): Promise<LedgerRow[]> {
  const rows = await admin.from("ads_conversion_events")
    .select("id, event_name, occurred_at, value_minor_units, currency, stripe_environment")
    .eq("user_id", userId).order("occurred_at");
  if (rows.error) throw rows.error;
  return rows.data as LedgerRow[];
}
const names = async (userId: string) => (await ledger(userId)).map((row) => row.event_name).sort();

async function attribution(userId: string) {
  const row = await admin.from("ad_click_attributions").select("gclid, gbraid, wbraid, capture_point, clicked_at").eq("user_id", userId).maybeSingle();
  if (row.error) throw row.error;
  return row.data;
}

/** The file exactly as Google Ads fetches it, parsed into objects keyed by header. */
async function feed(request: APIRequestContext, query = "") {
  const response = await request.get(`${FEED}${query}`, {
    headers: { authorization: `Basic ${Buffer.from(`mathnexa-ads-feed:${feedPassword}`).toString("base64")}` }
  });
  expect(response.status(), "feed status").toBe(200);
  const text = await response.text();
  const [header, ...lines] = text.trim().split("\r\n");
  const columns = header!.split(",");
  return { text, rows: lines.filter(Boolean).map((line) => Object.fromEntries(line.split(",").map((value, index) => [columns[index]!, value]))) };
}
const feedFor = async (request: APIRequestContext, gclid: string) =>
  (await feed(request)).rows.filter((row) => row["Google Click ID"] === gclid);

async function adClickCookie(context: BrowserContext) {
  return (await context.cookies()).find((cookie) => cookie.name === AD_CLICK_COOKIE);
}

/** Lands on a URL carrying a click identifier and waits for the page to hand it to the server. */
async function landFromAd(page: Page, path: string) {
  const handed = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/ad-click" && response.request().method() === "POST");
  await page.goto(path);
  const response = await handed;
  expect(response.status()).toBe(204);
  return { request: response.request(), setCookie: (await response.headerValue("set-cookie")) ?? "" };
}

/**
 * Goes to a page that may still be finishing a navigation of its own: the
 * Checkout return page redirects by itself once the trial is active, and a
 * navigation started at that moment is reported as interrupted.
 */
async function visit(page: Page, path: string) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await page.goto(path);
      return;
    } catch (error) {
      if (attempt >= 2 || !/interrupted by another navigation/.test(String(error))) throw error;
      await page.waitForLoadState("load").catch(() => undefined);
    }
  }
}

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.locator("input[name=\"password\"]").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/(account)?$/);
}

async function confirmationLink(email: string, page: Page): Promise<string> {
  let link: string | null = null;
  for (let attempt = 0; attempt < 40 && !link; attempt += 1) {
    const list = await fetch(`${mailUrl}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`).then((response) => response.ok ? response.json() : null).catch(() => null);
    const id = list?.messages?.[0]?.ID;
    if (id) {
      const message = await fetch(`${mailUrl}/api/v1/message/${id}`).then((response) => response.json());
      link = (String(message.Text ?? message.HTML ?? "").match(/https?:\/\/[^\s"'<>]+verify[^\s"'<>]+/) ?? [null])[0];
    }
    if (!link) await page.waitForTimeout(500);
  }
  expect(link, "confirmation email with a verification link").toBeTruthy();
  return link!.replace(/&amp;/g, "&");
}

/** Starts the trial through the product and returns the provider references. */
async function startTrial(page: Page, userId: string) {
  await page.goto("/pricing");
  for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
  await page.getByRole("button", { name: "Start free trial" }).click();
  await expect(page).toHaveURL(/\/checkout\/status\?session_id=cs_fixture/);
  const sessionId = new URL(page.url()).searchParams.get("session_id") ?? "";
  const mapping = await admin.from("billing_customers").select("stripe_customer_id").eq("owner_consumer_id", userId).single();
  if (mapping.error) throw mapping.error;
  return { sessionId, customerId: mapping.data.stripe_customer_id as string };
}

const sessionObject = (sessionId: string, customerId: string, userId: string) => ({
  id: sessionId, object: "checkout.session", customer: customerId, client_reference_id: userId, metadata: { mathnexa_account_id: userId }
});
const subscriptionObject = (subscriptionId: string, customerId: string, userId: string) => ({
  id: subscriptionId, object: "subscription", customer: customerId, metadata: { mathnexa_account_id: userId }
});
const invoiceObject = (invoiceId: string, customerId: string, subscriptionId: string) => ({
  id: invoiceId, object: "invoice", customer: customerId, parent: { subscription_details: { subscription: subscriptionId } }
});

async function subscriptionIdFor(userId: string): Promise<string> {
  const row = await admin.from("billing_subscriptions").select("stripe_subscription_id").eq("owner_consumer_id", userId).single();
  if (row.error) throw row.error;
  return row.data.stripe_subscription_id as string;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }, testInfo) => {
  void browser;
  expect(url).toMatch(/^http:\/\/127\.0\.0\.1:/);
  expect(webhookSecret).toMatch(/^whsec_/);
  expect(feedPassword.length).toBeGreaterThanOrEqual(24);
  expect(mailUrl).toMatch(/^http:\/\/127\.0\.0\.1:/);
  admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  run = `ads-${testInfo.project.name.replace(/[^a-z0-9]/gi, "").toLowerCase()}-${Date.now().toString(36)}`;
});

test.afterAll(async () => {
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const user of listed.data?.users ?? []) {
    if (!user.email?.startsWith(run)) continue;
    const deleted = await admin.auth.admin.deleteUser(user.id);
    if (deleted.error) throw deleted.error;
    for (const [table, column] of [["ad_click_attributions", "user_id"], ["ads_conversion_events", "user_id"], ["billing_subscriptions", "owner_consumer_id"]] as const) {
      expect((await admin.from(table).select(column, { count: "exact", head: true }).eq(column, user.id)).count, `${table} after deletion`).toBe(0);
    }
  }
});

test.describe("an ad click becomes a registered, trialing, paying account", () => {
  let context: BrowserContext;
  let page: Page;
  let email = "";
  let gclid = "";
  let userId = "";
  let customerId = "";
  let subscriptionId = "";
  let sessionId = "";
  let firstPaidAt = "";
  let firstPayment: Signed;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    email = `${run}-a@example.test`;
    gclid = clickId("A");
  });
  test.afterAll(async () => { await context.close(); });

  test("landing from an ad keeps only the click identifier, in a cookie scripts cannot read", async () => {
    const { request: handed, setCookie } = await landFromAd(page, `/?gclid=${gclid}&utm_source=google&utm_medium=cpc`);
    expect(Object.keys(handed.postDataJSON()).sort()).toEqual(["gbraid", "gclid", "wbraid"]);
    expect(handed.postDataJSON()).toEqual({ gclid, gbraid: null, wbraid: null });
    // The attributes as the server sent them (Playwright's WebKit build on
    // Windows does not report SameSite back from its cookie store).
    expect(setCookie).toMatch(/^mathnexa-ad-click=[A-Za-z0-9_-]+; Path=\/; Expires=[^;]+; Max-Age=7776000; HttpOnly; SameSite=lax$/i);
    const cookie = await adClickCookie(context);
    expect(cookie).toMatchObject({ httpOnly: true, path: "/" });
    expect(cookie!.expires - Date.now() / 1000).toBeGreaterThan(89 * 24 * 60 * 60);
    expect(await page.evaluate(() => document.cookie)).not.toContain(AD_CLICK_COOKIE);
    expect(Buffer.from(cookie!.value, "base64url").toString("utf8")).toContain(gclid);
    // A visit without a click identifier sends nothing.
    let asked = false;
    page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/ad-click") asked = true; });
    await page.goto("/about");
    await page.waitForLoadState("networkidle").catch(() => undefined);
    expect(asked).toBe(false);
  });

  test("registration keeps the click with the account; an unconfirmed account is not a conversion", async ({ request }) => {
    await page.goto("/sign-up");
    await page.getByLabel("Email address").fill(email);
    await page.locator("input[name=\"password\"]").fill(password);
    await page.locator("input[name=\"passwordConfirmation\"]").fill(password);
    await page.getByRole("button", { name: /^(Create account|Start free trial)$/ }).click();
    await expect.poll(() => userIdFor(email).catch(() => null)).not.toBeNull();
    userId = await userIdFor(email);
    await expect.poll(() => attribution(userId)).toMatchObject({ gclid, gbraid: null, wbraid: null, capture_point: "sign-up" });
    await expect.poll(() => adClickCookie(context)).toBeUndefined();
    expect(await names(userId)).toEqual([]);
    expect(await feedFor(request, gclid)).toEqual([]);
    // Reloading the form page or submitting nothing new changes nothing.
    await page.reload();
    expect(await names(userId)).toEqual([]);
  });

  test("confirming the address, even in another browser, records account_created exactly once", async ({ browser, request }) => {
    const link = await confirmationLink(email, page);
    const elsewhere = await browser.newContext();
    const other = await elsewhere.newPage();
    await other.goto(link).catch(() => undefined);
    await other.waitForLoadState("domcontentloaded").catch(() => undefined);
    await expect.poll(() => names(userId)).toEqual(["account_created"]);
    // Opening the same link again, and reloading where it landed, records nothing more.
    await other.goto(link).catch(() => undefined);
    await other.reload().catch(() => undefined);
    await elsewhere.close();
    expect(await names(userId)).toEqual(["account_created"]);
    const rows = await feedFor(request, gclid);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ "Conversion Name": "account_created", "Conversion Value": "", "Conversion Currency": "", "Ad User Data": "Granted", "Ad Personalization": "Denied" });
    expect(rows[0]!["Conversion Time"]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00$/);
  });

  test("starting Checkout and visiting or reloading the return page is not a trial", async () => {
    await signIn(page, email);
    ({ sessionId, customerId } = await startTrial(page, userId));
    for (let visit = 0; visit < 3; visit += 1) {
      await page.reload();
      await page.waitForLoadState("domcontentloaded");
    }
    await page.goto(`/checkout/status?session_id=${sessionId}`);
    expect(await names(userId)).toEqual(["account_created"]);
  });

  test("the provider's own trial records trial_started once, however often it is announced", async ({ request }) => {
    const completed = signedEvent("checkout.session.completed", sessionObject(sessionId, customerId, userId), nowSeconds());
    expect(await send(request, completed)).toMatchObject({ status: 200, body: { state: "trial-active" } });
    subscriptionId = await subscriptionIdFor(userId);
    expect(await names(userId)).toEqual(["account_created", "trial_started"]);
    const trial = (await ledger(userId)).find((row) => row.event_name === "trial_started")!;
    expect(trial).toMatchObject({ value_minor_units: null, currency: null, stripe_environment: "test" });
    // The same event again, and the provider's own subscription.created.
    expect((await send(request, completed)).status).toBe(200);
    expect((await deliver(request, "customer.subscription.created", subscriptionObject(subscriptionId, customerId, userId), nowSeconds())).status).toBe(200);
    expect(await names(userId)).toEqual(["account_created", "trial_started"]);
    // Access is exactly what the trial grants, as before.
    expect((await page.request.get("/game/runtime/index.html")).status()).toBe(200);
  });

  test("the $0 trial invoice and a failed first charge are never a purchase", async ({ request }) => {
    const trialInvoice = `in_${run.replaceAll("-", "")}trial`;
    await fixture(request, { action: "record-invoice", invoice: { id: trialInvoice, customerId, subscriptionId, paid: true, paidAt: new Date().toISOString(), amountPaidMinorUnits: 0 } });
    expect((await deliver(request, "invoice.paid", invoiceObject(trialInvoice, customerId, subscriptionId), nowSeconds())).status).toBe(200);
    expect(await names(userId)).toEqual(["account_created", "trial_started"]);

    const start = new Date(Date.now() - 60_000);
    const firstInvoice = `in_${run.replaceAll("-", "")}first`;
    await fixture(request, { action: "mutate-subscription", subscriptionId, patch: { status: "past_due", trialStart: null, trialEnd: null, currentPeriodStart: start.toISOString(), currentPeriodEnd: new Date(start.getTime() + MONTH_MS).toISOString(), latestInvoiceId: firstInvoice } });
    await fixture(request, { action: "record-invoice", invoice: { id: firstInvoice, customerId, subscriptionId, paid: false, status: "open" } });
    expect((await deliver(request, "invoice.payment_failed", invoiceObject(firstInvoice, customerId, subscriptionId), nowSeconds())).status).toBe(200);
    expect(await names(userId)).toEqual(["account_created", "trial_started"]);
    expect((await feedFor(request, gclid)).map((row) => row["Conversion Name"]).sort()).toEqual(["account_created", "trial_started"]);
  });

  test("the first payment is recorded with what was paid, even when its event arrives late and out of order", async ({ request }) => {
    const firstInvoice = `in_${run.replaceAll("-", "")}first`;
    firstPaidAt = new Date(Date.now() - 5_000).toISOString();
    await fixture(request, { action: "mutate-subscription", subscriptionId, patch: { status: "active" } });
    await fixture(request, { action: "record-invoice", invoice: { id: firstInvoice, customerId, subscriptionId, paid: true, paidAt: firstPaidAt, amountPaidMinorUnits: 599 } });
    const later = nowSeconds() + 5;
    // The newer subscription update is processed first...
    expect(await deliver(request, "customer.subscription.updated", subscriptionObject(subscriptionId, customerId, userId), later))
      .toMatchObject({ status: 200, body: { state: "subscription-active" } });
    expect(await names(userId)).toEqual(["account_created", "trial_started"]);
    // ...and the payment event, created earlier, arrives after it.
    firstPayment = signedEvent("invoice.paid", invoiceObject(firstInvoice, customerId, subscriptionId), later - 120);
    expect(await send(request, firstPayment)).toMatchObject({ status: 200, body: { state: "stale_ignored" } });
    expect(await names(userId)).toEqual(["account_created", "subscription_started", "trial_started"]);
    const paid = (await ledger(userId)).find((row) => row.event_name === "subscription_started")!;
    expect(paid).toMatchObject({ value_minor_units: 599, currency: "usd", stripe_environment: "test" });
    expect(Date.parse(paid.occurred_at)).toBe(Date.parse(firstPaidAt));
  });

  test("a replayed payment event and later renewals never count again", async ({ request }) => {
    expect((await send(request, firstPayment)).status).toBe(200);
    for (const month of [1, 2]) {
      const renewal = `in_${run.replaceAll("-", "")}renew${month}`;
      const start = new Date();
      await fixture(request, { action: "mutate-subscription", subscriptionId, patch: { currentPeriodStart: start.toISOString(), currentPeriodEnd: new Date(start.getTime() + MONTH_MS).toISOString(), latestInvoiceId: renewal } });
      await fixture(request, { action: "record-invoice", invoice: { id: renewal, customerId, subscriptionId, paid: true, paidAt: start.toISOString(), amountPaidMinorUnits: 599 } });
      expect(await deliver(request, "invoice.paid", invoiceObject(renewal, customerId, subscriptionId), nowSeconds() + 10 + month))
        .toMatchObject({ status: 200, body: { state: "subscription-active" } });
    }
    const rows = await ledger(userId);
    expect(rows.map((row) => row.event_name).sort()).toEqual(["account_created", "subscription_started", "trial_started"]);
    expect(Date.parse(rows.find((row) => row.event_name === "subscription_started")!.occurred_at)).toBe(Date.parse(firstPaidAt));
    // The subscriber's access is what billing says it is.
    expect((await page.request.get("/game/runtime/index.html")).status()).toBe(200);
  });

  test("Google Ads receives the three conversions for this click, once each, with no personal data", async ({ request }) => {
    const { text } = await feed(request);
    const rows = await feedFor(request, gclid);
    // (Rows are in time order; this rehearsal compresses a day into seconds, so look each up by name.)
    expect(rows.map((row) => row["Conversion Name"]).sort()).toEqual(["account_created", "subscription_started", "trial_started"]);
    const paid = rows.find((row) => row["Conversion Name"] === "subscription_started")!;
    expect(paid).toMatchObject({ "Conversion Value": "5.99", "Conversion Currency": "USD", GBRAID: "", WBRAID: "" });
    expect(paid["Conversion Time"]).toBe(`${firstPaidAt.slice(0, 19)}+00:00`);
    expect(rows.find((row) => row["Conversion Name"] === "trial_started")).toMatchObject({ "Conversion Value": "", "Conversion Currency": "" });
    const orderIds = rows.map((row) => row["Order ID"]);
    expect(new Set(orderIds).size).toBe(3);
    for (const orderId of orderIds) expect(orderId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    for (const secret of [email, email.split("@")[0]!, userId, customerId, subscriptionId, sessionId, "@"]) {
      expect(text, `feed must not contain ${secret}`).not.toContain(secret);
    }
    // The same file again is the same rows: Google Ads counts a click, name and time once.
    expect(await feedFor(request, gclid)).toEqual(rows);
    // The legacy template carries the same conversions.
    const legacy = (await feed(request, "?layout=legacy")).text.split("\r\n");
    expect(legacy[0]).toBe("Parameters:TimeZone=+0000");
    expect(legacy.filter((line) => line.startsWith(gclid))).toHaveLength(3);
  });

  test("the file is closed to anyone without the credential", async ({ request }) => {
    for (const authorization of [undefined, "Basic bWF0aG5leGEtYWRzLWZlZWQ6d3Jvbmc=", `Bearer ${feedPassword}x`]) {
      const response = await request.get(FEED, { headers: authorization ? { authorization } : {} });
      expect(response.status()).toBe(401);
      expect(await response.text()).not.toContain(gclid);
    }
  });
});

test.describe("an existing account that clicks an ad later, and a payment no webhook ever announced", () => {
  let context: BrowserContext;
  let page: Page;
  let email = "";
  let gclid = "";
  let userId = "";

  test.beforeAll(async ({ browser }) => {
    email = `${run}-b@example.test`;
    gclid = clickId("B");
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw created.error ?? new Error("Synthetic account was not created.");
    userId = created.data.user.id;
    context = await browser.newContext();
    page = await context.newPage();
  });
  test.afterAll(async () => { await context.close(); });

  test("an account with no ad click is recorded but never reported", async ({ request }) => {
    expect(await names(userId)).toEqual(["account_created"]);
    expect(await attribution(userId)).toBeNull();
    const reported = (await feed(request)).rows.map((row) => row["Order ID"]);
    expect(reported).not.toContain((await ledger(userId))[0]!.id);
  });

  test("the click is kept at Checkout, and only what follows it is reported", async ({ request }) => {
    await signIn(page, email);
    await landFromAd(page, `/online-math-prep?gclid=${gclid}`);
    const { sessionId, customerId } = await startTrial(page, userId);
    expect(await attribution(userId)).toMatchObject({ gclid, capture_point: "checkout" });
    expect(await adClickCookie(context)).toBeUndefined();
    expect(await deliver(request, "checkout.session.completed", sessionObject(sessionId, customerId, userId), nowSeconds()))
      .toMatchObject({ status: 200, body: { state: "trial-active" } });
    expect((await feedFor(request, gclid)).map((row) => row["Conversion Name"])).toEqual(["trial_started"]);
  });

  test("a first payment whose webhook never arrives is still recorded when the account is next reconciled", async ({ request }) => {
    const subscriptionId = await subscriptionIdFor(userId);
    const customer = await admin.from("billing_customers").select("stripe_customer_id").eq("owner_consumer_id", userId).single();
    if (customer.error) throw customer.error;
    const customerId = customer.data.stripe_customer_id as string;
    // The provider ended the trial and charged the card; nothing reached the application.
    // (Paid a moment ago: a payment from before the ad click would rightly not be reported for it.)
    const start = new Date(Date.now() - 1_000);
    const invoiceId = `in_${run.replaceAll("-", "")}silent`;
    await fixture(request, { action: "mutate-subscription", subscriptionId, patch: { status: "active", trialStart: null, trialEnd: null, currentPeriodStart: start.toISOString(), currentPeriodEnd: new Date(start.getTime() + MONTH_MS).toISOString(), latestInvoiceId: invoiceId } });
    await fixture(request, { action: "record-invoice", invoice: { id: invoiceId, customerId, subscriptionId, paid: true, paidAt: start.toISOString(), amountPaidMinorUnits: 599 } });
    expect(await names(userId)).toEqual(["account_created", "trial_started"]);
    // The scheduled reconciliation re-reads the provider for subscriptions it has
    // not confirmed recently; mark this one as never confirmed so it is due now.
    const due = await admin.from("billing_subscriptions").update({ last_synchronized_at: null }).eq("stripe_subscription_id", subscriptionId);
    if (due.error) throw due.error;
    const sweep = await request.get("/api/internal/billing/reconcile", { headers: { authorization: `Bearer ${schedulerSecret}` } });
    expect(sweep.status()).toBe(200);
    expect((await sweep.json()).checked).toBeGreaterThanOrEqual(1);
    await expect.poll(() => names(userId)).toEqual(["account_created", "subscription_started", "trial_started"]);
    const paid = (await ledger(userId)).find((row) => row.event_name === "subscription_started")!;
    expect(paid.value_minor_units).toBe(599);
    expect(Date.parse(paid.occurred_at)).toBe(start.getTime());
    // Billing itself reached the same answer the provider holds.
    await visit(page, "/game-access");
    await expect(page.getByText("Subscription active", { exact: true })).toBeVisible();
    const rows = await feedFor(request, gclid);
    expect(rows.map((row) => row["Conversion Name"]).sort()).toEqual(["subscription_started", "trial_started"]);
    expect(rows.find((row) => row["Conversion Name"] === "subscription_started")).toMatchObject({ "Conversion Value": "5.99", "Conversion Currency": "USD" });
  });
});

test.describe("a visitor who says no is never measured", () => {
  test("Global Privacy Control: the page does not ask, and the server would refuse", async ({ browser }) => {
    const context = await browser.newContext({ extraHTTPHeaders: { "Sec-GPC": "1" } });
    await context.addInitScript(() => Object.defineProperty(navigator, "globalPrivacyControl", { value: true, configurable: true }));
    const page = await context.newPage();
    let asked = false;
    page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/ad-click") asked = true; });
    await page.goto(`/?gclid=${clickId("GPC")}`);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    expect(asked).toBe(false);
    const forced = await page.request.post("/api/ad-click", { data: { gclid: clickId("GPC") }, headers: { "sec-fetch-site": "same-origin" } });
    expect(forced.status()).toBe(204);
    expect(await adClickCookie(context)).toBeUndefined();
    await page.goto("/privacy");
    await expect(page.getByText("Your browser sends a Global Privacy Control signal", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: /ad measurement/i })).toHaveCount(0);
    await context.close();
  });

  test("outside the United States, and for a cross-site caller, nothing is kept", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/about");
    for (const country of ["GB", "DE", "FR", "CA"]) {
      const response = await page.request.post("/api/ad-click", { data: { gclid: clickId("GEO") }, headers: { "sec-fetch-site": "same-origin", "x-vercel-ip-country": country } });
      expect(response.status()).toBe(204);
    }
    expect((await page.request.post("/api/ad-click", { data: { gclid: clickId("XS") }, headers: { "sec-fetch-site": "cross-site" } })).status()).toBe(403);
    expect(await adClickCookie(context)).toBeUndefined();
    await context.close();
  });

  test("turning ad measurement off on the Privacy page forgets the click and stops keeping new ones", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await landFromAd(page, `/?gclid=${clickId("OPT")}`);
    expect(await adClickCookie(context)).toBeDefined();
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: "Advertising measurement" })).toBeVisible();
    const forgotten = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/ad-click" && response.request().method() === "DELETE");
    await page.getByRole("button", { name: "Turn off ad measurement" }).click();
    expect((await forgotten).status()).toBe(204);
    await expect(page.getByText("Ad measurement is off in this browser.", { exact: false })).toBeVisible();
    expect(await adClickCookie(context)).toBeUndefined();
    expect((await context.cookies()).find((cookie) => cookie.name === "mathnexa-ad-choice")?.value).toBe("opt-out");
    // A later ad click is not kept, and the choice survives a reload.
    await page.goto(`/?gclid=${clickId("OPT2")}`);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    expect(await adClickCookie(context)).toBeUndefined();
    await page.goto("/privacy");
    await expect(page.getByRole("button", { name: "Turn ad measurement back on" })).toBeVisible();
    // Turning it back on restores the default.
    await page.getByRole("button", { name: "Turn ad measurement back on" }).click();
    await expect(page.getByRole("button", { name: "Turn off ad measurement" })).toBeVisible();
    await landFromAd(page, `/?gclid=${clickId("OPT3")}`);
    expect(await adClickCookie(context)).toBeDefined();
    await context.close();
  });
});
