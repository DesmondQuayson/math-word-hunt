/**
 * Google Ads conversion measurement — hosted STAGING review in real browsers.
 *
 * Launched by scripts/invoke-ads-conversions-staging.ps1 -Stage review against a
 * mathnexa-platform-staging preview. It checks what only a hosted deployment
 * can show: the Google tag under Consent Mode, what the tag actually sends to
 * Google, the ad-click cookie with the platform's real geolocation, the click
 * reaching the account when Checkout starts, the Privacy page switch, and the
 * conversion file behind its credential.
 *
 * What it does NOT do: enter a card on Stripe's page. Checkout is followed only
 * as far as Stripe's hosted page loading. The provider's side of a trial and a
 * first payment is stood in for at the database boundary, through the same
 * synchronizer function billing calls; the full provider-event path is covered
 * by e2e/ads-conversions against the fixture provider.
 *
 * Synthetic accounts only (`ads-review-*@example.invalid`), deleted afterwards.
 * Prints redacted JSON evidence; secrets never reach stdout.
 */
import { createHash, randomBytes } from "node:crypto";

import { chromium, devices, webkit } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { sessionCookies } from "./polygon-showdown-staging-session.mjs";
import { createProtectionBypass } from "./vercel-protection-bypass.mjs";

const STAGING_PROJECT_REF = "gcmuhzxkwvfireyrearl";
const origin = (process.env.STAGING_ORIGIN ?? "").trim().replace(/\/$/, "");
if (!/^https:\/\/mathnexa-platform-staging-[a-z0-9]+-bright-path-ed-tech\.vercel\.app$/.test(origin)) throw new Error("STAGING_ORIGIN must be a mathnexa-platform-staging preview URL");
for (const name of Object.keys(process.env)) if (/_LIVE_|_PRODUCTION_|_READONLY_/.test(name)) throw new Error(`refusing: ${name} is present in this process`);
const secretKey = (process.env.SUPABASE_SECRET_KEY ?? "").trim();
const publishableKey = (process.env.SUPABASE_PUBLISHABLE_KEY ?? "").trim();
const bypass = (process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "").trim();
const feedPassword = (process.env.ADS_STAGING_FEED_PASSWORD ?? "").trim();
if (secretKey.length < 20 || publishableKey.length < 20 || bypass.length < 20 || feedPassword.length < 24) throw new Error("missing staging entries");
const profiles = (process.env.REVIEW_PROJECTS || "chromium,webkit,mobile-chrome,mobile-safari").split(",").map((name) => name.trim()).filter(Boolean);

const supabaseUrl = `https://${STAGING_PROJECT_REF}.supabase.co`;
const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const protection = createProtectionBypass({ origin, secret: bypass });
const run = randomBytes(4).toString("hex");
const secrets = [secretKey, publishableKey, bypass, feedPassword];
const redact = (text) => secrets.reduce((value, secret) => value.split(secret).join("[redacted]"), protection.redact(String(text)));

const PROFILES = {
  chromium: { engine: chromium, options: devices["Desktop Chrome"] },
  webkit: { engine: webkit, options: devices["Desktop Safari"] },
  "mobile-chrome": { engine: chromium, options: devices["Pixel 7"] },
  "mobile-safari": { engine: webkit, options: devices["iPhone 14"] }
};
const GOOGLE = /(^|\.)(google\.com|googletagmanager\.com|doubleclick\.net|googleadservices\.com|googlesyndication\.com|google-analytics\.com)$/;
const DENIED = { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "denied" };
const MEASURED = { ad_storage: "granted", ad_user_data: "granted", ad_personalization: "denied", analytics_storage: "granted", region: ["US"] };

const evidence = { origin, run, startedAt: new Date().toISOString(), profiles: {} };
const failures = [];
function check(profile, name, condition, detail) {
  const entry = evidence.profiles[profile] ??= { checks: {} };
  entry.checks[name] = condition ? "pass" : `FAIL${detail === undefined ? "" : `: ${redact(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)}`}`;
  if (!condition) failures.push(`${profile}: ${name}`);
}

/** A context that can reach the protected preview, recording everything it sends to Google. */
async function open(browser, options, visitor = {}) {
  const context = await browser.newContext({ ...options, ...(visitor.gpc ? { extraHTTPHeaders: { "Sec-GPC": "1" } } : {}) });
  await protection.install(context);
  if (visitor.gpc) await context.addInitScript(() => Object.defineProperty(navigator, "globalPrivacyControl", { value: true, configurable: true }));
  await context.addInitScript(() => {
    window.__cspViolations = [];
    // Vercel injects its preview toolbar (vercel.live) into preview deployments only; the policy rightly refuses it.
    document.addEventListener("securitypolicyviolation", (event) => { if (!String(event.blockedURI).startsWith("https://vercel.live")) window.__cspViolations.push(`${event.violatedDirective} ${event.blockedURI}`); });
  });
  const google = [];
  context.on("request", (request) => {
    try {
      const url = new URL(request.url());
      if (GOOGLE.test(url.hostname)) google.push({ host: url.hostname, path: url.pathname, search: url.search, body: request.postData() ?? "" });
    } catch {
      // Not a URL the page fetched.
    }
  });
  return { context, google };
}

const consentCommands = (page) => page.evaluate(() => Array.from(window.dataLayer ?? [])
  .map((entry) => Array.from(entry)).filter((entry) => entry[0] === "consent" || entry[0] === "set" || entry[0] === "js")
  .map((entry) => entry[0] === "js" ? ["js"] : entry));
const googleCookies = async (context) => (await context.cookies()).filter((cookie) => /^_gcl_|^_ga|^IDE$|^_gac_/.test(cookie.name)).map((cookie) => cookie.name).sort();
const settle = (page) => page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
const consentStates = (requests) => [...new Set(requests.map((request) => new URLSearchParams(request.search).get("gcs")).filter(Boolean))].sort();

/** Anything personal in what was sent to Google: the address, in clear or hashed, or an `em`/`ph` user-data field. */
function personalData(requests, email) {
  const normalised = email.toLowerCase();
  const digest = createHash("sha256").update(normalised).digest();
  const needles = [normalised, encodeURIComponent(normalised), normalised.split("@")[0], digest.toString("hex"), digest.toString("base64"), digest.toString("base64url")];
  const found = [];
  for (const request of requests) {
    const haystack = `${decodeURIComponent(request.search)}\n${request.search}\n${request.body}`.toLowerCase();
    for (const needle of needles) if (haystack.includes(needle.toLowerCase())) found.push(`${request.host}${request.path}: contains the address or its hash`);
    const parameters = new URLSearchParams(request.search);
    for (const key of ["em", "ph", "fn", "ln", "sa", "user_data", "uid", "user_id"]) if (parameters.has(key)) found.push(`${request.host}${request.path}: parameter ${key}`);
  }
  return [...new Set(found)];
}

async function reviewProfile(name) {
  const { engine, options } = PROFILES[name];
  const browser = await engine.launch();
  const account = { email: `ads-review-${run}-${name.replace(/[^a-z]/g, "")}@example.invalid`, password: `${randomBytes(18).toString("base64url")}Aa1!` };
  const gclid = `Cj0KCQjw-REVIEW_${run}_${name.replace(/[^a-z]/g, "")}`;
  let userId = null;
  try {
    // --- 1. Default visitor: Consent Mode before the tag, one container, no CSP violation.
    {
      const { context, google } = await open(browser, options);
      const page = await context.newPage();
      await page.goto(`${origin}/`, { waitUntil: "load" });
      await settle(page);
      const commands = await consentCommands(page);
      check(name, "consent defaults are queued before the tag starts", JSON.stringify(commands.slice(0, 4)) === JSON.stringify([["consent", "default", DENIED], ["consent", "default", MEASURED], ["set", "ads_data_redaction", true], ["js"]]), commands.slice(0, 5));
      check(name, "the container loads once", google.filter((request) => request.path === "/gtm.js").length === 1, google.filter((request) => request.path === "/gtm.js").length);
      check(name, "no CSP violation on the home page", (await page.evaluate(() => window.__cspViolations)).length === 0, await page.evaluate(() => window.__cspViolations));
      const entry = evidence.profiles[name] ??= { checks: {} };
      entry.defaultVisitor = { googleRequests: google.length, consentStates: consentStates(google), cookies: await googleCookies(context) };
      await context.close();
    }

    // --- 2. Global Privacy Control: nothing granted, no advertising cookie, the click identifier never reaches Google.
    {
      const { context, google } = await open(browser, options, { gpc: true });
      const page = await context.newPage();
      let asked = false;
      page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/ad-click") asked = true; });
      await page.goto(`${origin}/?gclid=${gclid}_gpc`, { waitUntil: "load" });
      await settle(page);
      const commands = await consentCommands(page);
      check(name, "GPC: only the denied default is set", JSON.stringify(commands.slice(0, 3)) === JSON.stringify([["consent", "default", DENIED], ["set", "ads_data_redaction", true], ["js"]]), commands.slice(0, 4));
      check(name, "GPC: no advertising cookie is written", (await googleCookies(context)).length === 0, await googleCookies(context));
      check(name, "GPC: the page does not hand the click to the server", asked === false);
      check(name, "GPC: MathNexa keeps no click cookie", !(await context.cookies()).some((cookie) => cookie.name === "mathnexa-ad-click"));
      check(name, "GPC: the click identifier is not sent to Google", !google.some((request) => `${request.search}${request.body}`.includes(`${gclid}_gpc`)), google.filter((request) => `${request.search}${request.body}`.includes(`${gclid}_gpc`)).map((request) => request.host + request.path));
      const states = consentStates(google);
      check(name, "GPC: every hit to Google says consent is denied", states.every((state) => state === "G100"), states);
      await context.close();
    }

    // --- 3. An ad click, then an account that starts Checkout from it.
    const created = await admin.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true, user_metadata: { synthetic_run_id: run, purpose: "ads-conversions-staging-review" } });
    if (created.error || !created.data.user) throw new Error("synthetic-user-failed");
    userId = created.data.user.id;
    const { context, google } = await open(browser, options);
    const page = await context.newPage();
    const handed = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/ad-click" && response.request().method() === "POST", { timeout: 30_000 });
    await page.goto(`${origin}/?gclid=${gclid}&utm_source=google&utm_medium=cpc`, { waitUntil: "load" });
    const response = await handed;
    const setCookie = (await response.headerValue("set-cookie")) ?? "";
    check(name, "the ad click is answered 204", response.status() === 204, response.status());
    check(name, "the click cookie is HttpOnly, Secure, SameSite=Lax, 90 days (the platform placed this visitor in the United States)", /^mathnexa-ad-click=[A-Za-z0-9_-]+; Path=\/; Expires=[^;]+; Max-Age=7776000; Secure; HttpOnly; SameSite=lax$/i.test(setCookie), setCookie.replace(/=[A-Za-z0-9_-]{20,}/, "=[value]"));
    check(name, "page scripts cannot read the click cookie", !(await page.evaluate(() => document.cookie)).includes("mathnexa-ad-click"));
    check(name, "only click identifiers were handed over", JSON.stringify(Object.keys(response.request().postDataJSON() ?? {}).sort()) === JSON.stringify(["gbraid", "gclid", "wbraid"]));

    // Sign in through the real form: the address is typed into the page while the tag is running.
    await page.goto(`${origin}/sign-in`, { waitUntil: "load" });
    await page.getByLabel("Email address").fill(account.email);
    await page.locator("input[name=\"password\"]").fill(account.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 45_000 }).catch(() => undefined);
    await settle(page);
    let signedIn = !new URL(page.url()).pathname.startsWith("/sign-in");
    if (!signedIn) {
      // The staging form allows a limited number of attempts; fall back to a minted session.
      const session = await sessionCookies(supabaseUrl, publishableKey, account.email, account.password);
      await context.addCookies(session.cookies.map((cookie) => ({ ...cookie, url: origin, httpOnly: false, secure: true, sameSite: "Lax" })));
      await page.goto(`${origin}/account`, { waitUntil: "load" });
      signedIn = !new URL(page.url()).pathname.startsWith("/access");
    }
    check(name, "the synthetic account is signed in", signedIn, page.url());

    await page.goto(`${origin}/pricing`, { waitUntil: "load" });
    for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
    await page.getByRole("button", { name: "Start free trial" }).click();
    await page.waitForURL((url) => url.hostname === "checkout.stripe.com" || url.searchParams.has("billing"), { timeout: 60_000 }).catch(() => undefined);
    const checkout = new URL(page.url());
    // Staging previews carry an older Stripe Sandbox key than the staging alias, so Checkout may answer
    // "unavailable" here. Either way no card is entered, and the click must already be with the account.
    const onStripe = checkout.hostname === "checkout.stripe.com" && checkout.pathname.includes("cs_test_");
    const unavailable = checkout.origin === origin && checkout.searchParams.get("billing") === "unavailable";
    (evidence.profiles[name] ??= { checks: {} }).checkout = onStripe ? "Stripe hosted Checkout opened in test mode (no card entered)" : unavailable ? "this preview answered billing unavailable (no provider session)" : `unexpected: ${checkout.hostname}${checkout.pathname}`;
    check(name, "asking for Checkout ends on Stripe's test page or an honest unavailable notice", onStripe || unavailable, `${checkout.hostname}${checkout.pathname.slice(0, 24)}${checkout.search.slice(0, 40)}`);
    const stored = await admin.from("ad_click_attributions").select("gclid, gbraid, wbraid, capture_point").eq("user_id", userId).maybeSingle();
    check(name, "asking for Checkout kept the click with the account", stored.data?.gclid === gclid && stored.data?.capture_point === "checkout", stored.data ?? stored.error?.message);
    check(name, "the browser copy is cleared once the account holds the click", !(await context.cookies(origin)).some((cookie) => cookie.name === "mathnexa-ad-click"));
    const ledgerBefore = await admin.from("ads_conversion_events").select("event_name").eq("user_id", userId);
    check(name, "opening Checkout records no trial and no purchase", JSON.stringify((ledgerBefore.data ?? []).map((row) => row.event_name)) === JSON.stringify(["account_created"]), ledgerBefore.data);

    // --- 4. Nothing personal went to Google, with the address typed and submitted on a tagged page.
    const personal = personalData(google, account.email);
    check(name, "no email address, hash of it, or user-data field was sent to Google", personal.length === 0, personal);
    const entry = evidence.profiles[name];
    entry.signedInVisitor = { googleRequests: google.length, hosts: [...new Set(google.map((request) => request.host))].sort(), consentStates: consentStates(google), nonPersonalisedAds: [...new Set(google.map((request) => new URLSearchParams(request.search).get("npa")).filter(Boolean))] };
    entry.cspViolations = await page.goto(`${origin}/account`, { waitUntil: "load" }).then(() => page.evaluate(() => window.__cspViolations)).catch(() => ["account page did not load"]);
    check(name, "no CSP violation on a signed-in page", entry.cspViolations.length === 0, entry.cspViolations);

    // --- 5. The provider's side, at the database boundary: the trial this Checkout would start.
    let customer = await admin.from("billing_customers").select("stripe_customer_id").eq("owner_consumer_id", userId).maybeSingle();
    if (!customer.data?.stripe_customer_id) {
      // No provider session was opened, so there is no mapping yet: a synthetic one stands in.
      await admin.from("billing_customers").insert({ owner_consumer_id: userId, stripe_environment: "test", stripe_customer_id: `cus_AdsReview${run}${name.replace(/[^a-z]/g, "")}` });
      customer = await admin.from("billing_customers").select("stripe_customer_id").eq("owner_consumer_id", userId).maybeSingle();
    }
    const subscriptionId = `sub_AdsReview${run}${name.replace(/[^a-z]/g, "")}`;
    if (customer.data?.stripe_customer_id) {
      const trialStart = new Date();
      const trialEnd = new Date(trialStart.getTime() + 24 * 60 * 60 * 1000);
      const projected = await admin.rpc("synchronize_consumer_billing_subscription", {
        p_source: "reconciliation", p_event_record_id: null, p_event_type: null, p_owner_user_id: userId, p_stripe_environment: "test",
        p_stripe_customer_id: customer.data.stripe_customer_id, p_stripe_subscription_id: subscriptionId, p_stripe_price_id: "price_AdsReview", p_subscription_status: "trialing",
        p_current_period_start: trialStart.toISOString(), p_current_period_end: trialEnd.toISOString(), p_cancel_at_period_end: false, p_canceled_at: null, p_ended_at: null,
        p_trial_start: trialStart.toISOString(), p_trial_end: trialEnd.toISOString(), p_latest_invoice_id: null, p_latest_invoice_paid_at: null,
        p_observed_at: new Date().toISOString(), p_grace_days: 7, p_emergency_default_deny: false
      });
      const recorded = await admin.rpc("record_consumer_subscription_conversions", {
        p_owner_user_id: userId, p_stripe_environment: "test", p_stripe_subscription_id: subscriptionId, p_subscription_status: "trialing",
        p_trial_start: trialStart.toISOString(), p_paid_at: null, p_amount_paid_minor_units: null
      });
      check(name, "a trialing snapshot records trial_started once", !projected.error && JSON.stringify(recorded.data) === JSON.stringify(["trial_started"]), projected.error?.message ?? recorded.error?.message ?? recorded.data);
    } else {
      check(name, "a billing customer exists for the synthetic account", false, customer.error?.message ?? "no mapping");
    }

    // --- 6. The file, as Google Ads fetches it from this deployment.
    const feedUrl = `${origin}/api/internal/ads/google-ads-conversions.csv`;
    const fetchFeed = (authorization) => context.request.get(feedUrl, { headers: authorization ? { authorization } : {}, maxRedirects: 0 });
    const basic = (user, password) => `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
    const refused = [];
    for (const authorization of [undefined, basic("mathnexa-ads-feed", `${feedPassword}x`), basic("someone-else", feedPassword)]) refused.push((await fetchFeed(authorization)).status());
    check(name, "the file is refused without the exact credential", refused.every((status) => status === 401), refused);
    const served = await fetchFeed(basic("mathnexa-ads-feed", feedPassword));
    const text = await served.text();
    const rows = text.trim().split("\r\n").filter((line) => line.startsWith(gclid));
    check(name, "the file is served to the credential, never cached or indexed", served.status() === 200 && served.headers()["cache-control"] === "no-store" && served.headers()["x-robots-tag"] === "noindex, nofollow" && (served.headers()["content-type"] ?? "").startsWith("text/csv"), { status: served.status(), headers: served.headers()["cache-control"] });
    check(name, "it reports the trial for this click, and not the account that predates the click", rows.length === 1 && /,,,trial_started,\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00,,,[0-9a-f-]{36},Granted,Denied$/.test(rows[0] ?? ""), rows.map((row) => row.replace(gclid, "[gclid]")));
    check(name, "the file holds no address, account id or provider id", !text.includes("@") && !text.includes(userId) && !/cus_|sub_|cs_test/.test(text));

    // --- 7. The Privacy page switch.
    await page.goto(`${origin}/privacy`, { waitUntil: "load" });
    await settle(page);
    check(name, "the Privacy Notice describes advertising measurement", await page.getByRole("heading", { name: "Advertising measurement" }).isVisible());
    const cookiesBefore = await googleCookies(context);
    const forgotten = page.waitForResponse((reply) => new URL(reply.url()).pathname === "/api/ad-click" && reply.request().method() === "DELETE", { timeout: 30_000 });
    await page.getByRole("button", { name: "Turn off ad measurement" }).click();
    check(name, "turning ad measurement off is answered 204", (await forgotten).status() === 204);
    await page.getByText("Ad measurement is off in this browser.", { exact: false }).waitFor({ timeout: 15_000 });
    const erased = await admin.from("ad_click_attributions").select("user_id", { count: "exact", head: true }).eq("user_id", userId);
    check(name, "it erases the click kept with the signed-in account", erased.count === 0, erased.count);
    check(name, "it removes the tag's advertising cookies", (await googleCookies(context)).filter((cookie) => cookie.startsWith("_gcl_")).length === 0, { before: cookiesBefore, after: await googleCookies(context) });
    const afterOptOut = await fetchFeed(basic("mathnexa-ads-feed", feedPassword)).then((reply) => reply.text());
    check(name, "nothing of that account is reported afterwards", !afterOptOut.includes(gclid));
    await page.reload({ waitUntil: "load" });
    const commands = await consentCommands(page);
    check(name, "after opting out, the tag starts with consent denied", JSON.stringify(commands.slice(0, 3)) === JSON.stringify([["consent", "default", DENIED], ["set", "ads_data_redaction", true], ["js"]]), commands.slice(0, 4));
    await context.close();
  } finally {
    if (userId) {
      await admin.from("billing_subscriptions").delete().eq("owner_consumer_id", userId);
      await admin.from("consumer_game_entitlements").delete().eq("user_id", userId);
      await admin.from("consumer_commercial_acceptances").delete().eq("owner_user_id", userId);
      await admin.from("billing_customers").delete().eq("owner_consumer_id", userId);
      const deleted = await admin.auth.admin.deleteUser(userId);
      (evidence.profiles[name] ??= { checks: {} }).cleanup = deleted.error ? `delete-user-failed: ${deleted.error.message}` : "synthetic account deleted";
      if (deleted.error) failures.push(`${name}: cleanup`);
    }
    await browser.close();
  }
}

let exitCode = 1;
try {
  const health = await fetch(`${origin}/api/health`, { headers: protection.headersFor(`${origin}/api/health`), redirect: "manual" });
  const body = await health.json().catch(() => ({}));
  evidence.health = { status: health.status, build: body.build ?? null, environment: body.environment ?? null, payments: body.payments ?? null };
  const expected = (process.env.EXPECT_COMMIT ?? "").trim();
  if (health.status !== 200) throw new Error(`staging preview health is ${health.status}`);
  if (expected && !String(body.build ?? "").startsWith(expected)) throw new Error(`preview build ${body.build} is not the expected ${expected}`);
  if (body.payments !== "test") throw new Error("refusing: the preview is not in test payments mode");
  for (const name of profiles) {
    if (!PROFILES[name]) throw new Error(`unknown profile ${name}`);
    try {
      await reviewProfile(name);
    } catch (error) {
      failures.push(`${name}: ${redact(error instanceof Error ? error.message : String(error)).split("\n")[0]}`);
    }
  }
  const left = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  evidence.syntheticAccountsLeft = (left.data?.users ?? []).filter((user) => user.email?.startsWith(`ads-review-${run}-`)).length;
  if (evidence.syntheticAccountsLeft !== 0) failures.push("synthetic accounts left behind");
  exitCode = failures.length === 0 ? 0 : 1;
} catch (error) {
  failures.push(redact(error instanceof Error ? error.message : String(error)).split("\n")[0]);
}
evidence.failures = failures;
evidence.result = exitCode === 0 ? "PASS" : "FAIL";
console.log(redact(JSON.stringify(evidence, null, 2)));
process.exitCode = exitCode;
