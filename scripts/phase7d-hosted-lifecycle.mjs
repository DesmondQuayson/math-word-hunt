import { createHash, randomUUID } from "node:crypto";

import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

import {
  PHASE7D_FORBIDDEN_DATA_TABLES,
  PHASE7D_RENEWAL_GRACE_DAYS,
  PHASE7D_RESEND_TEST_RECIPIENT,
  PHASE7D_STAGING_ORIGIN,
  PHASE7D_STRIPE_API_VERSION,
  PHASE7D_STRIPE_PRICE_ID,
  PHASE7D_TRIAL_SECONDS
} from "./phase7d-hosted-contract.mjs";

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

async function waitFor(label, read, accept, timeout = 150_000) {
  const deadline = Date.now() + timeout;
  let latest;
  while (Date.now() < deadline) {
    latest = await read();
    if (await accept(latest)) return latest;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`${label}-timed-out`);
}

function objectId(value) {
  return typeof value === "string" ? value : value && typeof value === "object" && typeof value.id === "string" ? value.id : null;
}

function periodEnd(subscription) {
  const value = subscription.current_period_end ?? subscription.items?.data?.[0]?.current_period_end;
  assert(typeof value === "number", "subscription-period-end-missing");
  return value;
}

function htmlDecode(value) {
  return value.replaceAll("&amp;", "&").replaceAll("&#x3D;", "=").replaceAll("&quot;", '"');
}

function confirmationLink(html) {
  const links = htmlDecode(html).match(/https:\/\/[^\s"'<>]+/g) ?? [];
  const value = links.find((link) => link.includes("/auth/v1/verify"));
  assert(value, "transactional-email-link-missing");
  return value;
}

async function resendRequest(apiKey, path) {
  const response = await fetch(`https://api.resend.com${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`resend-email-api-${response.status}`);
  return response.json();
}

async function waitForEmail(apiKey, after, subjectPattern) {
  return waitFor("transactional-email", async () => {
    const response = await resendRequest(apiKey, "/emails?limit=100");
    const rows = Array.isArray(response.data) ? response.data : [];
    const match = rows.find((item) => {
      const recipients = Array.isArray(item.to) ? item.to : [item.to];
      return recipients.includes(PHASE7D_RESEND_TEST_RECIPIENT) &&
        Date.parse(item.created_at) >= after - 5_000 && subjectPattern.test(item.subject ?? "");
    });
    if (!match) return null;
    return resendRequest(apiKey, `/emails/${encodeURIComponent(match.id)}`);
  }, (value) => Boolean(value?.html) && ["sent", "delivered"].includes(value?.last_event));
}

async function signedHostedEvent(input, event) {
  const payload = JSON.stringify(event);
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: input.webhookSecret,
    timestamp: Math.floor(Date.now() / 1000)
  });
  return fetch(`${PHASE7D_STAGING_ORIGIN}/api/billing/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": signature,
      "x-vercel-protection-bypass": input.bypassSecret
    },
    body: payload
  });
}

async function querySingle(admin, table, select, column, value) {
  const result = await admin.from(table).select(select).eq(column, value).maybeSingle();
  if (result.error) throw new Error(`${table}-read-failed`);
  return result.data;
}

async function requireSuccessfulFormOutcome(form, code) {
  const outcome = form.locator('[role="status"], [role="alert"]').first();
  await outcome.waitFor({ state: "visible" });
  assert(await outcome.getAttribute("role") === "status", code);
}

async function completeStripeSetup(page) {
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 120_000 });
  const card = page.locator('input[name="number"], input[autocomplete="cc-number"]').first();
  await card.waitFor({ state: "visible", timeout: 60_000 });
  await card.fill("4242424242424242");
  await page.locator('input[name="expiry"], input[autocomplete="cc-exp"]').first().fill("1234");
  await page.locator('input[name="cvc"], input[autocomplete="cc-csc"]').first().fill("123");
  const name = page.locator('input[name="name"], input[autocomplete="cc-name"]').first();
  if (await name.count()) await name.fill("MathNexa Staging");
  const country = page.locator('select[name="billingCountry"], select[autocomplete~="country"]').first();
  if (await country.count()) await country.selectOption("US");
  const postalCode = page.locator('input[name="billingPostalCode"], input[autocomplete~="postal-code"]').first();
  if (await postalCode.count()) await postalCode.fill("42424");
  const saveWithLink = page.locator('input[name="enableStripePass"]').first();
  if (await saveWithLink.count() && await saveWithLink.isChecked()) await saveWithLink.uncheck();
  await page.locator('button[type="submit"]').last().click();
  await page.waitForURL(new RegExp(`^${PHASE7D_STAGING_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/checkout/status`), {
    timeout: 120_000
  });
}

async function verifyBrowserJourney(input, admin, stripe, evidence, resources) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const runId = randomUUID().replaceAll("-", "");
  const firstPassword = `Mx7d-Aa9!${runId.slice(0, 12)}`;
  const secondPassword = `Mx7d-Zz8!${runId.slice(12, 24)}`;
  let userId = null;
  let customerId = null;
  let subscriptionId = null;
  try {
    const bootstrap = await context.request.post(`${PHASE7D_STAGING_ORIGIN}/api/internal/staging-access/bootstrap`, {
      headers: {
        Authorization: `Bearer ${input.stagingAccessToken}`,
        "x-vercel-protection-bypass": input.bypassSecret
      }
    });
    assert(bootstrap.status() === 204, "staging-browser-bootstrap-failed");
    const stagingCookie = (await context.cookies(PHASE7D_STAGING_ORIGIN)).find((cookie) =>
      cookie.name === "__Host-mvh-staging-access"
    );
    assert(stagingCookie?.httpOnly && stagingCookie.secure && stagingCookie.sameSite === "Lax", "staging-browser-cookie-contract");
    await page.goto(`${PHASE7D_STAGING_ORIGIN}/sign-up`);
    await page.locator('input[name="email"]').fill(PHASE7D_RESEND_TEST_RECIPIENT);
    await page.locator('input[name="password"]').fill(firstPassword);
    await page.locator('input[name="passwordConfirmation"]').fill(firstPassword);
    const passwordLabels = await page.locator('input[name="password"], input[name="passwordConfirmation"]').evaluateAll((inputs) =>
      inputs.map((input) => ({ name: input.getAttribute("name"), labelled: input.labels?.length === 1 }))
    );
    assert(passwordLabels.length === 2 && passwordLabels.every((item) => item.labelled), "signup-password-label-association");
    const confirmationRequestedAt = Date.now();
    await page.getByRole("button", { name: "Create account" }).click();
    await requireSuccessfulFormOutcome(page.locator("form").first(), "signup-form-rejected");
    const confirmation = await waitForEmail(input.resendApiKey, confirmationRequestedAt, /confirm/i);
    assert(["sent", "delivered"].includes(confirmation.last_event), "confirmation-email-not-delivered");
    await page.goto(confirmationLink(confirmation.html), { waitUntil: "domcontentloaded" });
    await page.waitForURL(`${PHASE7D_STAGING_ORIGIN}/account`, { timeout: 120_000 });
    await page.getByTestId("consumer-account-summary").waitFor();
    evidence.signupConfirmation = true;
    evidence.confirmationDelivery = confirmation.last_event;

    const users = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
    if (users.error) throw new Error("hosted-auth-user-list-failed");
    const user = users.data.users.find((candidate) => candidate.email === PHASE7D_RESEND_TEST_RECIPIENT);
    assert(user?.email_confirmed_at, "confirmed-account-not-found");
    userId = user.id;
    resources.userIds.add(userId);

    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL(/\/sign-in\?signedOut=1$/);
    await page.locator('input[name="email"]').fill(PHASE7D_RESEND_TEST_RECIPIENT);
    await page.locator('input[name="password"]').fill(firstPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(`${PHASE7D_STAGING_ORIGIN}/account`);
    evidence.signInOut = true;

    await page.goto(`${PHASE7D_STAGING_ORIGIN}/forgot-password`);
    await page.locator('input[name="email"]').fill(PHASE7D_RESEND_TEST_RECIPIENT);
    const recoveryRequestedAt = Date.now();
    await page.getByRole("button", { name: "Send recovery message" }).click();
    await requireSuccessfulFormOutcome(page.locator("form").first(), "recovery-form-rejected");
    const recovery = await waitForEmail(input.resendApiKey, recoveryRequestedAt, /recover|reset/i);
    assert(["sent", "delivered"].includes(recovery.last_event), "recovery-email-not-delivered");
    await page.goto(confirmationLink(recovery.html), { waitUntil: "domcontentloaded" });
    await page.waitForURL(`${PHASE7D_STAGING_ORIGIN}/update-password`, { timeout: 120_000 });
    await page.locator('input[name="password"]').fill(secondPassword);
    await page.locator('input[name="passwordConfirmation"]').fill(secondPassword);
    await page.getByRole("button", { name: "Update password" }).click();
    await page.waitForURL(/\/account\?password=updated$/);
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.locator('input[name="email"]').fill(PHASE7D_RESEND_TEST_RECIPIENT);
    await page.locator('input[name="password"]').fill(firstPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.locator("form").first().getByRole("alert").waitFor({ state: "visible" });
    assert(!page.url().endsWith("/account"), "old-password-still-valid");
    await page.goto(`${PHASE7D_STAGING_ORIGIN}/sign-in`);
    await page.locator('input[name="email"]').fill(PHASE7D_RESEND_TEST_RECIPIENT);
    await page.locator('input[name="password"]').fill(secondPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(`${PHASE7D_STAGING_ORIGIN}/account`);
    evidence.passwordRecovery = true;
    evidence.recoveryDelivery = recovery.last_event;

    await page.goto(`${PHASE7D_STAGING_ORIGIN}/pricing`);
    await page.getByRole("heading", { name: "$5.99 USD per month" }).waitFor();
    await page.getByText(/first \$5\.99 charge occurs exactly 24 hours/i).waitFor();
    await page.getByRole("button", { name: "Add payment method and start trial" }).click();
    await completeStripeSetup(page);

    const mapping = await waitFor("billing-customer-mapping", () => querySingle(
      admin, "billing_customers", "stripe_customer_id", "owner_consumer_id", userId
    ), Boolean);
    customerId = mapping.stripe_customer_id;
    resources.customerIds.add(customerId);
    const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
    const active = subscriptions.data.filter((item) => !["canceled", "incomplete_expired"].includes(item.status));
    assert(active.length === 1, "hosted-duplicate-subscription");
    subscriptionId = active[0].id;
    resources.subscriptionIds.add(subscriptionId);

    const projected = await waitFor("trial-projection", () => querySingle(
      admin,
      "billing_subscriptions",
      "stripe_subscription_id, subscription_status, current_period_start, trial_end, current_period_end",
      "owner_consumer_id",
      userId
    ), (value) => value?.subscription_status === "trialing");
    const providerSubscription = await stripe.subscriptions.retrieve(subscriptionId);
    assert(providerSubscription.status === "trialing", "hosted-provider-trial-not-active");
    assert(providerSubscription.trial_end - providerSubscription.trial_start === PHASE7D_TRIAL_SECONDS, "hosted-provider-trial-duration");
    assert(Date.parse(projected.trial_end) - Date.parse(projected.current_period_start) === PHASE7D_TRIAL_SECONDS * 1_000, "hosted-projected-trial-duration");
    assert(providerSubscription.items.data[0]?.price.id === PHASE7D_STRIPE_PRICE_ID, "hosted-wrong-price");
    assert(providerSubscription.items.data[0]?.price.unit_amount === 599, "hosted-wrong-amount");
    evidence.trialSeconds = PHASE7D_TRIAL_SECONDS;
    evidence.monthlyAmount = 599;

    await page.reload();
    await page.getByText("24-hour trial active", { exact: true }).waitFor();
    await page.goto(`${PHASE7D_STAGING_ORIGIN}/play`);
    await page.getByRole("heading", { name: "Game access verified" }).waitFor();
    const canonical = await context.request.get(`${PHASE7D_STAGING_ORIGIN}/game/runtime/index.html`);
    assert(canonical.status() === 200, "entitled-canonical-runtime-denied");
    assert(createHash("sha256").update(await canonical.body()).digest("hex") ===
      "7f00ed6789a2faf23b90e96c3dfdee0167aced87beb08dabf10b89c3e72c9fc5", "hosted-canonical-hash-mismatch");
    evidence.trialEntitlement = true;

    await page.goto(`${PHASE7D_STAGING_ORIGIN}/subscription`);
    const portalNavigation = page.waitForURL(/billing\.stripe\.com/, { timeout: 60_000 });
    await page.getByRole("button", { name: "Manage billing in Stripe" }).click();
    await portalNavigation;
    evidence.customerPortal = true;

    const canceled = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
      proration_behavior: "none"
    });
    assert(canceled.cancel_at_period_end, "trial-cancellation-not-period-end");
    await waitFor("trial-cancellation-projection", () => querySingle(
      admin, "billing_subscriptions", "cancel_at_period_end, trial_end", "owner_consumer_id", userId
    ), (value) => value?.cancel_at_period_end === true);
    const entitlement = await querySingle(admin, "consumer_game_entitlements", "entitlement_state, trial_ends_at", "user_id", userId);
    assert(entitlement?.entitlement_state === "trial-active", "trial-cancellation-removed-access-early");
    assert(Date.parse(entitlement.trial_ends_at) === canceled.trial_end * 1_000, "trial-cancellation-end-mismatch");
    evidence.trialCancellation = true;

    const forged = await fetch(`${PHASE7D_STAGING_ORIGIN}/play?access=active&trialEndsAt=2099-01-01`, {
      headers: { "x-vercel-protection-bypass": input.bypassSecret }, redirect: "manual"
    });
    assert(forged.status === 404 && forged.headers.get("cache-control") === "no-store", "anonymous-browser-forgery-not-denied");
    evidence.browserForgeryDenied = true;
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

async function verifyHostedRenewalLifecycle(input, admin, stripe, evidence, resources) {
  const runId = randomUUID().replaceAll("-", "");
  const email = `phase7d-renewal-${runId}@example.invalid`;
  const user = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: `Mx7d-Renew9!${runId.slice(0, 16)}`
  });
  if (user.error || !user.data.user) throw new Error("renewal-user-create-failed");
  const userId = user.data.user.id;
  resources.userIds.add(userId);
  const initialTime = Math.floor(Date.now() / 1_000) - 60;
  const clock = await stripe.testHelpers.testClocks.create({
    frozen_time: initialTime,
    name: `MathNexa phase7d ${runId.slice(0, 12)}`
  });
  resources.clockIds.add(clock.id);
  const metadata = {
    application: "mathnexa",
    environment: "staging",
    phase: "7d",
    rehearsal_id: runId,
    mathnexa_account_id: userId,
    mathnexa_plan: "mathnexa-monthly"
  };
  const customer = await stripe.customers.create({ email, test_clock: clock.id, metadata });
  resources.customerIds.add(customer.id);
  const goodMethod = await stripe.paymentMethods.attach("pm_card_visa", { customer: customer.id });
  await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: goodMethod.id } });
  const mapped = await admin.from("billing_customers").insert({
    owner_consumer_id: userId,
    stripe_environment: "test",
    stripe_customer_id: customer.id
  });
  if (mapped.error) throw new Error("renewal-customer-mapping-failed");

  let subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: PHASE7D_STRIPE_PRICE_ID, quantity: 1 }],
    default_payment_method: goodMethod.id,
    collection_method: "charge_automatically",
    payment_behavior: "error_if_incomplete",
    payment_settings: { save_default_payment_method: "on_subscription" },
    metadata
  });
  resources.subscriptionIds.add(subscription.id);
  await waitFor("initial-paid-entitlement", () => querySingle(
    admin, "consumer_game_entitlements", "entitlement_state, current_period_ends_at, authoritative_version", "user_id", userId
  ), (value) => value?.entitlement_state === "subscription-active");

  const waitClock = async () => waitFor("test-clock-ready", () => stripe.testHelpers.testClocks.retrieve(clock.id), (value) => {
    if (value.status === "internal_failure") throw new Error("test-clock-internal-failure");
    return value.status === "ready";
  });
  const advance = async (target) => {
    await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: target });
    const ready = await waitClock();
    assert(ready.frozen_time === target, "test-clock-target-mismatch");
  };
  const cycleInvoice = async (minimumCreated, priorInvoiceId) => waitFor("cycle-invoice", async () => {
    const list = await stripe.invoices.list({ customer: customer.id, subscription: subscription.id, limit: 100 });
    return list.data.find((invoice) => invoice.id !== priorInvoiceId && invoice.billing_reason === "subscription_cycle" && invoice.created >= minimumCreated - 120) ?? null;
  }, Boolean);
  const finalize = async (invoice, expected) => {
    let current = await stripe.invoices.retrieve(invoice.id);
    if (current.status === "draft") {
      const currentClock = await stripe.testHelpers.testClocks.retrieve(clock.id);
      await advance(Math.max(currentClock.frozen_time + 1, current.created + HOUR + 5 * 60));
    }
    return waitFor(`invoice-${expected}`, () => stripe.invoices.retrieve(invoice.id), (value) => expected === "paid"
      ? value.status === "paid" && value.amount_remaining === 0
      : value.status === "open" && value.attempted && value.amount_remaining > 0);
  };

  const initialInvoiceId = objectId(subscription.latest_invoice);
  assert(initialInvoiceId, "renewal-initial-invoice-missing");
  const before = await querySingle(admin, "consumer_game_entitlements", "current_period_ends_at, authoritative_version", "user_id", userId);
  const firstRenewalAt = periodEnd(subscription);
  await advance(firstRenewalAt + 60);
  const renewalDraft = await cycleInvoice(firstRenewalAt, initialInvoiceId);
  const renewal = await finalize(renewalDraft, "paid");
  assert(renewal.amount_paid === 599 && renewal.currency === "usd", "renewal-amount-mismatch");
  subscription = await stripe.subscriptions.retrieve(subscription.id);
  const renewed = await waitFor("renewal-projection", () => querySingle(
    admin, "consumer_game_entitlements", "entitlement_state, current_period_ends_at, authoritative_version", "user_id", userId
  ), (value) => value?.entitlement_state === "subscription-active" &&
    Date.parse(value.current_period_ends_at) === periodEnd(subscription) * 1_000 &&
    value.authoritative_version > before.authoritative_version);
  assert(Date.parse(renewed.current_period_ends_at) > Date.parse(before.current_period_ends_at), "renewal-period-not-extended");
  evidence.successfulRenewal = true;

  const failingMethod = await stripe.paymentMethods.attach("pm_card_chargeCustomerFail", { customer: customer.id });
  await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: failingMethod.id } });
  subscription = await stripe.subscriptions.update(subscription.id, { default_payment_method: failingMethod.id, proration_behavior: "none" });
  const failedAt = periodEnd(subscription);
  await advance(failedAt + 60);
  const failedDraft = await cycleInvoice(failedAt, renewal.id);
  const failedInvoice = await finalize(failedDraft, "failed");
  const grace = await waitFor("renewal-grace", () => querySingle(
    admin, "consumer_game_entitlements", "entitlement_state, grace_ends_at", "user_id", userId
  ), (value) => value?.entitlement_state === "subscription-grace-period" && Boolean(value.grace_ends_at));
  const failureProjection = await querySingle(
    admin, "billing_subscriptions", "last_payment_failed_at, renewal_grace_ends_at", "owner_consumer_id", userId
  );
  const failureReceipt = await admin.from("billing_webhook_events")
    .select("event_created_at")
    .eq("event_type", "invoice.payment_failed")
    .eq("stripe_object_id", failedInvoice.id)
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (failureReceipt.error || !failureReceipt.data) throw new Error("failed-payment-timestamp-evidence");
  assert(failureProjection.last_payment_failed_at === failureReceipt.data.event_created_at,
    "renewal-failure-provider-timestamp");
  assert(grace.grace_ends_at === failureProjection.renewal_grace_ends_at, "renewal-grace-projection-mismatch");
  const graceSeconds = Math.floor((Date.parse(grace.grace_ends_at) -
    Date.parse(failureProjection.last_payment_failed_at)) / 1_000);
  assert(graceSeconds === PHASE7D_RENEWAL_GRACE_DAYS * DAY, "renewal-grace-duration");
  evidence.failedRenewal = true;
  evidence.graceSeconds = graceSeconds;

  const failedReceiptsBefore = await admin.from("billing_webhook_events")
    .select("id", { count: "exact", head: true }).eq("event_type", "invoice.payment_failed");
  if (failedReceiptsBefore.error) throw new Error("failed-payment-receipt-read");
  try { await stripe.invoices.pay(failedInvoice.id, { payment_method: failingMethod.id }); } catch { /* Expected test-card failure. */ }
  await waitFor("failed-payment-retry-webhook", async () => {
    const result = await admin.from("billing_webhook_events")
      .select("id", { count: "exact", head: true }).eq("event_type", "invoice.payment_failed");
    if (result.error) throw new Error("failed-payment-receipt-read");
    return result.count ?? 0;
  }, (count) => count > (failedReceiptsBefore.count ?? 0));
  const graceRetry = await querySingle(admin, "consumer_game_entitlements", "grace_ends_at", "user_id", userId);
  assert(graceRetry.grace_ends_at === grace.grace_ends_at, "renewal-grace-extended");
  evidence.graceNonExtending = true;

  await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: goodMethod.id } });
  subscription = await stripe.subscriptions.update(subscription.id, { default_payment_method: goodMethod.id, proration_behavior: "none" });
  const recoveredInvoice = await stripe.invoices.pay(failedInvoice.id, { payment_method: goodMethod.id });
  assert(recoveredInvoice.status === "paid", "payment-recovery-not-paid");
  await waitFor("payment-recovery-projection", () => querySingle(
    admin, "consumer_game_entitlements", "entitlement_state, grace_ends_at", "user_id", userId
  ), (value) => value?.entitlement_state === "subscription-active" && value.grace_ends_at === null);
  evidence.paymentRecovery = true;

  subscription = await stripe.subscriptions.update(subscription.id, { cancel_at_period_end: true, proration_behavior: "none" });
  const cancellationEnd = periodEnd(subscription);
  await waitFor("period-end-cancellation", () => querySingle(
    admin, "billing_subscriptions", "cancel_at_period_end, current_period_end", "owner_consumer_id", userId
  ), (value) => value?.cancel_at_period_end === true && Date.parse(value.current_period_end) === cancellationEnd * 1_000);
  evidence.periodEndCancellation = true;

  await advance(cancellationEnd + 60);
  subscription = await waitFor("provider-subscription-canceled", () => stripe.subscriptions.retrieve(subscription.id), (value) => value.status === "canceled");
  await waitFor("entitlement-expired", () => querySingle(
    admin, "consumer_game_entitlements", "entitlement_state, current_period_ends_at", "user_id", userId
  ), (value) => value?.entitlement_state === "subscription-expired" && Date.parse(value.current_period_ends_at) === cancellationEnd * 1_000);
  evidence.entitlementExpired = true;

  const eventBase = {
    object: "event",
    api_version: PHASE7D_STRIPE_API_VERSION,
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type: "customer.subscription.deleted",
    data: { object: subscription }
  };
  const replayEvent = {
    ...eventBase,
    id: `evt_${randomUUID().replaceAll("-", "")}`,
    created: (subscription.ended_at ?? cancellationEnd) + 60
  };
  const firstReplay = await signedHostedEvent(input, replayEvent);
  assert(firstReplay.status === 200, "hosted-replay-first-delivery");
  const duplicateReplay = await signedHostedEvent(input, replayEvent);
  assert(duplicateReplay.status === 200 && (await duplicateReplay.json()).state === "processed", "hosted-replay-not-idempotent");
  evidence.webhookReplay = true;

  const staleEvent = {
    ...eventBase,
    id: `evt_${randomUUID().replaceAll("-", "")}`,
    type: "customer.subscription.updated",
    created: initialTime
  };
  const stale = await signedHostedEvent(input, staleEvent);
  assert(stale.status === 200 && (await stale.json()).state === "stale_ignored", "hosted-stale-event-not-ignored");
  evidence.staleEvent = true;

  const invalid = await fetch(`${PHASE7D_STAGING_ORIGIN}/api/billing/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": "invalid",
      "x-vercel-protection-bypass": input.bypassSecret
    },
    body: "{}"
  });
  assert(invalid.status === 400, "hosted-invalid-webhook-signature-accepted");
  evidence.invalidSignatureDenied = true;
}

export async function runPhase7dHostedLifecycle(input) {
  const admin = createClient(input.supabaseUrl, input.supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const stripe = new Stripe(input.stripeSecretKey, { apiVersion: PHASE7D_STRIPE_API_VERSION });
  const evidence = {
    signupConfirmation: false,
    confirmationDelivery: null,
    signInOut: false,
    passwordRecovery: false,
    recoveryDelivery: null,
    trialSeconds: null,
    monthlyAmount: null,
    trialEntitlement: false,
    customerPortal: false,
    trialCancellation: false,
    browserForgeryDenied: false,
    successfulRenewal: false,
    failedRenewal: false,
    graceSeconds: null,
    graceNonExtending: false,
    paymentRecovery: false,
    periodEndCancellation: false,
    entitlementExpired: false,
    webhookReplay: false,
    staleEvent: false,
    invalidSignatureDenied: false,
    noEducationalData: false
  };
  const resources = {
    userIds: new Set(),
    customerIds: new Set(),
    subscriptionIds: new Set(),
    clockIds: new Set()
  };
  try {
    await verifyBrowserJourney(input, admin, stripe, evidence, resources);
    await verifyHostedRenewalLifecycle(input, admin, stripe, evidence, resources);
    for (const table of PHASE7D_FORBIDDEN_DATA_TABLES) {
      const result = await admin.from(table).select("*", { count: "exact", head: true });
      if (result.error || result.count !== 0) throw new Error("prohibited-education-data-created");
    }
    evidence.noEducationalData = true;
    return { evidence, resources, admin, stripe };
  } catch (error) {
    error.phase7dResources = resources;
    error.phase7dAdmin = admin;
    error.phase7dStripe = stripe;
    throw error;
  }
}
