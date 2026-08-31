/**
 * Proves the `form-action` directive behaves as intended on the deployed site.
 *
 * The audit added `https://checkout.stripe.com` and `https://billing.stripe.com`
 * to `form-action` because subscribing and opening the billing portal are form
 * submissions whose response redirects off-site, and a bare `'self'` would break
 * them. That claim deserves evidence rather than assertion.
 *
 * Both Stripe requests are intercepted and answered locally, so nothing ever
 * reaches Stripe: CSP is enforced in the renderer before the network layer, so
 * a blocked submission never reaches the interceptor and an allowed one is
 * satisfied without leaving the machine. No charge, no account, no live key.
 *
 * Usage: node scripts/certify-staging-form-action.mjs <baseUrl>
 */
import { chromium } from "playwright";

const baseUrl = (process.argv[2] ?? "").replace(/\/$/, "");
if (!baseUrl) {
  console.error("usage: node scripts/certify-staging-form-action.mjs <baseUrl>");
  process.exit(2);
}

const CASES = [
  { label: "checkout.stripe.com", action: "https://checkout.stripe.com/c/pay/probe", expect: "allowed" },
  { label: "billing.stripe.com", action: "https://billing.stripe.com/p/session/probe", expect: "allowed" },
  { label: "same origin", action: `${baseUrl}/sign-in`, expect: "allowed" },
  { label: "attacker origin", action: "https://exfiltration.example/collect", expect: "blocked" },
  { label: "lookalike stripe host", action: "https://checkout.stripe.com.evil.example/c", expect: "blocked" }
];

const browser = await chromium.launch();
const failures = [];

for (const testCase of CASES) {
  const context = await browser.newContext();
  const page = await context.newPage();

  // Answer every off-origin destination locally. Nothing leaves the machine.
  for (const host of ["https://checkout.stripe.com/**", "https://billing.stripe.com/**", "https://exfiltration.example/**", "https://checkout.stripe.com.evil.example/**"]) {
    await page.route(host, (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<title>intercepted</title>ok" })
    );
  }

  await page.addInitScript(() => {
    window.__formActionBlocked = false;
    document.addEventListener("securitypolicyviolation", (event) => {
      if (event.effectiveDirective === "form-action") window.__formActionBlocked = true;
    });
  });

  await page.goto(`${baseUrl}/sign-in`, { waitUntil: "domcontentloaded" });
  const before = page.url();

  await page.evaluate((action) => {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = action;
    document.body.appendChild(form);
    form.submit();
  }, testCase.action);

  await page.waitForTimeout(2500);

  const blocked = await page.evaluate(() => window.__formActionBlocked === true).catch(() => false);
  const navigated = page.url() !== before;
  // Allowed means the renderer let the submission proceed to the network.
  const verdict = blocked && !navigated ? "blocked" : "allowed";
  const ok = verdict === testCase.expect;
  console.log(`${ok ? "PASS" : "FAIL"}  ${testCase.label.padEnd(22)} expected=${testCase.expect.padEnd(7)} actual=${verdict}`);
  if (!ok) failures.push(`${testCase.label}: expected ${testCase.expect}, got ${verdict}`);

  await context.close();
}

await browser.close();
console.log(`\nFORM-ACTION FAILURES: ${failures.length}`);
for (const f of failures) console.log(`  - ${f}`);
process.exit(failures.length > 0 ? 1 : 0);
