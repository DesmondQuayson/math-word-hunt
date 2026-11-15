/**
 * The ShowMe Math access pass: hosted STAGING review.
 *
 * Launched by scripts/invoke-showme-pass-staging.ps1 against a
 * mathnexa-platform-staging preview. It checks, on a real deployment, what
 * /map-prep/pass does for each kind of visitor (docs/showme-access-gate.md):
 *
 *   - no session: the ordinary access page, no pass;
 *   - a signed-in account without access: the subscription page, no pass, and
 *     the ShowMe page that was asked for is remembered;
 *   - the same account once it has a trial: a pass, signed with the preview's
 *     secret, and a redirect to the remembered ShowMe page;
 *   - no address in the request can send the pass or the visitor off ShowMe.
 *
 * The redirects are read without being followed, so the review never opens
 * ShowMe and never leaves the preview.
 *
 * One synthetic account per profile (`showme-pass-review-*@example.invalid`),
 * deleted afterwards. Prints redacted JSON evidence; secrets never reach stdout.
 */
import { createHmac, randomBytes } from "node:crypto";

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
const passSecret = (process.env.SHOWME_STAGING_PASS_SECRET ?? "").trim();
if (secretKey.length < 20 || publishableKey.length < 20 || bypass.length < 20 || passSecret.length < 32) throw new Error("missing staging entries");
const profiles = (process.env.REVIEW_PROJECTS || "chromium,webkit").split(",").map((name) => name.trim()).filter(Boolean);

const supabaseUrl = `https://${STAGING_PROJECT_REF}.supabase.co`;
const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const protection = createProtectionBypass({ origin, secret: bypass });
const run = randomBytes(4).toString("hex");
const secrets = [secretKey, publishableKey, bypass, passSecret];
const redact = (text) => secrets.reduce((value, secret) => value.split(secret).join("[redacted]"), protection.redact(String(text)));

const PROFILES = {
  chromium: { engine: chromium, options: devices["Desktop Chrome"] },
  webkit: { engine: webkit, options: devices["Desktop Safari"] },
  "mobile-chrome": { engine: chromium, options: devices["Pixel 7"] },
  "mobile-safari": { engine: webkit, options: devices["iPhone 14"] }
};

const evidence = { origin, run, startedAt: new Date().toISOString(), profiles: {} };
const failures = [];
function check(profile, name, condition, detail) {
  const entry = evidence.profiles[profile] ??= { checks: {} };
  entry.checks[name] = condition ? "pass" : `FAIL${detail === undefined ? "" : `: ${redact(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)}`}`;
  if (!condition) failures.push(`${profile}: ${name}`);
}

const PASS = "mathnexa-showme-pass";
const RETURN = "mathnexa-showme-return";
const setCookies = (response) => response.headersArray().filter((header) => header.name.toLowerCase() === "set-cookie").flatMap((header) => header.value.split("\n"));
const mask = (value) => String(value ?? "").replace(/=[A-Za-z0-9_.-]{20,}/g, "=[value]");
const pathOf = (location) => {
  try {
    const url = new URL(location, origin);
    return url.origin === origin ? `${url.pathname}${url.search}` : url.toString();
  } catch {
    return String(location);
  }
};

async function reviewProfile(name) {
  const { engine, options } = PROFILES[name];
  const browser = await engine.launch();
  const account = { email: `showme-pass-review-${run}-${name.replace(/[^a-z]/g, "")}@example.invalid`, password: `${randomBytes(18).toString("base64url")}Aa1!` };
  let userId = null;
  try {
    // --- 1. No session: the ordinary access page, and no pass.
    {
      const context = await browser.newContext({ ...options });
      await protection.install(context);
      const answer = await context.request.get(`${origin}/map-prep/pass?to=${encodeURIComponent("/grades/6")}`, { maxRedirects: 0 });
      check(name, "a visitor with no session is sent to the access page", answer.status() === 307 && pathOf(answer.headers().location) === "/access?next=/map-prep", `${answer.status()} ${pathOf(answer.headers().location)}`);
      check(name, "and is given no pass", !setCookies(answer).some((value) => value.startsWith(`${PASS}=`)) && !(await context.cookies(origin)).some((cookie) => cookie.name === PASS));
      check(name, "the answer is not cached and not indexed", /no-store/.test(answer.headers()["cache-control"] ?? ""), answer.headers()["cache-control"]);
      await context.close();
    }

    // --- 2. A signed-in account with no trial and no subscription.
    const created = await admin.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true, user_metadata: { synthetic_run_id: run, purpose: "showme-pass-staging-review" } });
    if (created.error || !created.data.user) throw new Error("synthetic-user-failed");
    userId = created.data.user.id;
    const context = await browser.newContext({ ...options });
    await protection.install(context);
    const session = await sessionCookies(supabaseUrl, publishableKey, account.email, account.password);
    await context.addCookies(session.cookies.map((cookie) => ({ ...cookie, url: origin, httpOnly: false, secure: true, sameSite: "Lax" })));
    const assignment = "/assignment?a=review-token_1.x";
    const refused = await context.request.get(`${origin}/map-prep/pass?to=${encodeURIComponent(assignment)}`, { maxRedirects: 0 });
    check(name, "a signed-in account without access is sent to subscribe", refused.status() === 307 && pathOf(refused.headers().location) === "/subscription?next=/map-prep", `${refused.status()} ${pathOf(refused.headers().location)}`);
    check(name, "and is given no pass", !setCookies(refused).some((value) => value.startsWith(`${PASS}=`)) && !(await context.cookies(origin)).some((cookie) => cookie.name === PASS));
    const remembered = setCookies(refused).find((value) => value.startsWith(`${RETURN}=`)) ?? "";
    check(name, "the page it asked for is remembered for half an hour, out of reach of page scripts", /^mathnexa-showme-return=[A-Za-z0-9_.-]+; Path=\/map-prep; Expires=[^;]+; Max-Age=1800; Secure; HttpOnly; SameSite=lax$/i.test(remembered), mask(remembered));

    // --- 3. The account starts its trial (stood in for at the database, as the entitlement tests do).
    const startsAt = new Date();
    const redeemed = await admin.from("consumer_accounts").update({ trial_redeemed_at: startsAt.toISOString() }).eq("user_id", userId);
    const entitlement = await admin.from("consumer_game_entitlements").insert({ user_id: userId, entitlement_state: "trial-active", trial_started_at: startsAt.toISOString(), trial_ends_at: new Date(startsAt.getTime() + 24 * 60 * 60 * 1000).toISOString() });
    if (redeemed.error || entitlement.error) throw new Error(`entitlement-fixture-failed:${redeemed.error?.message ?? entitlement.error?.message}`);

    // Coming back by way of the ShowMe home page, as MathNexa's own entry sends it.
    const granted = await context.request.get(`${origin}/map-prep/pass?to=/`, { maxRedirects: 0 });
    check(name, "with a trial, it is sent to the ShowMe page it first asked for", granted.status() === 307 && granted.headers().location === `https://showme.mathnexa.com${assignment}`, `${granted.status()} ${granted.headers().location}`);
    const passCookie = setCookies(granted).find((value) => value.startsWith(`${PASS}=`)) ?? "";
    check(name, "the pass cookie is HttpOnly, Secure, SameSite=Lax, twelve hours, on this host only", /^mathnexa-showme-pass=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+; Path=\/; Expires=[^;]+; Max-Age=43200; Secure; HttpOnly; SameSite=lax$/i.test(passCookie), mask(passCookie));
    const stored = (await context.cookies(origin)).find((cookie) => cookie.name === PASS);
    const [body = "", signature = ""] = (stored?.value ?? "").split(".");
    check(name, "the pass is signed with this deployment's secret", body.length > 0 && createHmac("sha256", passSecret).update(body).digest("base64url") === signature);
    let payload = null;
    try { payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); } catch { /* reported below */ }
    check(name, "the pass holds a version and two times twelve hours apart, and nothing else", payload && Object.keys(payload).sort().join("|") === "exp|iat|v" && payload.v === 1 && payload.exp - payload.iat === 43_200 && Math.abs(payload.iat - Date.now() / 1000) < 300, payload);
    check(name, "nothing about the account is in the pass", !(stored?.value ?? "").includes(userId) && !Buffer.from(body, "base64url").toString("utf8").includes("@"));
    check(name, "the remembered page is forgotten once used", !(await context.cookies(`${origin}/map-prep/pass`)).some((cookie) => cookie.name === RETURN));
    check(name, "the answer is not cached", /no-store/.test(granted.headers()["cache-control"] ?? ""), granted.headers()["cache-control"]);

    // --- 4. Where a visitor with access can be sent.
    const deep = await context.request.get(`${origin}/map-prep/pass?to=${encodeURIComponent("/grades/6")}`, { maxRedirects: 0 });
    check(name, "to the page asked for", deep.headers().location === "https://showme.mathnexa.com/grades/6", deep.headers().location);
    const staging = await context.request.get(`${origin}/map-prep/pass?to=${encodeURIComponent("/worksheets")}&site=staging`, { maxRedirects: 0 });
    check(name, "to the ShowMe staging copy only when it is named", staging.headers().location === "https://showme-staging.mathnexa.com/worksheets", staging.headers().location);
    const strays = [];
    for (const to of ["//evil.example", "https://evil.example/", "/\\evil.example", "/grades#x", "javascript:alert(1)"]) {
      const answer = await context.request.get(`${origin}/map-prep/pass?to=${encodeURIComponent(to)}&site=${encodeURIComponent("https://evil.example")}&next=https://evil.example`, { maxRedirects: 0 });
      let landed = "";
      try { landed = new URL(answer.headers().location).origin; } catch { landed = String(answer.headers().location); }
      if (answer.status() !== 307 || landed !== "https://showme.mathnexa.com") strays.push(`${to} -> ${answer.status()} ${answer.headers().location}`);
    }
    check(name, "never anywhere but ShowMe, whatever the address says", strays.length === 0, strays);

    // --- 5. MathNexa's own entry is unchanged: an account with access is still sent straight on.
    const entry = await context.request.get(`${origin}/worksheets`, { maxRedirects: 0 });
    check(name, "the Worksheet Generator entry still redirects an account with access to ShowMe", entry.status() === 307 && entry.headers().location === "https://showme.mathnexa.com/worksheets", `${entry.status()} ${entry.headers().location}`);
    await context.close();
  } finally {
    if (userId) {
      await admin.from("consumer_game_entitlements").delete().eq("user_id", userId);
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
  evidence.syntheticAccountsLeft = (left.data?.users ?? []).filter((user) => user.email?.startsWith(`showme-pass-review-${run}-`)).length;
  if (evidence.syntheticAccountsLeft !== 0) failures.push("synthetic accounts left behind");
  exitCode = failures.length === 0 ? 0 : 1;
} catch (error) {
  failures.push(redact(error instanceof Error ? error.message : String(error)).split("\n")[0]);
}
evidence.failures = failures;
evidence.result = exitCode === 0 ? "PASS" : "FAIL";
console.log(redact(JSON.stringify(evidence, null, 2)));
process.exitCode = exitCode;
