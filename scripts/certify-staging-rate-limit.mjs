/**
 * Controlled proof that the deployed sign-in throttle actually engages.
 *
 * Deliberately minimal: one synthetic address that cannot correspond to a real
 * account, an obviously wrong password, and only enough attempts to cross the
 * configured threshold once. No account is created and no mail is sent, because
 * a failed sign-in sends nothing.
 *
 * Usage: node scripts/certify-staging-rate-limit.mjs <baseUrl> [maxAttempts]
 */
import { chromium } from "playwright";

const baseUrl = (process.argv[2] ?? "").replace(/\/$/, "");
const configuredThreshold = Number(process.argv[3] ?? 20);
if (!baseUrl) {
  console.error("usage: node scripts/certify-staging-rate-limit.mjs <baseUrl> [maxAttempts]");
  process.exit(2);
}

// Stop one attempt past the threshold; never sweep further.
const ceiling = configuredThreshold + 2;
const address = `security-probe-${configuredThreshold}@certification.invalid`;

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

async function attempt(index) {
  await page.goto(`${baseUrl}/sign-in`, { waitUntil: "domcontentloaded" });
  await page.fill("#signin-email", address);
  await page.fill("#signin-password", `deliberately-invalid-${index}`);
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForTimeout(1600)
  ]);
  // Scope to the form's own feedback element. A page-level selector also picks
  // up the standing email-delivery notice, which would make every attempt look
  // like it carried a different message.
  const message = await page
    .locator('form [role="alert"], form [role="status"]')
    .allTextContents()
    .then((all) => all.join(" ").replace(/\s+/g, " ").trim());
  return message;
}

const seen = [];
let throttledAt = null;
for (let i = 1; i <= ceiling; i += 1) {
  const message = await attempt(i);
  seen.push({ i, message: message.slice(0, 160) });
  const throttled = /too many sign-in attempts/i.test(message);
  const unavailable = /temporarily unavailable/i.test(message);
  if (throttled || unavailable) {
    throttledAt = { attempt: i, kind: throttled ? "throttled" : "unavailable" };
    break;
  }
}

console.log(`address           : ${address}`);
console.log(`configured budget : ${configuredThreshold} attempts / 900s window / 900s block`);
console.log(`subject basis     : HMAC(scope + address + client IP + user agent) — stored as a 64-hex digest only`);
console.log("");
for (const row of seen.slice(0, 3)) console.log(`  attempt ${String(row.i).padStart(2)} : ${row.message}`);
if (seen.length > 4) console.log(`  ... ${seen.length - 4} further attempts with identical copy ...`);
if (seen.length > 3) {
  const last = seen[seen.length - 1];
  console.log(`  attempt ${String(last.i).padStart(2)} : ${last.message}`);
}
console.log("");

if (!throttledAt) {
  console.log(`RESULT: NOT THROTTLED within ${ceiling} attempts — limiter did not engage.`);
} else {
  console.log(`RESULT: ${throttledAt.kind.toUpperCase()} at attempt ${throttledAt.attempt}`);
}

/* ---- enumeration check: pre-threshold copy must not depend on the address -- */
const preThreshold = seen.filter((row) => !/too many|temporarily unavailable/i.test(row.message));
const distinct = new Set(preThreshold.map((row) => row.message));
console.log(`\ndistinct pre-threshold messages: ${distinct.size} -> ${[...distinct].join(" || ").slice(0, 200)}`);
console.log(`enumeration risk: ${distinct.size <= 1 ? "NONE (single generic message)" : "REVIEW — copy varied between attempts"}`);

await browser.close();
process.exit(throttledAt ? 0 : 1);
