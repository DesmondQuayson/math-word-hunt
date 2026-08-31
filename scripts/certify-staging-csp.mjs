/**
 * Real-browser CSP and rendering certification against a deployed environment.
 *
 * Loads every reviewed route in a fresh context per engine and reports anything
 * the Content-Security-Policy actually blocked, rather than inferring it from
 * the policy string. A CSP that looks correct in a header dump can still break
 * hydration, styles or the game frame, so this listens for the browser's own
 * `securitypolicyviolation` event plus failed requests and console errors.
 *
 * Usage: node scripts/certify-staging-csp.mjs <baseUrl>
 */
import { chromium, webkit } from "playwright";

const baseUrl = (process.argv[2] ?? "").replace(/\/$/, "");
if (!baseUrl) {
  console.error("usage: node scripts/certify-staging-csp.mjs <baseUrl>");
  process.exit(2);
}

const ROUTES = ["/", "/sign-in", "/sign-up", "/games", "/game-access", "/account", "/pricing", "/subscription"];

// Noise that is not a security finding. Next.js speculatively prefetches the
// routes in the navigation and cancels them on navigation, which surfaces as
// ERR_ABORTED. The marker can appear after `?` or after `&` when the link
// already carries a `next=` parameter.
const IGNORABLE_REQUEST = /[?&]_rsc=/;

async function certify(name, launcher) {
  const browser = await launcher.launch();
  const results = [];
  for (const route of ROUTES) {
    // Fresh context per route: no cookie, no storage, no cache carried over.
    const context = await browser.newContext();
    const page = await context.newPage();
    const violations = [];
    const consoleErrors = [];
    const failedRequests = [];

    await page.addInitScript(() => {
      window.__cspViolations = [];
      document.addEventListener("securitypolicyviolation", (event) => {
        window.__cspViolations.push({
          directive: event.effectiveDirective,
          blocked: String(event.blockedURI).slice(0, 200)
        });
      });
    });

    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text().slice(0, 300));
    });
    page.on("requestfailed", (request) => {
      if (!IGNORABLE_REQUEST.test(request.url())) {
        failedRequests.push(`${request.url().slice(0, 160)} :: ${request.failure()?.errorText ?? "unknown"}`);
      }
    });

    let status = 0;
    let finalUrl = "";
    let redirectLoop = false;
    try {
      const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle", timeout: 45000 });
      status = response?.status() ?? 0;
      finalUrl = page.url();
      // A loop shows up as the browser giving up or bouncing back to the entry.
      redirectLoop = /ERR_TOO_MANY_REDIRECTS/i.test(finalUrl);
    } catch (error) {
      failedRequests.push(`navigation :: ${String(error).slice(0, 200)}`);
    }

    // Give client hydration a beat to run and emit any violation it would cause.
    await page.waitForTimeout(1200);

    const collected = await page.evaluate(() => window.__cspViolations ?? []).catch(() => []);
    violations.push(...collected);

    const rendered = await page.evaluate(() => ({
      hydrated: typeof window !== "undefined" && document.readyState === "complete",
      hasHeader: Boolean(document.querySelector("header")),
      brandText: (document.querySelector("header")?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40),
      hasFaviconLink: Boolean(document.querySelector("link[rel~='icon']")),
      stylesApplied: getComputedStyle(document.body).backgroundColor,
      // A page whose CSS was blocked collapses to the UA default margin.
      bodyHasLayout: document.body.getBoundingClientRect().height > 100,
      scriptCount: document.querySelectorAll("script").length
    })).catch(() => null);

    results.push({ route, status, finalUrl, redirectLoop, violations, consoleErrors, failedRequests, rendered });
    await context.close();
  }
  await browser.close();
  return { engine: name, results };
}

const requested = (process.argv[3] ?? "chromium,webkit").split(",");
const engines = { chromium, webkit };
const report = [];
const unavailable = [];
for (const name of requested) {
  try {
    report.push(await certify(name, engines[name]));
  } catch (error) {
    // One engine failing to launch must not discard another engine's results.
    unavailable.push(`${name}: ${String(error).split("\n")[0].slice(0, 160)}`);
  }
}

let violationTotal = 0;
for (const { engine, results } of report) {
  console.log(`\n===== ${engine.toUpperCase()} =====`);
  for (const r of results) {
    violationTotal += r.violations.length;
    const flags = [];
    if (r.violations.length) flags.push(`CSP-VIOLATIONS=${r.violations.length}`);
    if (r.redirectLoop) flags.push("REDIRECT-LOOP");
    if (r.failedRequests.length) flags.push(`FAILED-REQ=${r.failedRequests.length}`);
    if (r.consoleErrors.length) flags.push(`CONSOLE-ERR=${r.consoleErrors.length}`);
    const render = r.rendered
      ? `hdr=${r.rendered.hasHeader ? "Y" : "N"} icon=${r.rendered.hasFaviconLink ? "Y" : "N"} css=${r.rendered.bodyHasLayout ? "Y" : "N"} js=${r.rendered.scriptCount}`
      : "render=UNAVAILABLE";
    console.log(`${String(r.status).padEnd(3)} ${r.route.padEnd(15)} ${render}  ${flags.join(" ") || "clean"}`);
    for (const v of r.violations) console.log(`      ! CSP ${v.directive} blocked ${v.blocked}`);
    for (const e of r.consoleErrors) console.log(`      - console: ${e}`);
    for (const f of r.failedRequests) console.log(`      - request: ${f}`);
    if (r.rendered?.brandText) console.log(`      brand: "${r.rendered.brandText}"`);
  }
}
for (const line of unavailable) console.log(`\nENGINE UNAVAILABLE — ${line}`);
console.log(`\nENGINES CERTIFIED: ${report.map((r) => r.engine).join(", ") || "none"}`);
console.log(`TOTAL CSP VIOLATIONS: ${violationTotal}`);
process.exit(violationTotal > 0 || report.length === 0 ? 1 : 0);
